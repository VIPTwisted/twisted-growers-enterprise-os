-- ─────────────────────────────────────────────────────────────────────────────
-- FMLA / Leave of Absence tracker backend (HR brain: zsmdejhgdyyaakqsjhmk)
-- Replaces the fully fabricated data layer in src/screens/FmlaLoa.jsx
-- (seed()/MOCK_EMPLOYEES/MOCK_LEAVES_INIT/MOCK_PENDING_INIT + local-state writes)
-- with real, per-person leave cases, pending requests, and live FMLA eligibility.
--
-- Schema reused (confirmed via existing migrations / live introspection):
--   people(id uuid, full_name, is_active, email)
--   assignments(id, person_id uuid, node_id uuid, role_id uuid, created_at)
--   org_nodes(id uuid, name, tenant_id uuid, node_type)
--   roles(id uuid, name)
--   time_punches(person_id, node_id, work_date, hours_worked,
--                punched_in_at, punched_out_at)   -- YTD hours source
--   benefit_leave_balances(person_id, plan_year, accrued_hours, used_hours)
--                                                 -- CT paid-leave accrual source
-- Node/tenant for a person resolved through assignments -> org_nodes, exactly
-- like public.benefits_* (create_benefits_backend migration).
--
-- Access model: RLS ON, NO permissive policy — reads/writes only via the
-- SECURITY DEFINER RPCs below (granted to anon, authenticated).
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── TABLES ───────────────────────────────────────────────────────────────────
create table if not exists public.leave_cases (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  node_id           uuid,
  person_id         uuid not null,
  leave_type        text not null default 'FMLA',
  start_date        date,
  expected_return   date,
  actual_return     date,
  status            text not null default 'UPCOMING',   -- ACTIVE/RETURNED/OVERDUE/UPCOMING
  fmla_eligible     boolean not null default false,
  intermittent      boolean not null default false,
  medical_clearance boolean not null default false,
  notes             text,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists leave_cases_node_idx   on public.leave_cases(node_id);
create index if not exists leave_cases_person_idx on public.leave_cases(person_id);
alter table public.leave_cases enable row level security;

create table if not exists public.leave_requests (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  node_id           uuid,
  person_id         uuid,
  leave_type        text not null default 'FMLA',
  requested_start   date,
  requested_end     date,
  reason            text,
  docs_uploaded     boolean not null default false,
  status            text not null default 'PENDING',    -- PENDING/APPROVED/DENIED/MORE_INFO
  decided_at        timestamptz,
  decided_by        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists leave_requests_node_idx   on public.leave_requests(node_id);
create index if not exists leave_requests_status_idx on public.leave_requests(status);
alter table public.leave_requests enable row level security;

-- ── HELPER: resolve (node, tenant) for a person ──────────────────────────────
create or replace function public._leave_resolve_scope(p_person_id uuid)
returns table(node_id uuid, tenant_id uuid)
language sql security definer set search_path = public as $$
  select a.node_id, n.tenant_id
  from assignments a
  join org_nodes n on n.id = a.node_id
  where a.person_id = p_person_id
  order by a.created_at desc nulls last
  limit 1;
$$;

-- ── HELPER: YTD hours worked for a person (real time_punches) ─────────────────
create or replace function public._leave_ytd_hours(p_person_id uuid)
returns numeric language sql security definer set search_path = public as $$
  select coalesce(sum(
           coalesce(tp.hours_worked,
                    extract(epoch from (tp.punched_out_at - tp.punched_in_at)) / 3600.0)
         ), 0)::numeric
  from time_punches tp
  where tp.person_id = p_person_id
    and tp.work_date >= date_trunc('year', now())::date
    and (tp.hours_worked is not null or tp.punched_out_at is not null);
$$;

-- ── HELPER: live display status for a non-returned case ──────────────────────
create or replace function public._leave_display_status(
  p_status text, p_start date, p_expected date, p_actual date
) returns text language sql stable as $$
  select case
    when p_actual is not null then 'RETURNED'
    when upper(coalesce(p_status,'')) = 'RETURNED' then 'RETURNED'
    when p_start is not null and p_start > current_date then 'UPCOMING'
    when p_expected is not null and p_expected < current_date then 'OVERDUE'
    else 'ACTIVE'
  end;
$$;

-- ── READ: leave records scoped to node_ids ───────────────────────────────────
create or replace function public.fmla_cases(p_node_ids uuid[])
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',                c.id,
    'employeeId',        c.person_id,
    'employeeName',      coalesce(p.full_name, '—'),
    'location',          coalesce(n.name, '—'),
    'type',              c.leave_type,
    'startDate',         c.start_date,
    'expectedReturn',    c.expected_return,
    'actualReturn',      c.actual_return,
    'status',            public._leave_display_status(c.status, c.start_date, c.expected_return, c.actual_return),
    'fmlaEligible',      c.fmla_eligible,
    'intermittent',      c.intermittent,
    'medicalClearance',  c.medical_clearance,
    'notes',             coalesce(c.notes, '')
  ) order by c.start_date desc nulls last, c.created_at desc), '[]'::jsonb)
  from public.leave_cases c
  left join people    p on p.id = c.person_id
  left join org_nodes n on n.id = c.node_id
  where p_node_ids is null or c.node_id = any(p_node_ids);
