-- BP-12g follow-up, measured as the owner's session after the first cut:
--   • every one of the 21 OS pay rates is a PLACEHOLDER (provisional, $22/h or $1,250/wk,
--     effective 1 Aug 2026), so a reader that skipped placeholders priced everything at 0.
--     The readers now price with whatever rate the OS holds and SAY how many are provisional;
--     the pages label those figures "provisional" rather than showing a zero that is not true.
--   • a weekly salary is costed at rate / 40 per scheduled hour.
--   • a DISCARDED draft is history, not the schedule: tg_draft_week / tg_coverage_heat skip it.
--   • people assigned straight to the facility (11 of 27 today) get a facility row in the
--     labour budget instead of vanishing from it.
set search_path = hr, public, extensions;

create or replace function hr.tg_hourly_rate(p_employee_id uuid, p_on date default current_date)
returns table(rate numeric, provisional boolean)
language sql stable security definer set search_path = hr, public, extensions as $$
  select case r.basis::text when 'hourly' then r.rate when 'weekly_salary' then round(r.rate / 40.0, 2) else r.rate end,
         coalesce(r.provisional, false) or coalesce(r.is_placeholder, false)
  from public.employee_rates r
  where r.employee_id = p_employee_id
    and coalesce(r.effective_from, r.effective_from_date) <= coalesce(p_on, current_date)
    and (r.effective_to is null or r.effective_to >= coalesce(p_on, current_date))
  order by coalesce(r.effective_from, r.effective_from_date) desc, (coalesce(r.provisional, false) or coalesce(r.is_placeholder, false)) asc
  limit 1;
$$;
revoke all on function hr.tg_hourly_rate(uuid, date) from public, anon;
grant execute on function hr.tg_hourly_rate(uuid, date) to authenticated;

drop function if exists hr.labor_budget(uuid[], date);
create or replace function hr.labor_budget(p_node_ids uuid[], p_week_start date default null)
returns table(node_id uuid, node_name text, node_type text, head int, sched_hrs numeric, actual_hrs numeric, ot_hrs numeric,
              avg_wage numeric, wage_known int, wage_provisional int, revenue numeric, week_start date)
language sql stable security definer set search_path = hr, public, extensions as $$
  with wk as (select coalesce(p_week_start, date_trunc('week', current_date)::date) ws),
  nodes as (
    select n.id, n.name, n.node_type::text nt
    from hr.org_nodes n where n.id = any(hr.tg_reach_nodes(p_node_ids)) and n.node_type in ('department', 'location') and n.is_active),
  ppl as (
    select distinct on (a.person_id) a.person_id, a.node_id
    from hr.assignments a join hr.people p on p.id = a.person_id and p.is_active
    where a.status = 'active' and a.node_id in (select id from nodes) order by a.person_id, a.effective_from desc),
  wage as (
    select pp.person_id, coalesce(w.new_wage, r.rate) w, (w.new_wage is null and coalesce(r.provisional, false)) prov
    from ppl pp
    left join lateral (select new_wage from hr.wage_history h where h.person_id = pp.person_id order by h.effective_date desc limit 1) w on true
    left join lateral (select * from hr.tg_hourly_rate(pp.person_id, current_date)) r on true),
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
    select pp.node_id, pp.person_id, coalesce(s.h, 0) sched, coalesce(a.h, 0) act, greatest(coalesce(a.h, 0) - 40, 0) ot, w.w, w.prov
    from ppl pp left join sched s on s.person_id = pp.person_id left join actual a on a.person_id = pp.person_id left join wage w on w.person_id = pp.person_id),
  rev as (
    select f.node_id, sum(f.amount) amt from hr.financial_facts f, wk
     where f.category ilike 'revenue' and f.fact_date between wk.ws and wk.ws + 6 group by f.node_id)
  select n.id, n.name, n.nt, count(per.person_id)::int, round(coalesce(sum(per.sched), 0), 1), round(coalesce(sum(per.act), 0), 1), round(coalesce(sum(per.ot), 0), 1),
         round(avg(per.w), 2), count(per.w)::int, count(per.w) filter (where per.prov)::int, rev.amt, wk.ws
  from nodes n cross join wk left join per on per.node_id = n.id left join rev on rev.node_id = n.id
  group by n.id, n.name, n.nt, rev.amt, wk.ws
  having count(per.person_id) > 0 or n.nt = 'department'
  order by (n.nt = 'location') desc, n.name;
$$;
revoke all on function hr.labor_budget(uuid[], date) from public, anon;
grant execute on function hr.labor_budget(uuid[], date) to authenticated;

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
   where d.covers_from <= v_ws + 6 and d.covers_to >= v_ws and d.status <> 'discarded'
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
           'rate', r.rate, 'rate_provisional', r.provisional) order by l.work_date, z.sort_order, l.planned_start, e.full_name), '[]'::jsonb)
    into v_shifts
  from public.schedule_draft_lines l
  cross join (select coalesce((select facility_tz from public.scheduling_policy limit 1), 'America/New_York') tz) pol
  left join public.employees e on e.id = l.employee_id
  left join public.zones z on z.id = l.zone_id
  left join public.departments dp on dp.id = coalesce(l.department_id, z.department_id)
  left join lateral (select * from hr.tg_hourly_rate(l.employee_id, l.work_date)) r on true
  where l.draft_id = v_draft.id and l.work_date between v_ws and v_ws + 6;
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
    'ratesProvisional', count(*) filter (where (s->>'rate_provisional')::boolean),
    'uniqueEmployees', count(distinct s->>'employee_id') filter (where s->>'employee_id' is not null))
    into v_stats from jsonb_array_elements(v_shifts) s;
  return jsonb_build_object('draft', jsonb_build_object('id', v_draft.id, 'title', v_draft.title, 'status', v_draft.status, 'agent', v_draft.agent_name,
                              'by_kind', v_draft.drafted_by_kind, 'rationale', v_draft.rationale, 'covers_from', v_draft.covers_from, 'covers_to', v_draft.covers_to,
                              'projected_hours', v_draft.projected_hours, 'projected_ot_hours', v_draft.projected_ot_hours, 'created_at', v_draft.created_at,
                              'posted_at', v_draft.posted_at),
                            'shifts', v_shifts, 'stats', v_stats, 'week_start', v_ws);
end $$;

create or replace function hr.tg_coverage_heat(p_week_start date, p_department_id uuid default null)
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  with wk as (select coalesce(p_week_start, date_trunc('week', current_date)::date) ws),
  dr as (select d.id from public.schedule_drafts d, wk where d.covers_from <= wk.ws + 6 and d.covers_to >= wk.ws and d.status <> 'discarded'
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

notify pgrst, 'reload schema';;
