-- ─────────────────────────────────────────────────────────────────────────────
-- Benefits screen backend (HR brain: zsmdejhgdyyaakqsjhmk)
-- Replaces the fully fabricated data layer in src/screens/Benefits.jsx with real,
-- per-person benefit elections, beneficiaries, CT paid-leave balances, and drafts.
--
-- Schema reused (confirmed via live introspection):
--   people(id uuid, full_name, is_active, email)
--   assignments(id, person_id uuid, node_id uuid, role_id uuid)
--   org_nodes(id uuid, name, tenant_id uuid, node_type)
--   roles(id uuid, name)
-- Tenant + node for a person are resolved through assignments -> org_nodes,
-- exactly like public.update_employee_wage (wage_history migration).
--
-- Access model: RLS ON, NO permissive policy — reads/writes only via the
-- SECURITY DEFINER RPCs below (granted to anon, authenticated).
-- Idempotent: safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── TABLES ───────────────────────────────────────────────────────────────────
create table if not exists public.benefit_enrollments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  node_id       uuid,
  person_id     uuid not null,
  plan_year     int  not null default extract(year from now())::int,
  health_plan   text,
  dental_plan   text,
  vision_plan   text,
  coverage_type text,
  contrib_pct   numeric not null default 0,
  premium       numeric not null default 0,
  status        text not null default 'ENROLLED',
  effective_date date,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists benefit_enrollments_person_year_uq
  on public.benefit_enrollments(person_id, plan_year);
alter table public.benefit_enrollments enable row level security;

create table if not exists public.benefit_beneficiaries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  enrollment_id uuid references public.benefit_enrollments(id) on delete cascade,
  person_id     uuid not null,
  name          text not null,
  relationship  text,
  dob           date,
  is_primary    boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists benefit_beneficiaries_person_idx
  on public.benefit_beneficiaries(person_id);
alter table public.benefit_beneficiaries enable row level security;

create table if not exists public.benefit_leave_balances (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  node_id          uuid,
  person_id        uuid not null,
  plan_year        int  not null default extract(year from now())::int,
  accrued_hours    numeric not null default 0,
  used_hours       numeric not null default 0,
  ytd_hours_worked numeric not null default 0,
  last_used_date   date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists benefit_leave_person_year_uq
  on public.benefit_leave_balances(person_id, plan_year);
alter table public.benefit_leave_balances enable row level security;

create table if not exists public.benefit_enrollment_drafts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  person_id  uuid not null,
  plan_year  int  not null default (extract(year from now())::int + 1),
  draft      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists benefit_drafts_person_year_uq
  on public.benefit_enrollment_drafts(person_id, plan_year);
alter table public.benefit_enrollment_drafts enable row level security;

-- ── HELPER: resolve (tenant, node) for a person ──────────────────────────────
create or replace function public._benefits_resolve_scope(p_person_id uuid)
returns table(node_id uuid, tenant_id uuid)
language sql security definer set search_path = public as $$
  select a.node_id, n.tenant_id
  from assignments a
  join org_nodes n on n.id = a.node_id
  where a.person_id = p_person_id
  order by a.created_at desc nulls last
  limit 1;
$$;

-- ── READ: one employee's full benefits picture ───────────────────────────────
create or replace function public.benefits_my_summary(p_person_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'enrollment', (
      select to_jsonb(e) from public.benefit_enrollments e
      where e.person_id = p_person_id
      order by e.plan_year desc limit 1
    ),
    'beneficiaries', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.is_primary desc, b.created_at)
      from public.benefit_beneficiaries b
      where b.person_id = p_person_id
        and b.enrollment_id = (
          select e.id from public.benefit_enrollments e
          where e.person_id = p_person_id order by e.plan_year desc limit 1
        )
    ), '[]'::jsonb),
    'leave', (
      select to_jsonb(l) from public.benefit_leave_balances l
      where l.person_id = p_person_id
      order by l.plan_year desc limit 1
    ),
    'draft', (
      select d.draft from public.benefit_enrollment_drafts d
      where d.person_id = p_person_id
      order by d.plan_year desc limit 1
    )
  );
$$;
grant execute on function public.benefits_my_summary(uuid) to anon, authenticated;

