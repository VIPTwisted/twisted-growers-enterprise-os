-- Rehire Management — real backend for src/screens/Rehires.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- Nothing in the existing schema modelled former-employee separations or rehire
-- cases, so two new tables are introduced. tenant_id is resolved from org_nodes
-- (same convention as cleaning_logs / coaching_log). "Waiting period" is NOT
-- stored — the UI derives it from sep_date vs the configurable waiting period,
-- so a former employee flips from waiting -> eligible automatically over time.

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.hr_separations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid,                       -- last location (org_nodes)
  person_id      uuid,                       -- optional link to people
  employee_name  text not null,
  former_role    text,
  sep_date       date,
  sep_reason     text,
  da_count       int  not null default 0,
  da_severity    text not null default 'None',
  former_manager text,
  prev_training  jsonb not null default '{}'::jsonb,
  -- base eligibility: 'eligible' | 'conditional' | 'not_eligible'
  rehire_status  text not null default 'eligible',
  notes          text,
  orig_hire_date date,
  created_at     timestamptz not null default now()
);

create table if not exists public.hr_rehire_cases (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid,
  separation_id       uuid references public.hr_separations(id) on delete cascade,
  node_id             uuid,
  employee_name       text,
  -- 'APPROVE' | 'CONDITIONAL' | 'DENY' | 'REVIEW'
  decision            text,
  conditions          text,
  decision_notes      text,
  reference_note      text,
  training_credits    jsonb,
  fresh_i9            boolean,
  onboarding_initiated boolean not null default false,
  rehire_date         date,
  -- 'Active' | 'Denied' | 'Pending' | 'Review'
  current_status      text not null default 'Pending',
  orig_hire_date      date,
  sep_date            date,
  decided_by          uuid,
  created_at          timestamptz not null default now()
);

create index if not exists hr_separations_node_idx     on public.hr_separations (node_id);
create index if not exists hr_separations_status_idx    on public.hr_separations (rehire_status);
create index if not exists hr_rehire_cases_sep_idx      on public.hr_rehire_cases (separation_id);
create index if not exists hr_rehire_cases_node_idx     on public.hr_rehire_cases (node_id);

alter table public.hr_separations  enable row level security;
alter table public.hr_rehire_cases enable row level security;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- Former employees scoped to the caller's nodes (or all when p_node_ids is null).
create or replace function public.rehire_list(
  p_node_ids uuid[] default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',             s.id,
    'name',           s.employee_name,
    'role',           s.former_role,
    'node_id',        s.node_id,
    'location',       coalesce(n.name, '—'),
    'sep_date',       s.sep_date,
    'sep_reason',     s.sep_reason,
    'da_count',       s.da_count,
    'da_severity',    s.da_severity,
    'former_manager', s.former_manager,
    'prev_training',  s.prev_training,
    'status',         s.rehire_status,
    'notes',          s.notes,
    'orig_hire_date', s.orig_hire_date
  ) order by s.sep_date desc nulls last), '[]'::jsonb)
  from public.hr_separations s
  left join public.org_nodes n on n.id = s.node_id
  where p_node_ids is null or s.node_id = any(p_node_ids) or s.node_id is null;
$$;

-- Completed rehires (onboarding initiated) scoped to the caller's nodes.
create or replace function public.rehire_rehired_list(
  p_node_ids uuid[] default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',        c.id,
    'name',      c.employee_name,
    'orig_hire', c.orig_hire_date,
    'sep',       c.sep_date,
    'rehire',    c.rehire_date,
    'status',    c.current_status
  ) order by c.rehire_date desc nulls last), '[]'::jsonb)
  from public.hr_rehire_cases c
  where c.onboarding_initiated = true
    and (p_node_ids is null or c.node_id = any(p_node_ids) or c.node_id is null);
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

