-- BP-12g · the six HR screens that still drew seed figures now read live rows (Bible §12g).
-- Owner, 14 Sep 2026: "DYNAMIC NOT HARDWIRED, MAPPED, WIRED, NOTHING STALLED".
-- Every function here is SECURITY DEFINER with the door decided by the caller's reach
-- (hr.assignments → org_nodes ltree), executable by authenticated only, never anon.
-- Where TG's data already lives in the OS (public.employees, employee_rates,
-- employee_department_skill, time_entries, callouts, attendance_occurrences, the TG
-- schedule drafter) the HR reader joins it by the shared person id
-- (hr.people.id = public.employees.id, set by hr.sync_person_from_os).
set search_path = hr, public, extensions;

-- ── reach: a node list expanded to every node beneath it ─────────────────────────────
-- TG assigns people to DEPARTMENT nodes under the one facility; VIP assigned them to the
-- location. A reader that matches node_id = any(p_node_ids) on the location alone reached
-- 11 of 27 people (measured 14 Sep 2026). Readers below scope through this instead.
create or replace function hr.tg_reach_nodes(p_node_ids uuid[])
returns uuid[] language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce(array_agg(distinct n.id), '{}'::uuid[])
  from hr.org_nodes n
  where exists (select 1 from hr.org_nodes s where s.id = any(coalesce(p_node_ids, '{}'::uuid[])) and n.path <@ s.path);
$$;
revoke all on function hr.tg_reach_nodes(uuid[]) from public, anon;
grant execute on function hr.tg_reach_nodes(uuid[]) to authenticated;

-- people in reach, one row each, with their department/location name and role
create or replace function hr.tg_people_in_reach(p_node_ids uuid[], p_actor uuid default null)
returns table(person_id uuid, full_name text, role_name text, node_id uuid, node_name text, since date)
language sql stable security definer set search_path = hr, public, extensions as $$
  select distinct on (p.id) p.id, p.full_name, r.name, a.node_id, n.name, a.effective_from
  from hr.people p
  join hr.assignments a on a.person_id = p.id and a.status = 'active'
  join hr.org_nodes n on n.id = a.node_id
  left join hr.roles r on r.id = a.role_id
  where p.is_active
    and a.node_id = any(hr.tg_reach_nodes(p_node_ids))
    and (p_actor is null or exists (
      select 1 from hr.assignments a2 join hr.org_nodes an on an.id = a2.node_id
      where a2.person_id = p_actor and a2.status = 'active' and n.path <@ an.path))
  order by p.id, a.effective_from desc;
$$;
revoke all on function hr.tg_people_in_reach(uuid[], uuid) from public, anon;
grant execute on function hr.tg_people_in_reach(uuid[], uuid) to authenticated;

-- get_roster: same fix at the source — department assignments count.
create or replace function hr.get_roster(p_node_ids uuid[], p_actor uuid default null)
returns table(id uuid, full_name text, login_id text, is_active boolean, role_name text, node_name text, effective_from date)
language sql stable security definer set search_path = hr, public, extensions as $$
  select distinct on (p.id)
    p.id, p.full_name, p.login_id, p.is_active, r.name as role_name, n.name as node_name, a.effective_from
  from people p
  join assignments a on a.person_id = p.id and a.node_id = any(hr.tg_reach_nodes(p_node_ids))
  join org_nodes n on n.id = a.node_id
  left join roles r on r.id = a.role_id
  where (p_actor is null or exists (
    select 1 from assignments a2 join org_nodes an on an.id = a2.node_id
    where a2.person_id = p_actor and a2.status = 'active' and n.path <@ an.path))
  order by p.id, a.effective_from desc;
$$;