-- ── READ: manager benefits roll-up, scoped to node_ids ───────────────────────
create or replace function public.benefits_summary(p_node_ids uuid[])
returns jsonb language sql security definer set search_path = public as $$
  with staff as (
    select distinct on (p.id)
      p.id as person_id, p.full_name,
      coalesce(r.name, 'Associate') as role,
      n.name as location, a.node_id
    from assignments a
    join people p     on p.id = a.person_id and p.is_active is not false
    join org_nodes n  on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where a.node_id = any(p_node_ids)
    order by p.id, a.created_at desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', s.person_id,
    'full_name', s.full_name,
    'role',      s.role,
    'location',  s.location,
    'health',    e.health_plan,
    'dental',    e.dental_plan,
    'vision',    e.vision_plan,
    'coverage',  e.coverage_type,
    'contrib',   coalesce(e.contrib_pct, 0),
    'status',    coalesce(e.status, 'NOT ENROLLED'),
    'leave_remaining', coalesce(l.accrued_hours,0) - coalesce(l.used_hours,0)
  ) order by s.full_name), '[]'::jsonb)
  from staff s
  left join lateral (
    select * from public.benefit_enrollments e
    where e.person_id = s.person_id order by e.plan_year desc limit 1
  ) e on true
  left join lateral (
    select * from public.benefit_leave_balances l
    where l.person_id = s.person_id order by l.plan_year desc limit 1
  ) l on true;
$$;
grant execute on function public.benefits_summary(uuid[]) to anon, authenticated;

-- ── READ: manager CT paid-leave roll-up, scoped to node_ids ──────────────────
create or replace function public.benefits_leave_summary(p_node_ids uuid[])
returns jsonb language sql security definer set search_path = public as $$
  with staff as (
    select distinct on (p.id)
      p.id as person_id, p.full_name,
      coalesce(r.name, 'Associate') as role,
      n.name as location, a.node_id
    from assignments a
    join people p     on p.id = a.person_id and p.is_active is not false
    join org_nodes n  on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where a.node_id = any(p_node_ids)
    order by p.id, a.created_at desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', s.person_id,
    'full_name', s.full_name,
    'role',      s.role,
    'location',  s.location,
    'accrued',   coalesce(l.accrued_hours, 0),
    'used',      coalesce(l.used_hours, 0),
    'remaining', coalesce(l.accrued_hours,0) - coalesce(l.used_hours,0),
    'ytd_hours', coalesce(l.ytd_hours_worked, 0),
    'last_used', l.last_used_date
  ) order by s.full_name), '[]'::jsonb)
  from staff s
  left join lateral (
    select * from public.benefit_leave_balances l
    where l.person_id = s.person_id order by l.plan_year desc limit 1
  ) l on true;
$$;
grant execute on function public.benefits_leave_summary(uuid[]) to anon, authenticated;

