-- Probation Period Tracker backend — HR brain (zsmdejhgdyyaakqsjhmk)
-- Replaces the localStorage + MOCK_ACTIVE/MOCK_COMPLETED sample data in
-- src/screens/Probation.jsx with a real relational table + security-definer RPCs.
-- Idempotent. Access is RPC-only (RLS enabled, no anon table policies).
--
-- Notes on the live schema (verified 2026-07-16 via PostgREST):
--   * HR is single-tenant: tenant_id is derived from org_nodes.
--   * public.people has NO hire_date / role / node_id columns, so a probation
--     record denormalizes employee_name / role / location / hire_date and keeps
--     an OPTIONAL person_id link. location resolves to a node via org_nodes.name.

-- ── table ─────────────────────────────────────────────────────────────────────
create table if not exists public.probation_periods (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  node_id          uuid,
  person_id        uuid,
  employee_name    text not null,
  role             text,
  location         text,
  hire_date        date not null,
  probation_days   int  not null default 90,
  status           text not null default 'on_track',   -- on_track | behind | extended
  milestones       jsonb not null default '{}'::jsonb,  -- { m30:true, training:false, ... }
  notes            text default '',
  extension_days   int,
  extension_reason text,
  outcome          text,        -- NULL = active; Passed | Extended | Terminated
  manager          text,
  decided_by       uuid,
  completed_at     timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_probation_node    on public.probation_periods(node_id);
create index if not exists idx_probation_outcome on public.probation_periods(outcome);

alter table public.probation_periods enable row level security;

-- ── row → client json (field names match what Probation.jsx renders) ──────────
create or replace function public._probation_row_json(r public.probation_periods)
returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id',             r.id,
    'name',           r.employee_name,
    'role',           coalesce(r.role, ''),
    'location',       coalesce(r.location, ''),
    'hireDate',       to_char(r.hire_date, 'YYYY-MM-DD'),
    'probationDays',  r.probation_days,
    'status',         r.status,
    'milestones',     coalesce(r.milestones, '{}'::jsonb),
    'notes',          coalesce(r.notes, ''),
    'outcome',        r.outcome,
    'manager',        coalesce(r.manager, ''),
    'probationEnd',   to_char(r.hire_date + (r.probation_days || ' days')::interval, 'YYYY-MM-DD'),
    'completedAt',    r.completed_at
  );
$$;

-- ── read: active + completed lists + KPI counts ───────────────────────────────
create or replace function public.probation_list(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from public.probation_periods r
    where p_node_ids is null
       or r.node_id is null
       or r.node_id = any(p_node_ids)
  ),
  active as (
    select * from scoped where outcome is null
  ),
  ends as (
    select id, (hire_date + (probation_days || ' days')::interval)::date as end_date, status
    from active
  )
  select jsonb_build_object(
    'active', coalesce((
      select jsonb_agg(public._probation_row_json(a) order by a.hire_date)
      from active a
    ), '[]'::jsonb),
    'completed', coalesce((
      select jsonb_agg(public._probation_row_json(c) order by c.completed_at desc nulls last)
      from scoped c where c.outcome is not null
    ), '[]'::jsonb),
    'kpis', jsonb_build_object(
      'onProbation',     (select count(*) from active),
      'endingThisWeek',  (select count(*) from ends where end_date <= (current_date + 7)),
      'endingThisMonth', (select count(*) from ends where end_date <= (current_date + 30)),
      'extended',        (select count(*) from active where status = 'extended')
    )
  );
$$;
grant execute on function public.probation_list(uuid[]) to anon, authenticated;

-- ── write: add an employee to probation ───────────────────────────────────────
create or replace function public.probation_add(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid; v_node uuid; v_id uuid; v_hire date; v_days int;
begin
  select tenant_id into v_tenant from org_nodes order by tenant_id limit 1;  -- HR single-tenant
  select id into v_node from org_nodes
   where (v_tenant is null or tenant_id = v_tenant)
     and lower(name) = lower(coalesce(p_data->>'location',''))
   limit 1;
  begin v_hire := nullif(p_data->>'hireDate','')::date; exception when others then v_hire := current_date; end;
  if v_hire is null then v_hire := current_date; end if;
  begin v_days := nullif(p_data->>'probationDays','')::int; exception when others then v_days := 90; end;
  if v_days is null or v_days <= 0 then v_days := 90; end if;

  insert into public.probation_periods
    (tenant_id, node_id, person_id, employee_name, role, location, hire_date, probation_days, status,
     created_by)
  values
    (v_tenant, v_node,
     nullif(p_data->>'personId','')::uuid,
     coalesce(nullif(p_data->>'name',''), '(unnamed)'),
     p_data->>'role',
     p_data->>'location',
     v_hire, v_days, 'on_track',
     nullif(p_data->>'actorId','')::uuid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.probation_add(jsonb) to anon, authenticated;

-- ── write: toggle / set a single milestone ────────────────────────────────────
create or replace function public.probation_set_milestone(p_id uuid, p_key text, p_value boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.probation_periods
     set milestones = jsonb_set(coalesce(milestones, '{}'::jsonb), array[p_key], to_jsonb(p_value), true),
         updated_at = now()
   where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.probation_set_milestone(uuid, text, boolean) to anon, authenticated;

-- ── write: save manager notes ─────────────────────────────────────────────────
create or replace function public.probation_save_notes(p_id uuid, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.probation_periods
     set notes = coalesce(p_notes, ''), updated_at = now()
   where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.probation_save_notes(uuid, text) to anon, authenticated;

-- ── write: pass probation ─────────────────────────────────────────────────────
create or replace function public.probation_pass(p_id uuid, p_manager text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.probation_periods
     set outcome = 'Passed', manager = coalesce(nullif(p_manager,''), manager),
         completed_at = now(), updated_at = now()
   where id = p_id and outcome is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found_or_closed'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.probation_pass(uuid, text) to anon, authenticated;

-- ── write: extend probation (stays active, end date pushed out) ───────────────
create or replace function public.probation_extend(p_id uuid, p_days int, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_days int;
begin
  v_days := coalesce(p_days, 30);
  if v_days <= 0 then v_days := 30; end if;
  update public.probation_periods
     set probation_days   = probation_days + v_days,
         status           = 'extended',
         extension_days   = coalesce(extension_days, 0) + v_days,
         extension_reason = coalesce(nullif(p_reason,''), extension_reason),
         updated_at       = now()
   where id = p_id and outcome is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found_or_closed'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.probation_extend(uuid, int, text) to anon, authenticated;

-- ── write: terminate probation ────────────────────────────────────────────────
create or replace function public.probation_terminate(p_id uuid, p_manager text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.probation_periods
     set outcome = 'Terminated', manager = coalesce(nullif(p_manager,''), manager),
         completed_at = now(), updated_at = now()
   where id = p_id and outcome is null;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found_or_closed'); end if;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.probation_terminate(uuid, text) to anon, authenticated;