-- ── 1. Compliance & certification expirations ────────────────────────────────────────
create or replace function hr.compliance_expirations(p_node_ids uuid[], p_actor uuid default null)
returns table(id text, person_id uuid, full_name text, node_name text, item text, kind text, expires_on date, source text)
language sql stable security definer set search_path = hr, public, extensions as $$
  with ppl as (select * from hr.tg_people_in_reach(p_node_ids, p_actor))
  select 'cert:' || c.id, c.person_id, pp.full_name, pp.node_name, c.cert_name, 'certification', c.expiry_date, 'hr'
    from hr.employee_certifications c join ppl pp on pp.person_id = c.person_id
   where c.expiry_date is not null and coalesce(c.status, '') not in ('revoked', 'void')
  union all
  select 'training:' || t.id, t.person_id, pp.full_name, pp.node_name, coalesce(t.module, t.category, 'Training'), 'training', t.expires_at, 'hr'
    from hr.training_records t join ppl pp on pp.person_id = t.person_id
   where t.expires_at is not null
  union all
  select 'i9:' || i.id, i.person_id, pp.full_name, pp.node_name, 'I-9 reverification (' || coalesce(i.work_auth_type, 'work authorisation') || ')', 'I-9', i.reverify_date, 'hr'
    from hr.i9_records i join ppl pp on pp.person_id = i.person_id
   where i.reverify_date is not null
  union all
  select 'deadline:' || d.id, null::uuid, coalesce(d.responsible, '—'), n.name, d.requirement, 'deadline', d.due_date, 'hr'
    from hr.compliance_deadlines d join hr.org_nodes n on n.id = d.node_id
   where d.node_id = any(hr.tg_reach_nodes(p_node_ids)) and d.due_date is not null
     and coalesce(d.status, 'open') not in ('done', 'closed', 'complete', 'completed')
  union all
  select 'badge:' || e.id, pp.person_id, pp.full_name, pp.node_name, 'Metrc agent badge ' || coalesce(e.metrc_agent_badge, ''), 'licence', e.badge_expires, 'os'
    from public.employees e join ppl pp on pp.person_id = e.id
   where e.badge_expires is not null
  union all
  select 'skill:' || k.id, pp.person_id, pp.full_name, pp.node_name,
         coalesce(nullif(k.certification, ''), 'Department certification') || ' · ' || coalesce(d.name, ''), 'certification', k.expires, 'os'
    from public.employee_department_skill k join ppl pp on pp.person_id = k.employee_id
    left join public.departments d on d.id = k.department_id
   where k.expires is not null and k.retired_at is null;
$$;
revoke all on function hr.compliance_expirations(uuid[], uuid) from public, anon;
grant execute on function hr.compliance_expirations(uuid[], uuid) to authenticated;

-- ── 2. Flight-risk signals, measured per person ──────────────────────────────────────
-- Every column is a count or a null. Null means "no record of this kind for this person",
-- which the page shows as such; it never fills a blank with a guess.
create or replace function hr.flight_risk_factors(p_node_ids uuid[], p_actor uuid default null)
returns table(person_id uuid, full_name text, role_name text, node_name text,
              callouts_30d int, lates_30d int, open_das int, tenure_months numeric,
              pulse_avg numeric, training_pct numeric, review_days int)
language sql stable security definer set search_path = hr, public, extensions as $$
  with ppl as (select * from hr.tg_people_in_reach(p_node_ids, p_actor)),
  co as (
    select person_id, count(*)::int n from (
      select x.person_id from hr.shift_exceptions x where x.created_at >= now() - interval '30 days'
         and (coalesce(x.type, x.exception_type, '') ilike '%call%')
      union all select e.person_id from hr.attendance_events e where e.event_date >= current_date - 30 and e.type ilike '%call%'
      union all select c.employee_id from public.callouts c where c.work_date >= current_date - 30
    ) u where u.person_id is not null group by person_id),
  la as (
    select person_id, count(*)::int n from (
      select e.person_id from hr.attendance_events e where e.event_date >= current_date - 30 and e.type ilike 'late%'
      union all select i.person_id from hr.attendance_incidents i where i.incident_date >= current_date - 30 and i.incident_type ilike 'late%'
      union all select o.employee_id from public.attendance_occurrences o where o.work_date >= current_date - 30 and o.kind ilike 'late%'
      union all select t.employee_id from public.time_entries t where t.work_date >= current_date - 30 and coalesce(t.late_minutes, 0) > 0
    ) u where u.person_id is not null group by person_id),
  da as (select d.person_id, count(*)::int n from hr.disciplinary_records d
          where coalesce(d.status, 'open') not in ('closed', 'resolved', 'archived', 'void') group by d.person_id),
  pu as (select r.person_id, avg(v.val) av from hr.pulse_responses r
          cross join lateral (select (e.value)::numeric val from jsonb_each_text(coalesce(r.answers, '{}'::jsonb)) e where e.value ~ '^[0-9]+(\.[0-9]+)?$') v
          where r.created_at >= now() - interval '90 days' group by r.person_id),
  tr as (select t.person_id,
                100.0 * count(*) filter (where t.completed_at is not null or coalesce(t.status, '') in ('completed', 'complete', 'passed')) / nullif(count(*), 0) pct
           from hr.training_records t group by t.person_id),
  sk as (select k.employee_id, 100.0 * count(*) filter (where k.level ilike 'trained%' or k.level ilike 'certified%' or k.level ilike 'lead%') / nullif(count(*), 0) pct
           from public.employee_department_skill k where k.retired_at is null group by k.employee_id),
  rv as (select r.person_id, (current_date - max(r.review_date))::int days from hr.performance_reviews r where r.review_date is not null group by r.person_id)
  select pp.person_id, pp.full_name, pp.role_name, pp.node_name,
         coalesce(co.n, 0), coalesce(la.n, 0), coalesce(da.n, 0),
         round((current_date - coalesce(e.hired_on, pp.since)) / 30.44, 1),
         round(pu.av, 2), round(coalesce(tr.pct, sk.pct), 0), rv.days
  from ppl pp
  left join public.employees e on e.id = pp.person_id
  left join co on co.person_id = pp.person_id
  left join la on la.person_id = pp.person_id
  left join da on da.person_id = pp.person_id
  left join pu on pu.person_id = pp.person_id
  left join tr on tr.person_id = pp.person_id
  left join sk on sk.employee_id = pp.person_id
  left join rv on rv.person_id = pp.person_id;
