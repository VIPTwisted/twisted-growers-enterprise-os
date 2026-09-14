-- New Hire Onboarding — real backend for src/screens/Onboarding.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. RLS enabled, no anon policies —
-- all access is through SECURITY DEFINER RPCs granted to anon, authenticated.
--
-- The create path already exists: create_employee(jsonb) inserts a pending
-- record into public.onboarding_hires (see 20260715053500_create_onboarding_hires_and_rpc.sql).
-- What was MISSING was the read side + per-task / per-milestone persistence, so
-- the screen faked its roster (buildMockHires) and stored checklist / milestone
-- progress in localStorage. This migration closes that loop against the SAME
-- onboarding_hires table so create -> read -> update all share one source of truth.
--
-- Reference dropdowns (locations, roles, buddies) reuse EXISTING capabilities:
--   locations -> useScope().locations (org_nodes the session can see)
--   roles     -> hr_list_roles()
--   buddies   -> get_roster(p_node_ids, p_actor)
-- so no new reference tables are introduced.

-- ── Columns the loop needs (additive, safe on the existing table) ────────────
alter table public.onboarding_hires add column if not exists buddy        text;
alter table public.onboarding_hires add column if not exists role_id      uuid;
alter table public.onboarding_hires add column if not exists milestones   jsonb not null default '{}'::jsonb;
alter table public.onboarding_hires add column if not exists completed_at  timestamptz;

create index if not exists onboarding_hires_node_idx   on public.onboarding_hires (node_id);
create index if not exists onboarding_hires_status_idx on public.onboarding_hires (status);

-- ── Read: onboarding roster scoped to the caller's nodes (all when null) ─────
-- Returns one object per hire in the exact shape the UI renders. tasks and
-- milestones are passed through as stored (create_employee writes the full
-- checklist array at intake); the UI falls back to the program template only
-- when a legacy row has no tasks.
create or replace function public.onboarding_list_hires(
  p_node_ids uuid[] default null
) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',             h.id,
    'name',           h.full_name,
    'node_id',        h.node_id,
    'location',       coalesce(n.name, '—'),
    'role',           h.role_label,
    'role_id',        h.role_id,
    'startDate',      h.start_date,
    'payRate',        h.pay_rate,
    'buddy',          h.buddy,
    'email',          h.email,
    'phone',          h.phone,
    'emergencyName',  h.emergency_name,
    'emergencyPhone', h.emergency_phone,
    'tasks',          coalesce(h.tasks, '[]'::jsonb),
    'milestones',     coalesce(h.milestones, '{}'::jsonb),
    'status',         h.status,
    'completedAt',    h.completed_at
  ) order by h.start_date desc nulls last, h.created_at desc), '[]'::jsonb)
  from public.onboarding_hires h
  left join public.org_nodes n on n.id = h.node_id
  where h.status <> 'archived'
    and (p_node_ids is null or array_length(p_node_ids, 1) is null
         or h.node_id = any(p_node_ids) or h.node_id is null);
$$;

-- ── Write: toggle one checklist task on one hire ─────────────────────────────
-- Flips the matching element of the tasks jsonb array, stamps/clears doneAt,
-- and maintains completed_at when the whole checklist reaches 100%.
create or replace function public.onboarding_toggle_task(
  p_hire_id uuid,
  p_task_id text,
  p_done    boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tasks jsonb; v_all_done boolean;
begin
  update public.onboarding_hires
     set tasks = (
       select coalesce(jsonb_agg(
         case when elem->>'id' = p_task_id then
           elem
             || jsonb_build_object('done', p_done)
             || jsonb_build_object('doneAt',
                  case when p_done then to_jsonb(to_char(current_date, 'YYYY-MM-DD'))
                       else 'null'::jsonb end)
         else elem end
       ), '[]'::jsonb)
       from jsonb_array_elements(coalesce(tasks, '[]'::jsonb)) elem
     )
   where id = p_hire_id
   returning tasks into v_tasks;

  if v_tasks is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select bool_and((elem->>'done')::boolean)
    into v_all_done
    from jsonb_array_elements(v_tasks) elem;

  update public.onboarding_hires
     set completed_at = case when v_all_done then coalesce(completed_at, now()) else null end,
         status       = case when v_all_done then 'complete' else 'active' end
   where id = p_hire_id;

  return jsonb_build_object('ok', true, 'all_done', coalesce(v_all_done, false));
end;
$$;

-- ── Write: set one milestone flag on one hire ────────────────────────────────
create or replace function public.onboarding_set_milestone(
  p_hire_id uuid,
  p_item_id text,
  p_done    boolean
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_found uuid;
begin
  update public.onboarding_hires
     set milestones = coalesce(milestones, '{}'::jsonb)
                      || jsonb_build_object(p_item_id, p_done)
   where id = p_hire_id
   returning id into v_found;

  if v_found is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Create: refresh intake to also persist buddy + seed empty milestones ─────
-- Same signature / RETURNS uuid as the existing function so CREATE OR REPLACE
-- succeeds. Adds buddy, role_id resolution, and a clean (empty) milestone map so
-- new hires start honestly at 0% instead of a seeded fake percentage.
create or replace function public.create_employee(p_data jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_tenant uuid; v_node uuid; v_id uuid; v_start date; v_rate numeric; v_role_id uuid;
begin
  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;  -- HR is single-tenant
  select id into v_node from public.org_nodes
   where tenant_id = v_tenant and lower(name) = lower(coalesce(p_data->>'location',''))
   limit 1;
  select id into v_role_id from public.roles
   where lower(name) = lower(coalesce(p_data->>'role',''))
   limit 1;
  begin v_start := nullif(p_data->>'startDate','')::date; exception when others then v_start := null; end;
  begin v_rate  := nullif(p_data->>'payRate','')::numeric; exception when others then v_rate := null; end;

  insert into public.onboarding_hires(
    tenant_id, node_id, full_name, start_date, role_label, role_id, pay_rate,
    buddy, email, phone, emergency_name, emergency_phone, tasks, milestones, raw, status)
  values (
    v_tenant, v_node,
    coalesce(nullif(p_data->>'name',''),'(unnamed)'),
    v_start, p_data->>'role', v_role_id, v_rate,
    nullif(p_data->>'buddy',''),
    p_data->>'email', p_data->>'phone',
    p_data->>'emergencyName', p_data->>'emergencyPhone',
    coalesce(p_data->'tasks', '[]'::jsonb), '{}'::jsonb, p_data, 'active')
  returning id into v_id;
  return v_id;
end; $$;

-- ── Grants (RPC-only access; the table stays RLS-locked) ─────────────────────
grant execute on function public.onboarding_list_hires(uuid[])              to anon, authenticated;
grant execute on function public.onboarding_toggle_task(uuid, text, boolean) to anon, authenticated;
grant execute on function public.onboarding_set_milestone(uuid, text, boolean) to anon, authenticated;
grant execute on function public.create_employee(jsonb)                     to anon, authenticated;