-- ── WRITE: save an enrollment draft (replaces localStorage draft) ─────────────
create or replace function public.benefits_save_draft(
  p_person_id uuid, p_draft jsonb, p_plan_year int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_year int;
begin
  select node_id, tenant_id into v_node, v_tenant from public._benefits_resolve_scope(p_person_id);
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by created_at limit 1;
  end if;
  if v_tenant is null then raise exception 'No tenant resolvable for person %', p_person_id; end if;
  v_year := coalesce(p_plan_year, extract(year from now())::int + 1);

  insert into public.benefit_enrollment_drafts(tenant_id, person_id, plan_year, draft, updated_at)
  values (v_tenant, p_person_id, v_year, coalesce(p_draft,'{}'::jsonb), now())
  on conflict (person_id, plan_year)
  do update set draft = excluded.draft, updated_at = now();

  return jsonb_build_object('ok', true, 'plan_year', v_year);
end; $$;
grant execute on function public.benefits_save_draft(uuid, jsonb, int) to anon, authenticated;

-- ── WRITE: submit an enrollment (upserts elections + beneficiaries) ───────────
create or replace function public.benefits_submit_enrollment(
  p_person_id uuid,
  p_health text, p_dental text, p_vision text, p_coverage text,
  p_contrib numeric, p_premium numeric,
  p_beneficiaries jsonb default '[]'::jsonb,
  p_plan_year int default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_node uuid; v_tenant uuid; v_year int; v_enroll uuid; v_status text; b jsonb;
begin
  select node_id, tenant_id into v_node, v_tenant from public._benefits_resolve_scope(p_person_id);
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by created_at limit 1;
  end if;
  if v_tenant is null then raise exception 'No tenant resolvable for person %', p_person_id; end if;
  v_year := coalesce(p_plan_year, extract(year from now())::int + 1);

  v_status := case
    when coalesce(p_health,'Waived')='Waived' and coalesce(p_dental,'Waived')='Waived'
         and coalesce(p_vision,'Waived')='Waived' and coalesce(p_contrib,0)=0 then 'WAIVED'
    else 'ENROLLED' end;

  insert into public.benefit_enrollments(
    tenant_id, node_id, person_id, plan_year,
    health_plan, dental_plan, vision_plan, coverage_type,
    contrib_pct, premium, status, effective_date, submitted_at, updated_at)
  values (
    v_tenant, v_node, p_person_id, v_year,
    p_health, p_dental, p_vision, p_coverage,
    coalesce(p_contrib,0), coalesce(p_premium,0), v_status,
    make_date(v_year, 1, 1), now(), now())
  on conflict (person_id, plan_year) do update set
    health_plan = excluded.health_plan, dental_plan = excluded.dental_plan,
    vision_plan = excluded.vision_plan, coverage_type = excluded.coverage_type,
    contrib_pct = excluded.contrib_pct, premium = excluded.premium,
    status = excluded.status, effective_date = excluded.effective_date,
    submitted_at = now(), updated_at = now()
  returning id into v_enroll;

  delete from public.benefit_beneficiaries where enrollment_id = v_enroll;
  if p_beneficiaries is not null then
    for b in select * from jsonb_array_elements(p_beneficiaries) loop
      if coalesce(b->>'name','') <> '' then
        insert into public.benefit_beneficiaries(
          tenant_id, enrollment_id, person_id, name, relationship, dob, is_primary)
        values (
          v_tenant, v_enroll, p_person_id,
          b->>'name', b->>'relationship',
          nullif(b->>'dob','')::date,
          coalesce((b->>'is_primary')::boolean, true));
      end if;
    end loop;
  end if;

  -- elections submitted → clear the working draft
  delete from public.benefit_enrollment_drafts where person_id = p_person_id and plan_year = v_year;

  return jsonb_build_object('ok', true, 'enrollment_id', v_enroll, 'plan_year', v_year, 'status', v_status);
end; $$;
grant execute on function public.benefits_submit_enrollment(uuid, text, text, text, text, numeric, numeric, jsonb, int) to anon, authenticated;

-- ── WRITE: change 401k contribution rate on the current enrollment ────────────
create or replace function public.benefits_set_contribution(
  p_person_id uuid, p_contrib numeric
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_year int; v_enroll uuid;
begin
  select id, plan_year into v_enroll, v_year from public.benefit_enrollments
  where person_id = p_person_id order by plan_year desc limit 1;

  if v_enroll is null then
    select node_id, tenant_id into v_node, v_tenant from public._benefits_resolve_scope(p_person_id);
    if v_tenant is null then
      select tenant_id into v_tenant from public.org_nodes order by created_at limit 1;
    end if;
    if v_tenant is null then raise exception 'No tenant resolvable for person %', p_person_id; end if;
    v_year := extract(year from now())::int;
    insert into public.benefit_enrollments(
      tenant_id, node_id, person_id, plan_year, contrib_pct, status, effective_date, updated_at)
    values (v_tenant, v_node, p_person_id, v_year, coalesce(p_contrib,0),
            case when coalesce(p_contrib,0) > 0 then 'ENROLLED' else 'WAIVED' end,
            make_date(v_year,1,1), now())
    returning id into v_enroll;
  else
    update public.benefit_enrollments
      set contrib_pct = coalesce(p_contrib,0), updated_at = now()
      where id = v_enroll;
  end if;

  return jsonb_build_object('ok', true, 'enrollment_id', v_enroll, 'contrib_pct', coalesce(p_contrib,0));
end; $$;
grant execute on function public.benefits_set_contribution(uuid, numeric) to anon, authenticated;
