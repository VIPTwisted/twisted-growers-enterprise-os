-- Reports screen (src/screens/Reports.jsx) — real-data wiring.
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Reports screen previously rendered a large fabricated dataset
-- (MOCK_EMP + buildMockData + ctSeed). It is now wired ENTIRELY to real
-- backend objects. Every dataset it shows already has an existing RPC and
-- this migration adds nothing for those (reused, not duplicated):
--
--   Roster / headcount / wages ....... get_roster(uuid[])
--   Attendance incidents (dates) ..... get_attendance_overview(uuid[])
--   Callout forensics (reasons) ...... forensic_callouts(uuid[],date,date)
--   Hours / payroll .................. get_all_time_entries(uuid[],date,date)
--   Training compliance matrix ....... hr_training_overview(uuid[])
--   Performance reviews .............. get_reviews_detailed(uuid[])
--   Disciplinary actions ............. get_disciplinary_actions(uuid[])
--   CT paid-leave accrual/usage ...... benefits_leave_summary(uuid[])
--
-- The ONE gap: there is no existing RPC that returns the full time-off
-- request HISTORY (approved / denied / pending / cancelled) with employee,
-- role and location names for a date range. The Requests screen read the
-- table directly (works only while RLS is open; the fortress campaign will
-- lock time_off_requests). This migration adds that read as a proper
-- SECURITY DEFINER RPC so Reports keeps working after lockdown.
--
-- Real columns reused (verified against sibling migrations 2026-07-17):
--   time_off_requests(id, person_id, node_id, type, start_date, end_date,
--                     total_days, notes, status, created_at)
--   people(id, full_name, is_active) / org_nodes(id, name)
--   assignments(person_id, node_id, role_id, effective_from) / roles(id, name)
--
-- Idempotent. No new tables. No fake rows. Read-only. RLS on the underlying
-- table is untouched (definer function bypasses it, matching the app's
-- pin_login / anon model).

create or replace function public.get_time_off_report(
  p_node_ids  uuid[],
  p_date_from date default null,
  p_date_to   date default null
) returns jsonb
language sql stable security definer set search_path = public as $$
  with scoped as (
    select
      t.id,
      t.person_id,
      t.node_id,
      coalesce(nullif(btrim(t.type), ''), 'PTO')      as type,
      t.start_date,
      t.end_date,
      coalesce(t.total_days, greatest(1, (coalesce(t.end_date, t.start_date) - t.start_date) + 1)) as days,
      coalesce(nullif(btrim(t.status), ''), 'pending') as status,
      coalesce(t.start_date, t.created_at::date)       as request_date,
      t.created_at
    from time_off_requests t
    where (p_node_ids is null or array_length(p_node_ids, 1) is null or t.node_id = any(p_node_ids))
      and (p_date_from is null or coalesce(t.start_date, t.created_at::date) >= p_date_from)
      and (p_date_to   is null or coalesce(t.start_date, t.created_at::date) <= p_date_to)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           s.id,
    'person_id',    s.person_id,
    'name',         coalesce(nullif(btrim(p.full_name), ''), '—'),
    'role',         coalesce(r.name, '—'),
    'location',     coalesce(n.name, '—'),
    'type',         s.type,
    'request_date', s.request_date,
    'start_date',   s.start_date,
    'end_date',     s.end_date,
    'days',         s.days,
    'status',       s.status
  ) order by s.request_date desc nulls last, s.created_at desc), '[]'::jsonb)
  from scoped s
  left join people p on p.id = s.person_id
  left join lateral (
    select a.node_id, a.role_id
    from assignments a
    where a.person_id = s.person_id
    order by a.effective_from desc nulls last
    limit 1
  ) la on true
  left join org_nodes n on n.id = coalesce(s.node_id, la.node_id)
  left join roles r on r.id = la.role_id;
$$;

revoke all on function public.get_time_off_report(uuid[], date, date) from public;
grant execute on function public.get_time_off_report(uuid[], date, date) to anon, authenticated;

-- Verify:
-- select public.get_time_off_report(null, null, null);   -- '[]' on an empty tenant (honest zero)