$$;
revoke all on function hr.flight_risk_factors(uuid[], uuid) from public, anon;
grant execute on function hr.flight_risk_factors(uuid[], uuid) to authenticated;

-- ── 3. Labour budget vs actual, per department, for one week ─────────────────────────
-- Hours: hr.shifts (posted here) and the TG drafter's POSTED lines (public.schedule_draft_lines
-- whose draft is posted) are the schedule; hr.time_punches and public.time_entries are the
-- actual. Wage: latest hr.wage_history, else the OS hourly rate. Revenue: hr.financial_facts
-- category 'revenue' for the node in the week — null (not zero) when nothing is recorded.
create or replace function hr.labor_budget(p_node_ids uuid[], p_week_start date default null)
returns table(node_id uuid, node_name text, head int, sched_hrs numeric, actual_hrs numeric, ot_hrs numeric,
              avg_wage numeric, wage_known int, revenue numeric, week_start date)
language sql stable security definer set search_path = hr, public, extensions as $$
  with wk as (select coalesce(p_week_start, date_trunc('week', current_date)::date) ws),
  nodes as (
    select n.id, n.name, (n.config->>'os_department_id')::uuid os_dept
    from hr.org_nodes n where n.id = any(hr.tg_reach_nodes(p_node_ids)) and n.node_type = 'department' and n.is_active),
  ppl as (
    select distinct on (a.person_id) a.person_id, a.node_id
    from hr.assignments a join hr.people p on p.id = a.person_id and p.is_active
    where a.status = 'active' and a.node_id in (select id from nodes) order by a.person_id, a.effective_from desc),
  wage as (
    select pp.person_id, coalesce(w.new_wage, r.rate) w
    from ppl pp
    left join lateral (select new_wage from hr.wage_history h where h.person_id = pp.person_id order by h.effective_date desc limit 1) w on true
    left join lateral (select rate from public.employee_rates r where r.employee_id = pp.person_id and r.basis = 'hourly'
                        and r.effective_from <= current_date and (r.effective_to is null or r.effective_to >= current_date)
                        and not coalesce(r.is_placeholder, false) order by r.effective_from desc limit 1) r on true),
  sched as (
    select person_id, sum(h) h from (
      select s.person_id, extract(epoch from (s.end_time - s.start_time)) / 3600.0 h
        from hr.shifts s, wk where s.person_id is not null and s.shift_date between wk.ws and wk.ws + 6 and coalesce(s.status, '') not in ('cancelled', 'void')
      union all
      select l.employee_id, extract(epoch from (l.planned_end - l.planned_start)) / 3600.0
        from public.schedule_draft_lines l join public.schedule_drafts d on d.id = l.draft_id and d.status = 'posted', wk
       where l.employee_id is not null and l.work_date between wk.ws and wk.ws + 6
    ) u group by person_id),
  actual as (
    select person_id, sum(h) h from (
      select t.person_id, coalesce(t.hours_worked, extract(epoch from (t.punched_out_at - t.punched_in_at)) / 3600.0) h
        from hr.time_punches t, wk where t.work_date between wk.ws and wk.ws + 6
      union all
      select e.employee_id, coalesce(e.productive_hours, extract(epoch from (e.clock_out - e.clock_in)) / 3600.0 - coalesce(e.unpaid_lunch_min, 0) / 60.0)
        from public.time_entries e, wk where e.work_date between wk.ws and wk.ws + 6 and e.clock_out is not null
    ) u group by person_id),
  per as (
    select pp.node_id, pp.person_id, coalesce(s.h, 0) sched, coalesce(a.h, 0) act, greatest(coalesce(a.h, 0) - 40, 0) ot, w.w
    from ppl pp left join sched s on s.person_id = pp.person_id left join actual a on a.person_id = pp.person_id left join wage w on w.person_id = pp.person_id),
  rev as (
    select f.node_id, sum(f.amount) amt from hr.financial_facts f, wk
     where f.category ilike 'revenue' and f.fact_date between wk.ws and wk.ws + 6 group by f.node_id)
  select n.id, n.name, count(per.person_id)::int, round(coalesce(sum(per.sched), 0), 1), round(coalesce(sum(per.act), 0), 1), round(coalesce(sum(per.ot), 0), 1),
         round(avg(per.w), 2), count(per.w)::int, rev.amt, wk.ws
  from nodes n cross join wk left join per on per.node_id = n.id left join rev on rev.node_id = n.id
  group by n.id, n.name, rev.amt, wk.ws order by n.name;
