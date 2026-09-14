-- BP-12g · "OS HR dashboard, Control Tower and CEO dashboard show the HR platform's own tiles —
-- same labels, numbers, buttons". One derivation, read by every surface: the HR Command Center's
-- KPI strip, the OS Human Resources dashboard, the Control Tower and the Chief Executive
-- dashboard all call this. Every number is a count from the hr tables plus the OS rows TG
-- already holds (clock, PTO, incidents), through the reach rule. Each tile names its route in
-- the HR platform so the OS buttons open the same page the HR tile opens.
set search_path = hr, public, extensions;

create or replace function hr.command_center_tiles(p_node_ids uuid[] default null)
returns jsonb language plpgsql stable security definer set search_path = hr, public, extensions as $$
declare
  v_ids uuid[]; v_ws date := date_trunc('week', current_date)::date; v_today date := current_date;
  v_head int; v_in int; v_sched int; v_callout int; v_ncns int; v_late int; v_not_yet int; v_off int;
  v_hrs numeric; v_ot numeric; v_ot_emps int; v_cost numeric; v_ot_cost numeric; v_wages int; v_wages_prov int;
  v_train numeric; v_docs int; v_inc int; v_pto int; v_das int; v_cov numeric; v_att numeric;
  v_badge_exp int; v_badge_30 int;