-- Record a former employee / separation event.
create or replace function public.rehire_add_former(
  p_node_id       uuid,
  p_employee_name text,
  p_former_role   text,
  p_sep_date      date,
  p_sep_reason    text,
  p_da_count      int,
  p_da_severity   text,
  p_former_manager text,
  p_prev_training jsonb,
  p_rehire_status text,
  p_notes         text,
  p_orig_hire_date date
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(btrim(p_employee_name), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id;
  insert into public.hr_separations
    (tenant_id, node_id, employee_name, former_role, sep_date, sep_reason,
     da_count, da_severity, former_manager, prev_training, rehire_status, notes, orig_hire_date)
  values
    (v_tenant, p_node_id, btrim(p_employee_name), p_former_role, p_sep_date, p_sep_reason,
     coalesce(p_da_count, 0), coalesce(nullif(btrim(p_da_severity), ''), 'None'),
     p_former_manager, coalesce(p_prev_training, '{}'::jsonb),
     coalesce(nullif(btrim(p_rehire_status), ''), 'eligible'), p_notes, p_orig_hire_date)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Record an eligibility decision and update the separation's base status.
create or replace function public.rehire_decide(
  p_separation_id uuid,
  p_decision      text,
  p_conditions    text,
  p_decision_notes text,
  p_reference_note text,
  p_actor         uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.hr_separations%rowtype; v_id uuid; v_new_status text; v_case_status text;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if upper(coalesce(p_decision, '')) not in ('APPROVE', 'CONDITIONAL', 'DENY') then
    return jsonb_build_object('ok', false, 'error', 'bad_decision');
  end if;

  v_new_status := case upper(p_decision)
                    when 'DENY'        then 'not_eligible'
                    when 'CONDITIONAL' then 'conditional'
                    else 'eligible' end;
  v_case_status := case upper(p_decision)
                     when 'DENY' then 'Denied' else 'Pending' end;

  update public.hr_separations set rehire_status = v_new_status where id = p_separation_id;

  insert into public.hr_rehire_cases
    (tenant_id, separation_id, node_id, employee_name, decision, conditions,
     decision_notes, reference_note, current_status, orig_hire_date, sep_date, decided_by)
  values
    (s.tenant_id, s.id, s.node_id, s.employee_name, upper(p_decision), p_conditions,
     p_decision_notes, p_reference_note, v_case_status, s.orig_hire_date, s.sep_date, p_actor)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'case_id', v_id, 'status', v_new_status);
end;
$$;

-- Initiate onboarding for the most recent (non-denied) decision on a separation.
create or replace function public.rehire_onboard(
  p_separation_id  uuid,
  p_training_credits jsonb,
  p_fresh_i9       boolean,
  p_actor          uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_case_id uuid; s public.hr_separations%rowtype;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select id into v_case_id
  from public.hr_rehire_cases
  where separation_id = p_separation_id and decision <> 'DENY'
  order by created_at desc limit 1;

  if v_case_id is null then
    -- No prior decision row (direct onboard) — create one as an approval.
    insert into public.hr_rehire_cases
      (tenant_id, separation_id, node_id, employee_name, decision, current_status,
       orig_hire_date, sep_date, decided_by)
    values (s.tenant_id, s.id, s.node_id, s.employee_name, 'APPROVE', 'Pending',
       s.orig_hire_date, s.sep_date, p_actor)
    returning id into v_case_id;
  end if;

  update public.hr_rehire_cases
    set onboarding_initiated = true,
        training_credits     = coalesce(p_training_credits, '{}'::jsonb),
        fresh_i9             = p_fresh_i9,
        rehire_date          = current_date,
        current_status       = 'Active',
        decided_by           = coalesce(decided_by, p_actor)
    where id = v_case_id;

  return jsonb_build_object('ok', true, 'case_id', v_case_id);
end;
$$;

-- Flag an ineligible former employee for HR review.
create or replace function public.rehire_flag_review(
  p_separation_id uuid,
  p_actor         uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.hr_separations%rowtype; v_id uuid;
begin
  select * into s from public.hr_separations where id = p_separation_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  insert into public.hr_rehire_cases
    (tenant_id, separation_id, node_id, employee_name, decision, current_status,
     orig_hire_date, sep_date, decided_by)
  values (s.tenant_id, s.id, s.node_id, s.employee_name, 'REVIEW', 'Review',
     s.orig_hire_date, s.sep_date, p_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'case_id', v_id);
end;
$$;

-- Remove a separation record (and its cases, via cascade).
create or replace function public.rehire_delete_former(
  p_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from public.hr_separations where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Grants (RPC-only access; tables stay RLS-locked) ─────────────────────────

grant execute on function public.rehire_list(uuid[])            to anon, authenticated;
grant execute on function public.rehire_rehired_list(uuid[])    to anon, authenticated;
grant execute on function public.rehire_add_former(uuid, text, text, date, text, int, text, text, jsonb, text, text, date) to anon, authenticated;
grant execute on function public.rehire_decide(uuid, text, text, text, text, uuid)  to anon, authenticated;
grant execute on function public.rehire_onboard(uuid, jsonb, boolean, uuid)         to anon, authenticated;
grant execute on function public.rehire_flag_review(uuid, uuid)                     to anon, authenticated;
grant execute on function public.rehire_delete_former(uuid)                         to anon, authenticated;