$$;
revoke all on function hr.labor_budget(uuid[], date) from public, anon;
grant execute on function hr.labor_budget(uuid[], date) to authenticated;

-- ── 4. Punch board for the huddle: who is In / Late / Out / Off today ────────────────
create or replace function hr.punch_board(p_node_ids uuid[], p_date date default null)
returns table(person_id uuid, full_name text, node_name text, status text, scheduled boolean, punched_in_at timestamptz, punched_out_at timestamptz, late_minutes int)
language sql stable security definer set search_path = hr, public, extensions as $$
  with d as (select coalesce(p_date, current_date) dt),
  ppl as (select * from hr.tg_people_in_reach(p_node_ids, null)),
  sch as (
    select person_id, min(start_at) start_at from (
      select s.person_id, (s.shift_date + s.start_time)::timestamp at time zone coalesce((select facility_tz from public.scheduling_policy limit 1), 'America/New_York') start_at
        from hr.shifts s, d where s.person_id is not null and s.shift_date = d.dt and coalesce(s.status, '') not in ('cancelled', 'void')
      union all
      select l.employee_id, l.planned_start from public.schedule_draft_lines l join public.schedule_drafts dr on dr.id = l.draft_id and dr.status = 'posted', d
       where l.employee_id is not null and l.work_date = d.dt
    ) u group by person_id),
  pun as (
    select person_id, min(in_at) in_at, max(out_at) out_at, max(late) late from (
      select t.person_id, t.punched_in_at in_at, t.punched_out_at out_at, 0 late from hr.time_punches t, d where t.work_date = d.dt
      union all
      select e.employee_id, e.clock_in, e.clock_out, coalesce(e.late_minutes, 0) from public.time_entries e, d where e.work_date = d.dt
    ) u group by person_id)
  select pp.person_id, pp.full_name, pp.node_name,
         case when pun.in_at is null and sch.person_id is null then 'Off'
              when pun.in_at is null then 'Out'
              when pun.out_at is null and (pun.late > 0 or (sch.start_at is not null and pun.in_at > sch.start_at + interval '5 minutes')) then 'Late'
              when pun.out_at is null then 'In'
              else 'Out' end,
         sch.person_id is not null, pun.in_at, pun.out_at,
         greatest(coalesce(pun.late, 0), case when sch.start_at is not null and pun.in_at > sch.start_at then extract(epoch from (pun.in_at - sch.start_at))::int / 60 else 0 end)
  from ppl pp left join sch on sch.person_id = pp.person_id left join pun on pun.person_id = pp.person_id
  order by pp.full_name;
$$;
revoke all on function hr.punch_board(uuid[], date) from public, anon;
grant execute on function hr.punch_board(uuid[], date) to authenticated;

