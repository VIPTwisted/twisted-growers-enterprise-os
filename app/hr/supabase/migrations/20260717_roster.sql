-- Staff Roster — Turnover report backend for src/screens/Roster.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- The Roster screen's "Turnover" tab previously rendered four hardcoded mock
-- arrays (MONTH_DATA / LOC_TURNOVER / ROLE_TURNOVER / TERMINATION_REASONS) plus
-- invented retention percentages. This migration adds ONE real, scoped RPC that
-- computes turnover from the live workforce tables so the tab shows honest data
-- (and an honest empty state when there are no separations yet).
--
-- All other Roster tabs (Roster / Add Employee / Risk Matrix) and the forensic
-- KPI panel are wired to EXISTING RPCs (get_roster, get_attendance_overview,
-- get_disciplinary_actions, get_performance_reviews, get_training_overview,
-- policies_team_compliance, hr_create_employee, create_disciplinary_action) —
-- no new backend is needed for those.
--
-- Reused, verified live shapes (people has NO node_id; location via assignments):
--   people(id, full_name, is_active)
--   assignments(person_id, node_id, role_id, effective_from)   -- first row = hire
--   org_nodes(id, name, tenant_id)   roles(id, name)
--   hr_separations(node_id, person_id, employee_name, former_role, sep_date, sep_reason)
--
-- Idempotent. RLS stays enabled on every underlying table; access is via this
-- SECURITY DEFINER RPC (search_path pinned), granted to anon + authenticated to
-- match the app's pin_login → anon execution model.

drop function if exists public.get_turnover_report(uuid[]);
create function public.get_turnover_report(p_node_ids uuid[])
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_start date := (date_trunc('month', current_date) - interval '11 months')::date;
  v_out   jsonb;
begin
  if p_node_ids is null or array_length(p_node_ids, 1) is null then
    return jsonb_build_object(
      'monthly', '[]'::jsonb, 'by_location', '[]'::jsonb,
      'by_role', '[]'::jsonb, 'reasons', '[]'::jsonb, 'retention', '[]'::jsonb);
  end if;

  with
  -- Active headcount + current location/role per active person (latest assignment)
  roster as (
    select distinct on (p.id)
      p.id as person_id, a.node_id, coalesce(r.name, '—') as role
    from people p
    join assignments a on a.person_id = p.id and a.node_id = any(p_node_ids)
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true)
    order by p.id, a.effective_from desc nulls last
  ),
  -- Hire event = each person's FIRST assignment start
  hires as (
    select distinct on (a.person_id)
      a.person_id, a.node_id, a.effective_from as hire_date
    from assignments a
    where a.effective_from is not null and a.node_id = any(p_node_ids)
    order by a.person_id, a.effective_from asc
  ),
  seps as (
    select s.person_id, s.node_id, s.former_role, s.sep_date, s.sep_reason
    from hr_separations s
    where s.node_id = any(p_node_ids)
  ),
  months as (
    select generate_series(v_start, date_trunc('month', current_date)::date, interval '1 month')::date as m0
  ),
  hire_m as (
    select date_trunc('month', hire_date)::date as m0, count(*) as hires
    from hires where hire_date >= v_start group by 1
  ),
  sep_m as (
    select date_trunc('month', sep_date)::date as m0, count(*) as terms
    from seps where sep_date is not null and sep_date >= v_start group by 1
  ),
  loc as (
    select n.id, n.name from org_nodes n where n.id = any(p_node_ids)
  ),
  -- Retention: of everyone ever hired into scope, fraction whose tenure reached N days
  tenure as (
    select h.person_id,
           (coalesce(s.sep_date, current_date) - h.hire_date) as days_tenure
    from hires h
    left join lateral (
      select sep_date from seps s
      where s.person_id = h.person_id and s.sep_date is not null
      order by s.sep_date desc limit 1
    ) s on true
  )
  select jsonb_build_object(
    'monthly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m.m0, 'Mon YYYY'),
        'hires', coalesce(hm.hires, 0),
        'terms', coalesce(sm.terms, 0),
        'net',   coalesce(hm.hires, 0) - coalesce(sm.terms, 0)
      ) order by m.m0)
      from months m
      left join hire_m hm on hm.m0 = m.m0
      left join sep_m  sm on sm.m0 = m.m0
    ), '[]'::jsonb),

    'by_location', coalesce((
      select jsonb_agg(jsonb_build_object(
        'loc',       l.name,
        'headcount', (select count(*) from roster r where r.node_id = l.id),
        'hires',     (select count(*) from hires  h where h.node_id = l.id and h.hire_date >= v_start),
        'terms',     (select count(*) from seps   s where s.node_id = l.id and s.sep_date is not null and s.sep_date >= v_start)
      ) order by l.name)
      from loc l
    ), '[]'::jsonb),

    'by_role', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role',  role,
        'count', headcount,
        'terms', terms
      ) order by role)
      from (
        select r.role,
               count(*) as headcount,
               coalesce((select count(*) from seps s
                         where coalesce(s.former_role, '—') = r.role
                           and s.sep_date is not null and s.sep_date >= v_start), 0) as terms
        from roster r group by r.role
      ) rr
    ), '[]'::jsonb),

    'reasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reason', reason,
        'count',  cnt,
        'pct',    round(100.0 * cnt / nullif(total, 0))::int
      ) order by cnt desc)
      from (
        select coalesce(nullif(btrim(sep_reason), ''), 'Unspecified') as reason,
               count(*) as cnt,
               sum(count(*)) over () as total
        from seps
        where sep_date is not null and sep_date >= v_start
        group by 1
      ) x
    ), '[]'::jsonb),

    'retention', coalesce((
      select jsonb_agg(jsonb_build_object('days', d, 'rate', rate, 'n', n) order by d)
      from (
        select 30 as d,
               (select count(*) from tenure)::int as n,
               case when (select count(*) from tenure) > 0
                    then round(100.0 * (select count(*) from tenure where days_tenure >= 30)
                               / (select count(*) from tenure))::int end as rate
        union all
        select 60,
               (select count(*) from tenure)::int,
               case when (select count(*) from tenure) > 0
                    then round(100.0 * (select count(*) from tenure where days_tenure >= 60)
                               / (select count(*) from tenure))::int end
        union all
        select 90,
               (select count(*) from tenure)::int,
               case when (select count(*) from tenure) > 0
                    then round(100.0 * (select count(*) from tenure where days_tenure >= 90)
                               / (select count(*) from tenure))::int end
      ) ret
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end; $$;

grant execute on function public.get_turnover_report(uuid[]) to anon, authenticated;