begin
  -- scope: the facility (and beneath) when nothing is passed
  v_ids := hr.tg_reach_nodes(coalesce(p_node_ids, array[hr.tg_facility_node_id()]));

  -- who is on today (measured: posted schedule + punches)
  select count(*), count(*) filter (where status in ('In', 'Late')), count(*) filter (where scheduled),
         count(*) filter (where status = 'Late'),
         count(*) filter (where scheduled and punched_in_at is null and now() < (v_today + time '23:59')),
         count(*) filter (where status = 'Off')
    into v_head, v_in, v_sched, v_late, v_not_yet, v_off
  from hr.punch_board(v_ids, v_today);
  -- callouts and no-call-no-shows today: hr exceptions/events + OS callouts/occurrences
  select count(distinct person_id) into v_callout from (
    select x.person_id from hr.shift_exceptions x where x.created_at::date = v_today and coalesce(x.type, x.exception_type, '') ilike '%call%'
    union all select e.person_id from hr.attendance_events e where e.event_date = v_today and e.type ilike '%call%'
    union all select c.employee_id from public.callouts c where c.work_date = v_today) u where person_id is not null;
  select count(distinct person_id) into v_ncns from (
    select x.person_id from hr.shift_exceptions x where x.created_at::date = v_today and (coalesce(x.type, x.exception_type, '') ilike '%no%show%' or coalesce(x.type, x.exception_type, '') ilike 'ncns%')
    union all select e.person_id from hr.attendance_events e where e.event_date = v_today and (e.type ilike '%no%show%' or e.type ilike 'ncns%')
    union all select o.employee_id from public.attendance_occurrences o where o.work_date = v_today and (o.kind ilike '%no%show%' or o.kind ilike 'ncns%')) u where person_id is not null;
  v_cov := case when v_sched > 0 then round(100.0 * least(v_in, v_sched) / v_sched) end;
  v_att := case when v_sched > 0 then round(100.0 * greatest(v_sched - v_callout - v_ncns, 0) / v_sched) end;

  -- hours this week, overtime, cost (the same wage rule as hr.labor_budget)
  with ppl as (select person_id from hr.tg_people_in_reach(v_ids, null)),
  hrs as (
    select person_id, sum(h) h from (
      select t.person_id, coalesce(t.hours_worked, extract(epoch from (t.punched_out_at - t.punched_in_at)) / 3600.0) h
        from hr.time_punches t where t.work_date between v_ws and v_ws + 6 and t.punched_out_at is not null
      union all
      select e.employee_id, coalesce(e.productive_hours, extract(epoch from (e.clock_out - e.clock_in)) / 3600.0 - coalesce(e.unpaid_lunch_min, 0) / 60.0)
        from public.time_entries e where e.work_date between v_ws and v_ws + 6 and e.clock_out is not null
    ) u where u.person_id in (select person_id from ppl) group by person_id),
  wage as (
    select pp.person_id, coalesce(w.new_wage, r.rate) w, (w.new_wage is null and coalesce(r.provisional, false)) prov
    from ppl pp
    left join lateral (select new_wage from hr.wage_history h where h.person_id = pp.person_id order by h.effective_date desc limit 1) w on true
    left join lateral (select * from hr.tg_hourly_rate(pp.person_id, current_date)) r on true),
  per as (select pp.person_id, coalesce(h.h, 0) h, greatest(coalesce(h.h, 0) - 40, 0) ot, w.w, w.prov from ppl pp left join hrs h on h.person_id = pp.person_id left join wage w on w.person_id = pp.person_id)
  select round(coalesce(sum(h), 0), 1), round(coalesce(sum(ot), 0), 1), count(*) filter (where h >= 40),
         case when count(w) > 0 then round(sum(((h - ot) * w + ot * w * 1.5))) end,
         case when count(w) > 0 then round(sum(ot * w * 1.5)) end,
         count(w), count(w) filter (where prov)
    into v_hrs, v_ot, v_ot_emps, v_cost, v_ot_cost, v_wages, v_wages_prov
  from per;

  -- training, documents, incidents, PTO, disciplinary
  select round(avg(training_pct), 0) into v_train from hr.flight_risk_factors(v_ids) where training_pct is not null;
  select count(*) into v_docs from hr.documents d
   where d.requires_ack and coalesce(d.status, 'active') = 'active' and d.node_id = any(v_ids)
     and not exists (select 1 from hr.document_acknowledgments a where a.document_id = d.id and (d.person_id is null or a.person_id = d.person_id));
  select count(*) into v_inc from (
    select 1 from hr.incidents i where i.node_id = any(v_ids) and coalesce(i.status, 'open') not in ('closed', 'resolved', 'archived')
    union all select 1 from public.hr_incidents o where coalesce(o.status, 'open') not in ('closed', 'resolved', 'archived')) u;
  select count(*) into v_pto from (
    select 1 from hr.time_off_requests r where r.node_id = any(v_ids) and coalesce(r.status, 'pending') = 'pending'
    union all select 1 from public.time_off_requests o where coalesce(o.status, 'pending') = 'pending') u;
  select count(*) into v_das from hr.disciplinary_records d
   where d.person_id in (select person_id from hr.tg_people_in_reach(v_ids, null)) and coalesce(d.status, 'open') not in ('closed', 'resolved', 'archived', 'void');
  select count(*) filter (where expires_on < v_today), count(*) filter (where expires_on between v_today and v_today + 30)
    into v_badge_exp, v_badge_30 from hr.compliance_expirations(v_ids, null) where kind = 'licence';

  return jsonb_build_object(
    'as_of', now(), 'week_start', v_ws, 'scope', v_ids,
    'wages_on_file', v_wages, 'wages_provisional', v_wages_prov,
    'numbers', jsonb_build_object(
      'headcount', v_head, 'clocked_in', v_in, 'scheduled', v_sched, 'called_out', v_callout, 'no_show', v_ncns, 'late', v_late,
      'not_on_yet', v_not_yet, 'off_duty', v_off, 'coverage_rate', v_cov, 'attendance_rate', v_att,
      'hours_week', v_hrs, 'ot_hours', v_ot, 'ot_employees', v_ot_emps, 'labor_cost', v_cost, 'ot_cost', v_ot_cost,
      'training_pct', v_train, 'docs_pending_ack', v_docs, 'open_incidents', v_inc, 'pending_pto', v_pto, 'open_das', v_das,
      'badges_expired', v_badge_exp, 'badges_30d', v_badge_30),
    'tiles', jsonb_build_array(
      jsonb_build_object('key', 'headcount', 'group', 'Workforce', 'label', 'Active Headcount', 'value', v_head, 'unit', 'people', 'sub', 'active people in scope', 'tone', 'accent', 'route', '/roster'),
      jsonb_build_object('key', 'clocked_in', 'group', 'Workforce', 'label', 'Clocked In Now', 'value', v_in, 'unit', 'people', 'sub', case when v_head > 0 then round(100.0 * v_in / v_head) || '% of staff' else '—' end, 'tone', 'success', 'route', '/timeclock'),
      jsonb_build_object('key', 'coverage_rate', 'group', 'Workforce', 'label', 'Coverage Rate', 'value', v_cov, 'unit', '%', 'sub', case when v_sched > 0 then 'today''s scheduled shifts' else 'no shifts today' end, 'tone', case when v_cov is null then 'muted' when v_cov >= 95 then 'success' when v_cov >= 85 then 'warn' else 'danger' end, 'route', '/coverage-monitor'),
      jsonb_build_object('key', 'called_out', 'group', 'Workforce', 'label', 'Callouts Today', 'value', v_callout, 'unit', 'people', 'sub', 'logged attendance incidents', 'tone', case when v_callout > 2 then 'danger' when v_callout > 0 then 'warn' else 'success' end, 'route', '/callouts'),
      jsonb_build_object('key', 'no_show', 'group', 'Workforce', 'label', 'NCNS Today', 'value', v_ncns, 'unit', 'people', 'sub', 'no-call no-show', 'tone', case when v_ncns > 0 then 'danger' else 'muted' end, 'route', '/attendance'),
      jsonb_build_object('key', 'attendance_rate', 'group', 'Workforce', 'label', 'Attendance Rate', 'value', v_att, 'unit', '%', 'sub', 'today', 'tone', case when v_att is null then 'muted' when v_att >= 95 then 'success' when v_att >= 85 then 'warn' else 'danger' end, 'route', '/attendance'),
      jsonb_build_object('key', 'hours_week', 'group', 'Hours & Labor Cost', 'label', 'Total Hours This Wk', 'value', v_hrs, 'unit', 'h', 'sub', 'from live time punches', 'tone', 'accent', 'route', '/timeclock'),
      jsonb_build_object('key', 'ot_hours', 'group', 'Hours & Labor Cost', 'label', 'OT Hours', 'value', v_ot, 'unit', 'h', 'sub', 'above 40hr threshold', 'tone', case when v_ot > 0 then 'warn' else 'muted' end, 'route', '/timeclock'),
      jsonb_build_object('key', 'ot_employees', 'group', 'Hours & Labor Cost', 'label', 'OT Employees', 'value', v_ot_emps, 'unit', 'people', 'sub', 'at or above 40 hrs', 'tone', case when v_ot_emps > 0 then 'warn' else 'muted' end, 'route', '/timeclock'),
      jsonb_build_object('key', 'labor_cost', 'group', 'Hours & Labor Cost', 'label', 'Est. Labor Cost', 'value', v_cost, 'unit', 'USD', 'sub', case when v_wages = 0 then 'no wages on file' when v_wages_prov > 0 then 'this week · ' || v_wages_prov || ' of ' || v_wages || ' wages provisional' else 'this week · ' || v_wages || ' wages on file' end, 'tone', 'accent', 'route', '/labor-budget'),
      jsonb_build_object('key', 'ot_cost', 'group', 'Hours & Labor Cost', 'label', 'OT Cost', 'value', v_ot_cost, 'unit', 'USD', 'sub', case when v_ot_cost is not null and coalesce(v_cost, 0) > 0 then round(100.0 * v_ot_cost / v_cost) || '% of labor' else '—' end, 'tone', case when coalesce(v_ot_cost, 0) > 500 then 'warn' else 'muted' end, 'route', '/labor-budget'),
      jsonb_build_object('key', 'avg_hours', 'group', 'Hours & Labor Cost', 'label', 'Avg Hrs/Employee', 'value', case when v_head > 0 then round(v_hrs / v_head, 1) end, 'unit', 'h', 'sub', 'per week', 'tone', 'accent', 'route', '/timeclock'),
      jsonb_build_object('key', 'training_pct', 'group', 'Training & Compliance', 'label', 'Training Compliance', 'value', v_train, 'unit', '%', 'sub', case when v_train is null then 'no training data' else 'courses complete' end, 'tone', case when v_train is null then 'muted' when v_train >= 90 then 'success' when v_train >= 75 then 'warn' else 'danger' end, 'route', '/training'),
      jsonb_build_object('key', 'docs_pending_ack', 'group', 'Training & Compliance', 'label', 'Docs Pending Ack', 'value', v_docs, 'unit', 'docs', 'sub', 'unsigned required documents', 'tone', case when v_docs > 0 then 'warn' else 'muted' end, 'route', '/documents'),
      jsonb_build_object('key', 'open_incidents', 'group', 'Training & Compliance', 'label', 'Open Incidents', 'value', v_inc, 'unit', 'incidents', 'sub', 'requiring follow-up', 'tone', case when v_inc > 2 then 'warn' when v_inc > 0 then 'warn' else 'muted' end, 'route', '/incidents'),
      jsonb_build_object('key', 'pending_pto', 'group', 'Training & Compliance', 'label', 'Pending PTO', 'value', v_pto, 'unit', 'requests', 'sub', 'awaiting review', 'tone', case when v_pto > 5 then 'warn' else 'muted' end, 'route', '/requests'),
      jsonb_build_object('key', 'open_das', 'group', 'Training & Compliance', 'label', 'Open D.A.s', 'value', v_das, 'unit', 'actions', 'sub', 'disciplinary actions', 'tone', case when v_das > 3 then 'danger' when v_das > 0 then 'warn' else 'muted' end, 'route', '/disciplinary'),
      jsonb_build_object('key', 'badges', 'group', 'Training & Compliance', 'label', 'Metrc Badges Due', 'value', v_badge_30, 'unit', 'badges', 'sub', case when v_badge_exp > 0 then v_badge_exp || ' EXPIRED · cannot be on the floor' else 'expiring within 30 days' end, 'tone', case when v_badge_exp > 0 then 'danger' when v_badge_30 > 0 then 'warn' else 'success' end, 'route', '/compliance-expirations')
    ));
end $$;
revoke all on function hr.command_center_tiles(uuid[]) from public, anon;
grant execute on function hr.command_center_tiles(uuid[]) to authenticated;

-- the OS reads the same function through public (its client is bound to schema public)
create or replace function public.f_hr_platform_tiles()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select hr.command_center_tiles(null);
$$;
revoke all on function public.f_hr_platform_tiles() from public, anon;
grant execute on function public.f_hr_platform_tiles() to authenticated;

notify pgrst, 'reload schema';;