-- ── 5. The TG drafter, read and driven from the HR platform ──────────────────────────
-- The OS's rule-based drafter (public.f_draft_schedule → schedule_drafts / schedule_draft_lines,
-- validated by f_validate_draft against f_schedule_candidates) IS the scheduler. The HR screen
-- shows its draft for a week, its conflicts with the candidates that would clear them, coverage
-- against zone_staffing_requirements, and the draft history. Generating and fixing run under the
-- caller's own OS role: f_draft_schedule refuses anyone outside the sign-off roles.
create or replace function hr.tg_draft_week(p_week_start date, p_department_id uuid default null, p_generate boolean default false)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_draft public.schedule_drafts%rowtype; v_shifts jsonb; v_stats jsonb; v_req int; v_filled int; v_ws date;
begin
  v_ws := coalesce(p_week_start, date_trunc('week', current_date)::date);
  if p_generate then
    perform public.f_draft_schedule(v_ws, v_ws + 6, p_department_id, 'human', null,
      'HR platform draft ' || v_ws::text || ' → ' || (v_ws + 6)::text || coalesce(' · ' || (select name from public.departments where id = p_department_id), ''));
  end if;
  select * into v_draft from public.schedule_drafts d
   where d.covers_from <= v_ws + 6 and d.covers_to >= v_ws
     and (p_department_id is null or d.department_id = p_department_id or d.department_id is null)
   order by (d.status = 'posted') desc, (d.status = 'draft') desc, d.created_at desc limit 1;
  if v_draft.id is null then
    return jsonb_build_object('draft', null, 'shifts', '[]'::jsonb, 'stats', null, 'week_start', v_ws);
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'line_id', l.id, 'employee_id', l.employee_id, 'emp', coalesce(e.full_name, case when l.is_open_shift then 'OPEN SHIFT' else '—' end),
           'role', coalesce(dp.name, ''), 'date', l.work_date, 'start', to_char(l.planned_start at time zone pol.tz, 'HH24:MI'),
           'end', to_char(l.planned_end at time zone pol.tz, 'HH24:MI'), 'zone', coalesce(z.name, ''), 'loc', coalesce(dp.name, ''),
           'open', l.is_open_shift, 'conflict', l.conflict, 'note', l.note,
           'hours', round(extract(epoch from (l.planned_end - l.planned_start)) / 3600.0, 2),
           'rate', r.rate) order by l.work_date, z.sort_order, l.planned_start, e.full_name), '[]'::jsonb)
    into v_shifts
  from public.schedule_draft_lines l
  cross join (select coalesce((select facility_tz from public.scheduling_policy limit 1), 'America/New_York') tz) pol
  left join public.employees e on e.id = l.employee_id
  left join public.zones z on z.id = l.zone_id
  left join public.departments dp on dp.id = coalesce(l.department_id, z.department_id)
  left join lateral (select rate from public.employee_rates r where r.employee_id = l.employee_id and r.basis = 'hourly'
                       and r.effective_from <= l.work_date and (r.effective_to is null or r.effective_to >= l.work_date)
                       and not coalesce(r.is_placeholder, false) order by r.effective_from desc limit 1) r on true
  where l.draft_id = v_draft.id and l.work_date between v_ws and v_ws + 6;
  -- coverage: requirement cells (zone × day) whose headcount the draft meets
  select count(*), count(*) filter (where q.placed >= q.needed) into v_req, v_filled from (
    select z.id zone_id, dd.d, max(rq.headcount_required) needed,
           (select count(*) from public.schedule_draft_lines l where l.draft_id = v_draft.id and l.zone_id = z.id and l.work_date = dd.d and l.employee_id is not null) placed
    from generate_series(v_ws, v_ws + 6, interval '1 day') dd(d)
    join public.zone_staffing_requirements rq on rq.effective_from <= dd.d::date and (rq.effective_to is null or rq.effective_to >= dd.d::date)
         and (rq.weekday is null or rq.weekday = extract(dow from dd.d)::int) and rq.headcount_required > 0
    join public.zones z on z.id = rq.zone_id and z.active and (p_department_id is null or z.department_id = p_department_id)
    group by z.id, dd.d) q;
  select jsonb_build_object(
    'totalShifts', count(*) filter (where (s->>'open')::boolean is not true),
    'openShifts', count(*) filter (where (s->>'open')::boolean),
    'totalHours', round(coalesce(sum((s->>'hours')::numeric) filter (where (s->>'open')::boolean is not true), 0)),
    'coveragePct', case when v_req > 0 then round(100.0 * v_filled / v_req) else null end,
    'requirementCells', v_req, 'filledCells', v_filled,
    'overtimeFlags', count(*) filter (where s->>'conflict' ilike '%overtime%'),
    'conflicts', count(*) filter (where s->>'conflict' is not null),
    'estimatedCost', round(coalesce(sum((s->>'hours')::numeric * (s->>'rate')::numeric) filter (where s->>'rate' is not null), 0)),
    'ratesMissing', count(*) filter (where s->>'employee_id' is not null and s->>'rate' is null),
    'uniqueEmployees', count(distinct s->>'employee_id') filter (where s->>'employee_id' is not null))
    into v_stats from jsonb_array_elements(v_shifts) s;
  return jsonb_build_object('draft', jsonb_build_object('id', v_draft.id, 'title', v_draft.title, 'status', v_draft.status, 'agent', v_draft.agent_name,
                              'by_kind', v_draft.drafted_by_kind, 'rationale', v_draft.rationale, 'covers_from', v_draft.covers_from, 'covers_to', v_draft.covers_to,
                              'projected_hours', v_draft.projected_hours, 'projected_ot_hours', v_draft.projected_ot_hours, 'created_at', v_draft.created_at,
                              'posted_at', v_draft.posted_at),
                            'shifts', v_shifts, 'stats', v_stats, 'week_start', v_ws);