$$;
grant execute on function public.fmla_cases(uuid[]) to anon, authenticated;

-- ── READ: pending requests + decided history scoped to node_ids ──────────────
create or replace function public.fmla_requests(p_node_ids uuid[])
returns jsonb language sql security definer set search_path = public as $$
  with rows as (
    select r.*,
           coalesce(p.full_name, '—') as employee_name,
           coalesce(n.name, '—')      as location
    from public.leave_requests r
    left join people    p on p.id = r.person_id
    left join org_nodes n on n.id = r.node_id
    where p_node_ids is null or r.node_id = any(p_node_ids)
  )
  select jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             id,
        'employeeName',   employee_name,
        'location',       location,
        'requestedStart', requested_start,
        'requestedEnd',   requested_end,
        'type',           leave_type,
        'reason',         coalesce(reason, ''),
        'docsUploaded',   docs_uploaded,
        'status',         'PENDING'
      ) order by created_at desc)
      from rows where status = 'PENDING'), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',             id,
        'employeeName',   employee_name,
        'location',       location,
        'requestedStart', requested_start,
        'requestedEnd',   requested_end,
        'type',           leave_type,
        'status',         status,
        'decidedAt',      decided_at
      ) order by decided_at desc nulls last)
      from rows where status <> 'PENDING'), '[]'::jsonb)
  );
$$;
grant execute on function public.fmla_requests(uuid[]) to anon, authenticated;

-- ── READ: employee roster + live FMLA eligibility scoped to node_ids ─────────
create or replace function public.fmla_eligibility(p_node_ids uuid[], p_threshold int default 1250)
returns jsonb language sql security definer set search_path = public as $$
  with staff as (
    select distinct on (p.id)
      p.id as person_id, p.full_name, n.name as location, a.node_id
    from assignments a
    join people p     on p.id = a.person_id and p.is_active is not false
    join org_nodes n  on n.id = a.node_id
    where p_node_ids is null or a.node_id = any(p_node_ids)
    order by p.id, a.created_at desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',              s.person_id,
    'name',            s.full_name,
    'location',        s.location,
    'ytdHours',        round(public._leave_ytd_hours(s.person_id))::int,
    'eligible',        public._leave_ytd_hours(s.person_id) >= p_threshold,
    'hoursRemaining',  greatest(0, p_threshold - round(public._leave_ytd_hours(s.person_id))::int),
    'ctAccrued',       coalesce((
                          select round(l.accrued_hours - l.used_hours, 1)
                          from public.benefit_leave_balances l
                          where l.person_id = s.person_id
                          order by l.plan_year desc limit 1), 0)
  ) order by s.full_name), '[]'::jsonb)
  from staff s;
$$;
grant execute on function public.fmla_eligibility(uuid[], int) to anon, authenticated;

