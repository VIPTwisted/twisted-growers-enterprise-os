-- Employee Hub (src/screens/EmployeeHub.jsx) — real backend for the ONE
-- capability that no existing RPC covers: a headcount summary that includes
-- TERMINATED people. get_roster returns active-assigned staff only, so
-- terminations (people.is_active=false) can never surface through it.
--
-- Everything else on the screen reuses existing live RPCs (no duplication):
--   • roster ...................... get_roster(p_node_ids)
--   • hours / on-shift ............ get_all_time_entries(p_node_ids, from, to)
--   • callouts (30d) .............. forensic_callouts(p_node_ids, from, to)
--   • open disciplinary actions ... get_disciplinary_actions(p_node_ids)
--   • attendance / coverage ....... scope_shifts(p_node_ids)
--   • locations / roles ........... hr_list_nodes / hr_list_roles
--
-- HR brain project: zsmdejhgdyyaakqsjhmk
-- Idempotent: safe to run repeatedly. No new tables — reads existing schema
-- (people, assignments) through a SECURITY DEFINER RPC granted to anon,
-- authenticated, matching the app's pin_login / anon model (RLS-locked tables,
-- definer RPC bypasses RLS).
--
-- Live-schema facts used (verified 2026-07-17 against REST + get_roster):
--   people(id uuid, full_name text, is_active bool)          -- NO node_id, NO hire/term date
--   assignments(person_id, node_id, role_id, effective_from date, effective_to date, status)
--   org_nodes(id, name, tenant_id)   roles(id, name)
-- Separation date is modelled as the assignment's effective_to; probation and
-- "new hire" are derived from the earliest effective_from (real hire date).

create or replace function public.employee_hub_summary(p_node_ids uuid[] default null)
returns jsonb
language sql security definer set search_path = public as $$
  with scoped as (
    select p.id,
           p.full_name,
           p.is_active,
           (select min(a.effective_from) from public.assignments a
              where a.person_id = p.id
                and (p_node_ids is null or a.node_id = any(p_node_ids)))            as first_from,
           (select max(a.effective_to)   from public.assignments a
              where a.person_id = p.id
                and (p_node_ids is null or a.node_id = any(p_node_ids)))            as last_to,
           (select n.name from public.assignments a
              join public.org_nodes n on n.id = a.node_id
              where a.person_id = p.id
                and (p_node_ids is null or a.node_id = any(p_node_ids))
              order by a.effective_from desc nulls last limit 1)                    as node_name,
           (select r.name from public.assignments a
              join public.roles r on r.id = a.role_id
              where a.person_id = p.id
                and (p_node_ids is null or a.node_id = any(p_node_ids))
              order by a.effective_from desc nulls last limit 1)                    as role_name
    from public.people p
    where exists (
      select 1 from public.assignments a
       where a.person_id = p.id
         and (p_node_ids is null or a.node_id = any(p_node_ids))
    )
  )
  select jsonb_build_object(
    'total_active',     (select count(*) from scoped where is_active),
    'new_hires_30d',    (select count(*) from scoped where is_active and first_from >= current_date - 30),
    'on_probation',     (select count(*) from scoped where is_active and first_from >= current_date - 90),
    'terminations_30d', (select count(*) from scoped where not is_active and last_to is not null and last_to >= current_date - 30),
    'terminated',       coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id',        s.id,
                 'full_name', s.full_name,
                 'role_name', coalesce(s.role_name, '—'),
                 'node_name', coalesce(s.node_name, '—'),
                 'status',    'TERMINATED',
                 'effective_to', s.last_to)
               order by s.last_to desc)
        from scoped s
        where not s.is_active and s.last_to is not null and s.last_to >= current_date - 30
      ), '[]'::jsonb)
  );
$$;

grant execute on function public.employee_hub_summary(uuid[]) to anon, authenticated;