end $$;
revoke all on function hr.tg_draft_week(date, uuid, boolean) from public, anon;
grant execute on function hr.tg_draft_week(date, uuid, boolean) to authenticated;

-- conflicts on a draft, each with the candidates that could take the line
create or replace function hr.tg_draft_conflicts(p_draft_id uuid)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id, 'line_id', l.id, 'employee_id', l.employee_id,
    'severity', case when l.conflict ilike '%overtime%' then 'warning' else 'critical' end,
    'type', case when l.conflict ilike '%overtime%' then 'OT Risk' when l.conflict ilike '%rest%' then 'Rest Violation'
                 when l.conflict ilike '%consecutive%' or l.conflict ilike '%days in a row%' then 'Consecutive Days'
                 when l.conflict ilike '%training%' then 'Training Rule' when l.conflict ilike '%unknown%' then 'Unknown Person'
                 when l.conflict ilike '%availab%' or l.conflict ilike '%time off%' then 'Availability Violation' else 'Rule Blocker' end,
    'description', coalesce(e.full_name, '—') || ' · ' || coalesce(z.name, '') || ' · ' || to_char(l.work_date, 'Dy DD Mon') || ': ' || l.conflict,
    'employees', case when e.full_name is null then '[]'::jsonb else jsonb_build_array(e.full_name) end,
    'day', to_char(l.work_date, 'FMDay'), 'date', l.work_date, 'shift', coalesce(z.name, ''),
    'fix', case when c.full_name is not null then 'Assign ' || c.full_name || ' (' || coalesce(c.level, 'trained') || case when c.is_floater then ', floater' else '' end || ', ' || c.hours_week || ' h this week)'
                else 'No clear candidate — leave open or lift a rule in Settings › Scheduling' end,
    'candidate_id', c.employee_id, 'candidate', c.full_name) order by l.work_date, l.planned_start), '[]'::jsonb)
  from public.schedule_draft_lines l
  left join public.employees e on e.id = l.employee_id
  left join public.zones z on z.id = l.zone_id
  left join lateral (select * from public.f_schedule_candidates(l.zone_id, l.work_date, l.shift_template_id, l.draft_id, l.id) k
                      where cardinality(k.blockers) = 0 and not k.would_be_ot and k.employee_id is distinct from l.employee_id
                      order by (cardinality(k.warnings) = 0) desc, k.is_primary desc, k.score desc limit 1) c on true
  where l.draft_id = p_draft_id and l.conflict is not null;
$$;
revoke all on function hr.tg_draft_conflicts(uuid) from public, anon;
grant execute on function hr.tg_draft_conflicts(uuid) to authenticated;