-- ── WRITE: create a leave case (eligibility computed from real YTD hours) ─────
create or replace function public.fmla_create_case(
  p_person_id uuid, p_leave_type text, p_start date, p_expected_return date,
  p_intermittent boolean default false, p_notes text default null,
  p_threshold int default 1250, p_created_by uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_id uuid; v_elig boolean; v_status text;
begin
  select node_id, tenant_id into v_node, v_tenant from public._leave_resolve_scope(p_person_id);
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by created_at limit 1;
  end if;
  if v_tenant is null then raise exception 'No tenant resolvable for person %', p_person_id; end if;

  v_elig := public._leave_ytd_hours(p_person_id) >= p_threshold;
  v_status := public._leave_display_status('UPCOMING', p_start, p_expected_return, null);

  insert into public.leave_cases(
    tenant_id, node_id, person_id, leave_type, start_date, expected_return,
    status, fmla_eligible, intermittent, notes, created_by)
  values (
    v_tenant, v_node, p_person_id, coalesce(p_leave_type,'FMLA'), p_start, p_expected_return,
    v_status, v_elig, coalesce(p_intermittent,false), p_notes, p_created_by)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.fmla_create_case(uuid, text, date, date, boolean, text, int, uuid) to anon, authenticated;

-- ── WRITE: inline-edit a leave case ──────────────────────────────────────────
create or replace function public.fmla_update_case(
  p_case_id uuid, p_status text default null, p_expected_return date default null,
  p_actual_return date default null, p_medical_clearance boolean default null,
  p_notes text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.leave_cases
     set status            = coalesce(nullif(p_status,''), status),
         expected_return   = coalesce(p_expected_return, expected_return),
         actual_return     = case when p_actual_return is not null then p_actual_return else actual_return end,
         medical_clearance = coalesce(p_medical_clearance, medical_clearance),
         notes             = coalesce(p_notes, notes),
         updated_at        = now()
   where id = p_case_id
   returning id into v_id;
  if v_id is null then raise exception 'Leave case % not found', p_case_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.fmla_update_case(uuid, text, date, date, boolean, text) to anon, authenticated;

-- ── WRITE: mark returned to work ─────────────────────────────────────────────
create or replace function public.fmla_return_to_work(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.leave_cases
     set status = 'RETURNED', actual_return = current_date, updated_at = now()
   where id = p_case_id
   returning id into v_id;
  if v_id is null then raise exception 'Leave case % not found', p_case_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.fmla_return_to_work(uuid) to anon, authenticated;

-- ── WRITE: extend expected return date ───────────────────────────────────────
create or replace function public.fmla_extend(p_case_id uuid, p_expected_return date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  update public.leave_cases
     set expected_return = p_expected_return, updated_at = now()
   where id = p_case_id
   returning id into v_id;
  if v_id is null then raise exception 'Leave case % not found', p_case_id; end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.fmla_extend(uuid, date) to anon, authenticated;

-- ── WRITE: employee/manager submits a leave request for review ───────────────
create or replace function public.fmla_submit_request(
  p_person_id uuid, p_leave_type text, p_start date, p_end date,
  p_reason text default null, p_docs_uploaded boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_id uuid;
begin
  select node_id, tenant_id into v_node, v_tenant from public._leave_resolve_scope(p_person_id);
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by created_at limit 1;
  end if;
  if v_tenant is null then raise exception 'No tenant resolvable for person %', p_person_id; end if;

  insert into public.leave_requests(
    tenant_id, node_id, person_id, leave_type, requested_start, requested_end,
    reason, docs_uploaded, status)
  values (
    v_tenant, v_node, p_person_id, coalesce(p_leave_type,'FMLA'), p_start, p_end,
    p_reason, coalesce(p_docs_uploaded,false), 'PENDING')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.fmla_submit_request(uuid, text, date, date, text, boolean) to anon, authenticated;

-- ── WRITE: review a pending request (APPROVE creates a leave case) ───────────
create or replace function public.fmla_review_request(
  p_request_id uuid, p_action text, p_reviewer_id uuid default null, p_threshold int default 1250
) returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.leave_requests%rowtype; v_status text; v_case uuid; v_elig boolean; v_cstatus text;
begin
  select * into r from public.leave_requests where id = p_request_id;
  if r.id is null then raise exception 'Request % not found', p_request_id; end if;

  v_status := case upper(coalesce(p_action,''))
                when 'APPROVE'   then 'APPROVED'
                when 'DENY'      then 'DENIED'
                when 'MORE_INFO' then 'MORE_INFO'
                else null end;
  if v_status is null then raise exception 'Unknown review action %', p_action; end if;

  if v_status = 'APPROVED' and r.person_id is not null then
    v_elig := public._leave_ytd_hours(r.person_id) >= p_threshold;
    v_cstatus := public._leave_display_status('UPCOMING', r.requested_start, r.requested_end, null);
    insert into public.leave_cases(
      tenant_id, node_id, person_id, leave_type, start_date, expected_return,
      status, fmla_eligible, notes, created_by)
    values (
      r.tenant_id, r.node_id, r.person_id, r.leave_type, r.requested_start, r.requested_end,
      v_cstatus, v_elig, r.reason, p_reviewer_id)
    returning id into v_case;
  end if;

  update public.leave_requests
     set status = v_status, decided_at = now(), decided_by = p_reviewer_id
   where id = p_request_id;

  return jsonb_build_object('ok', true, 'status', v_status, 'case_id', v_case);
end; $$;
grant execute on function public.fmla_review_request(uuid, text, uuid, int) to anon, authenticated;