-- move a conflicting line to a candidate, then re-validate the draft (sign-off roles only)
create or replace function hr.tg_draft_fix_line(p_line_id uuid, p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_draft uuid; v_left int;
begin
  if not public.f_can_post_schedule() then
    raise exception 'Only a scheduling sign-off role may change a draft.' using errcode = '42501';
  end if;
  update public.schedule_draft_lines set employee_id = p_employee_id, is_open_shift = (p_employee_id is null), conflict = null
   where id = p_line_id returning draft_id into v_draft;
  if v_draft is null then return jsonb_build_object('ok', false, 'error', 'no such line'); end if;
  v_left := public.f_validate_draft(v_draft);
  return jsonb_build_object('ok', true, 'draft_id', v_draft, 'conflicts_left', v_left);
end $$;
revoke all on function hr.tg_draft_fix_line(uuid, uuid) from public, anon;
grant execute on function hr.tg_draft_fix_line(uuid, uuid) to authenticated;

-- coverage heat: required vs placed per zone per day of the week (draft or posted schedule)
create or replace function hr.tg_coverage_heat(p_week_start date, p_department_id uuid default null)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with wk as (select coalesce(p_week_start, date_trunc('week', current_date)::date) ws),
  dr as (select d.id from public.schedule_drafts d, wk where d.covers_from <= wk.ws + 6 and d.covers_to >= wk.ws
           and (p_department_id is null or d.department_id = p_department_id or d.department_id is null)
          order by (d.status = 'posted') desc, (d.status = 'draft') desc, d.created_at desc limit 1),
  cells as (
    select z.id zone_id, z.name zone, dp.name dept, dd.d::date d, extract(dow from dd.d)::int dow, max(rq.headcount_required) needed,
           (select count(*) from public.schedule_draft_lines l where l.draft_id = (select id from dr) and l.zone_id = z.id and l.work_date = dd.d::date and l.employee_id is not null) placed
    from wk, generate_series(wk.ws, wk.ws + 6, interval '1 day') dd(d)
    join public.zone_staffing_requirements rq on rq.effective_from <= dd.d::date and (rq.effective_to is null or rq.effective_to >= dd.d::date)
         and (rq.weekday is null or rq.weekday = extract(dow from dd.d)::int) and rq.headcount_required > 0
    join public.zones z on z.id = rq.zone_id and z.active and (p_department_id is null or z.department_id = p_department_id)
    left join public.departments dp on dp.id = z.department_id
    group by z.id, z.name, dp.name, dd.d)
  select jsonb_build_object('week_start', (select ws from wk), 'draft_id', (select id from dr),
    'cells', coalesce((select jsonb_agg(jsonb_build_object('zone', zone, 'dept', dept, 'date', d, 'dow', dow, 'required', needed, 'staffed', placed,
                 'coverage', case when needed > 0 then round(100.0 * placed / needed) else null end) order by dept, zone, d) from cells), '[]'::jsonb));
$$;
revoke all on function hr.tg_coverage_heat(date, uuid) from public, anon;
grant execute on function hr.tg_coverage_heat(date, uuid) to authenticated;

-- draft history, newest first
create or replace function hr.tg_draft_history(p_limit int default 24)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', d.id, 'weekOf', d.covers_from, 'coversTo', d.covers_to, 'title', d.title, 'status', d.status,
    'location', coalesce(dp.name, 'All departments'),
    'generatedBy', case when d.drafted_by_kind = 'agent' then coalesce(d.agent_name, 'agent') else 'Manual' end,
    'shifts', (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.employee_id is not null),
    'openShifts', (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.is_open_shift),
    'conflicts', (select count(*) from public.schedule_draft_lines l where l.draft_id = d.id and l.conflict is not null),
    'otHours', d.projected_ot_hours, 'hours', d.projected_hours, 'totalCost', d.projected_cost_loaded,
    'coverageScore', null, 'rationale', d.rationale, 'createdAt', d.created_at, 'postedAt', d.posted_at) order by d.created_at desc), '[]'::jsonb)
  from (select * from public.schedule_drafts order by created_at desc limit greatest(1, least(p_limit, 200))) d
  left join public.departments dp on dp.id = d.department_id;
$$;
revoke all on function hr.tg_draft_history(int) from public, anon;
grant execute on function hr.tg_draft_history(int) to authenticated;

-- ── 6. Forms: the catalogue is rows, submissions carry their node ─────────────────────
create table if not exists hr.form_catalog (
  id text primary key,
  title text not null,
  category text not null,
  required boolean not null default false,
  icon text,
  sort int not null default 100,
  active boolean not null default true,
  fields jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table hr.form_catalog enable row level security;
drop policy if exists form_catalog_read on hr.form_catalog;
create policy form_catalog_read on hr.form_catalog for select to authenticated using (true);
grant select on hr.form_catalog to authenticated;
insert into hr.form_catalog (id, title, category, required, icon, sort) values
  ('new-hire-packet', 'New Hire Packet', 'Onboarding', true, '📋', 10),
  ('direct-deposit', 'Direct Deposit Authorization', 'Payroll', true, '🏦', 20),
  ('w4', 'W-4 Tax Withholding', 'Payroll', true, '💰', 30),
  ('i9', 'I-9 Employment Verification', 'Compliance', true, '🪪', 40),
  ('emergency-contact', 'Emergency Contact Update', 'Employee Info', false, '🚨', 50),
  ('pto-request', 'PTO Request', 'Time Off', false, '🏖', 60),
  ('schedule-change', 'Schedule Change Request', 'Scheduling', false, '📅', 70),
  ('availability-update', 'Availability Update', 'Scheduling', false, '🕐', 80),
  ('disciplinary-ack', 'Disciplinary Acknowledgment', 'HR Action', false, '⚠️', 90),
  ('perf-self-assessment', 'Performance Review Self-Assessment', 'Reviews', false, '⭐', 100),
  ('harassment-complaint', 'Harassment Complaint', 'Compliance', false, '🛡', 110),
  ('accommodation-request', 'Accommodation Request', 'HR Action', false, '♿', 120),
  ('equipment-request', 'Equipment Request', 'Operations', false, '🖥', 130),
  ('expense-reimbursement', 'Expense Reimbursement', 'Finance', false, '💳', 140),
  ('shift-swap', 'Shift Swap Request', 'Scheduling', false, '🔄', 150),
  ('reference-request', 'Reference Request', 'HR Action', false, '📨', 160)
on conflict (id) do nothing;

create or replace function hr.get_form_catalog()
returns setof hr.form_catalog language sql stable security definer set search_path = hr, public, extensions as $$
  select * from hr.form_catalog where active order by sort, title;
$$;
revoke all on function hr.get_form_catalog() from public, anon;
grant execute on function hr.get_form_catalog() to authenticated;

-- submissions in the shape the page shows, joined to the catalogue and the person
create or replace function hr.get_form_submissions_v2(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'formId', s.form_type, 'formTitle', coalesce(c.title, s.form_type), 'category', coalesce(c.category, ''),
    'personId', s.person_id, 'personName', coalesce(p.full_name, '—'), 'location', coalesce(n.name, ''),
    'status', case lower(coalesce(s.status, 'pending')) when 'submitted' then 'Pending' when 'pending' then 'Pending' when 'approved' then 'Approved'
                   when 'rejected' then 'Rejected' when 'under review' then 'Under Review' when 'under_review' then 'Under Review' else initcap(s.status) end,
    'submittedAt', s.created_at, 'notes', coalesce(s.form_data->>'_notes', ''), 'formData', s.form_data) order by s.created_at desc), '[]'::jsonb)
  from hr.hr_form_submissions s
  left join hr.form_catalog c on c.id = s.form_type
  left join hr.people p on p.id = s.person_id
  left join hr.org_nodes n on n.id = s.node_id
  where p_node_ids is null or s.node_id = any(hr.tg_reach_nodes(p_node_ids)) or s.node_id is null;
$$;
revoke all on function hr.get_form_submissions_v2(uuid[]) from public, anon;
grant execute on function hr.get_form_submissions_v2(uuid[]) to authenticated;

drop function if exists hr.submit_hr_form(text, jsonb, uuid);
create or replace function hr.submit_hr_form(p_form_id text, p_data jsonb, p_person_id uuid, p_node_id uuid default null)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_id uuid; v_node uuid;
begin
  v_node := p_node_id;
  if v_node is null then
    select a.node_id into v_node from hr.assignments a where a.person_id = p_person_id and a.status = 'active' order by a.effective_from desc limit 1;
  end if;
  insert into hr.hr_form_submissions (form_type, person_id, node_id, form_data, status, created_by, form_month, form_year)
  values (p_form_id, p_person_id, v_node, coalesce(p_data, '{}'::jsonb), 'submitted', p_person_id, extract(month from current_date)::int, extract(year from current_date)::int)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'node_id', v_node);
end $$;
revoke all on function hr.submit_hr_form(text, jsonb, uuid, uuid) from public, anon;
grant execute on function hr.submit_hr_form(text, jsonb, uuid, uuid) to authenticated;

notify pgrst, 'reload schema';;
