-- THE EYE IN THE SKY. Who is on, where, doing what, at what cost, for any
-- period, every figure drilling to the record beneath it.
-- employee_schedules.planned_start/end are TIME, so they are combined with
-- work_date before any arithmetic — never assumed to be timestamps.

create or replace view public.v_on_the_floor with (security_invoker = on) as
select t.id as time_entry_id, e.id as employee_id, e.employee_code, e.full_name,
       coalesce(d.name,'Unassigned') as department,
       coalesce(btrim(s.zone),'No zone') as zone,
       st.name as shift,
       t.clock_in, t.work_date, t.source, t.late_minutes, t.early_minutes,
       pd.label as device,
       round(extract(epoch from (now() - t.clock_in))/3600.0, 2) as hours_so_far,
       (s.work_date + s.planned_start) as planned_start,
       (s.work_date + s.planned_end)   as planned_end,
       round(extract(epoch from ((s.work_date + s.planned_end) - now()::timestamp))/3600.0, 2)
                                                                as hours_left_scheduled,
       r.rate,
       round(extract(epoch from (now()-t.clock_in))/3600.0 * r.rate
             * (1+coalesce(r.burden_pct,0)), 2)                 as cost_so_far_loaded,
       bw.name as break_window, bw.starts_at as break_from, bw.ends_at as break_to,
       (now()::time between bw.starts_at and bw.ends_at)        as on_break_now,
       e.badge_expires,
       (e.badge_expires is not null and e.badge_expires < current_date) as licence_lapsed
from public.time_entries t
join public.employees e on e.id = t.employee_id
left join public.employee_schedules s on s.employee_id=t.employee_id and s.work_date=t.work_date
left join public.shift_templates st on st.id = s.shift_template_id
left join public.departments d on d.id = coalesce(s.department_id, e.primary_department_id)
left join public.punch_devices pd on pd.id = t.device_id
left join public.break_windows bw on bw.active
  and (bw.department_id is null or bw.department_id = coalesce(s.department_id, e.primary_department_id))
left join lateral (select * from public.employee_rates r2
  where r2.employee_id=t.employee_id and r2.effective_from<=t.work_date
    and (r2.effective_to is null or r2.effective_to>=t.work_date)
  order by r2.effective_from desc limit 1) r on true
where t.clock_in is not null and t.clock_out is null;

comment on view public.v_on_the_floor is
  'Everyone clocked in right now — zone, the device they punched on, hours so far, '
  'live loaded cost, whether they are inside the break window, and whether their '
  'agent licence has lapsed while they stand there.';

create or replace view public.v_zone_now with (security_invoker = on) as
select z.id as zone_id, z.name as zone, coalesce(d.name,'Unassigned') as department,
       count(f.employee_id)                                     as on_floor_now,
       req.headcount_required                                   as required,
       count(f.employee_id) - coalesce(req.headcount_required,0) as variance,
       round(coalesce(sum(f.cost_so_far_loaded),0),2)           as cost_so_far_loaded,
       round(coalesce(avg(f.hours_so_far),0),2)                 as avg_hours_so_far,
       count(*) filter (where f.licence_lapsed)                 as lapsed_licences,
       count(*) filter (where coalesce(f.late_minutes,0)>0)     as late_today,
       case when req.headcount_required is null then 'no requirement set'
            when count(f.employee_id) < req.headcount_required then 'SHORT'
            when count(f.employee_id) > req.headcount_required then 'over'
            else 'on plan' end                                  as coverage_flag
from public.zones z
left join public.departments d on d.id = z.department_id
left join public.v_on_the_floor f on f.zone = z.name
left join lateral (
  select r.headcount_required from public.zone_staffing_requirements r
   where (r.zone_id = z.id or r.department_id = z.department_id)
     and r.effective_from <= current_date
     and (r.effective_to is null or r.effective_to >= current_date)
     and (r.weekday is null or r.weekday = extract(dow from current_date)::int)
   order by r.zone_id nulls last, r.effective_from desc limit 1) req on true
where z.active
group by z.id, z.name, d.name, req.headcount_required;

comment on view public.v_zone_now is
  'Live coverage per zone against the requirement in force today. SHORT is the row '
  'a manager acts on before the shift is lost, not after.';

create or replace view public.v_hr_activity with (security_invoker = on) as
select 'punch_in'::text kind, t.clock_in as at, t.employee_id, e.full_name,
       coalesce(d.name,'—') as department,
       ('Clocked in via '||coalesce(t.source,'unknown')
        ||case when coalesce(t.late_minutes,0)>0 then ' — '||t.late_minutes||' min late' else '' end) as detail,
       case when coalesce(t.late_minutes,0)>0 then 'warn' else 'ok' end as tone,
       t.id::text as ref
from public.time_entries t join public.employees e on e.id=t.employee_id
left join public.departments d on d.id=e.primary_department_id
where t.clock_in is not null
union all
select 'punch_out', t.clock_out, t.employee_id, e.full_name, coalesce(d.name,'—'),
       'Clocked out — '||round(extract(epoch from (t.clock_out-t.clock_in))/3600.0
         - coalesce(t.unpaid_lunch_min,0)/60.0,2)||' h worked', 'ok', t.id::text
from public.time_entries t join public.employees e on e.id=t.employee_id
left join public.departments d on d.id=e.primary_department_id
where t.clock_out is not null
union all
select 'callout', c.called_at, c.employee_id, e.full_name, coalesce(d.name,'—'),
       'Called out — '||c.reason_code||case when c.meets_notice then ' (proper notice)'
         else ' (short notice)' end,
       case when c.meets_notice then 'warn' else 'bad' end, c.id::text
from public.callouts c join public.employees e on e.id=c.employee_id
left join public.departments d on d.id=e.primary_department_id
union all
select 'occurrence', o.created_at, o.employee_id, e.full_name, coalesce(d.name,'—'),
       o.kind||' — '||o.points||' points'||coalesce(' · '||o.reason_code,''), 'bad', o.id::text
from public.attendance_occurrences o join public.employees e on e.id=o.employee_id
left join public.departments d on d.id=e.primary_department_id
union all
select 'claim', sc.claimed_at, sc.employee_id, e.full_name, coalesce(d.name,'—'),
       'Claimed an open shift'||case when sc.would_be_overtime then ' — would be overtime' else '' end,
       case when sc.would_be_overtime then 'warn' else 'ok' end, sc.id::text
from public.shift_claims sc join public.employees e on e.id=sc.employee_id
left join public.departments d on d.id=e.primary_department_id
union all
select 'schedule_posted', sd.posted_at, null::uuid, coalesce(u.email,'a manager'), coalesce(dd.name,'All'),
       'Posted '||sd.title||' ('||sd.covers_from||' to '||sd.covers_to||')', 'ok', sd.id::text
from public.schedule_drafts sd
left join public.departments dd on dd.id=sd.department_id
left join auth.users u on u.id = sd.posted_by
where sd.posted_at is not null
union all
select 'document_signed', a.signed_at, a.employee_id, e.full_name, coalesce(d.name,'—'),
       'Signed '||doc.title||' v'||a.document_version, 'ok', a.id::text
from public.hr_document_acknowledgements a
join public.employees e on e.id=a.employee_id
join public.hr_documents doc on doc.id=a.document_id
left join public.departments d on d.id=e.primary_department_id
where a.signed_at is not null
union all
select 'incident', i.reported_at, i.involved_employee, coalesce(e.full_name,'—'), '—',
       upper(i.kind)||' — '||i.severity||case when i.osha_recordable then ' · OSHA recordable' else '' end,
       case when i.severity in ('high','critical') then 'bad' else 'warn' end, i.id::text
from public.hr_incidents i left join public.employees e on e.id=i.involved_employee;

comment on view public.v_hr_activity is
  'Every HR event in one forensic stream — punches, call-outs, occurrences, claims, '
  'posted schedules, signatures, incidents. Filter by date range for any period. '
  'This is what a dashboard tile drills into.';

create or replace view public.v_labour_forecast with (security_invoker = on) as
with pol as (select shift_hours_gross from public.attendance_policy limit 1),
plan as (
  select s.employee_id, s.work_date,
         date_trunc('week', s.work_date)::date as week_start,
         coalesce(d.name,'Unassigned') as department, coalesce(btrim(s.zone),'No zone') as zone,
         extract(epoch from (s.planned_end - s.planned_start))/3600.0
           - coalesce(bw.minutes,0)/60.0 as planned_hours,
         e.hours_basis, r.rate, coalesce(r.burden_pct,0) burden
  from public.employee_schedules s
  join public.employees e on e.id = s.employee_id
  left join public.departments d on d.id = coalesce(s.department_id, e.primary_department_id)
  left join public.break_windows bw on bw.active
    and (bw.department_id is null or bw.department_id = s.department_id)
  left join lateral (select * from public.employee_rates r2
    where r2.employee_id=s.employee_id and r2.effective_from<=s.work_date
      and (r2.effective_to is null or r2.effective_to>=s.work_date)
    order by r2.effective_from desc limit 1) r on true
  where s.planned_start is not null and s.planned_end is not null
)
select department, zone, work_date, week_start,
       count(distinct employee_id)                          as heads_planned,
       round(sum(planned_hours),2)                          as hours_planned,
       round(sum(planned_hours)/nullif((select shift_hours_gross from pol),0),2) as shifts_planned,
       round(sum(planned_hours * rate * (1+burden)),2)      as cost_planned_loaded,
       round(sum(planned_hours * rate * (1+burden))
             / nullif(sum(planned_hours),0),2)              as planned_cost_per_hour
from plan
group by department, zone, work_date, week_start;

comment on view public.v_labour_forecast is
  'What the posted schedule will cost before anyone works it, net of the unpaid '
  'break window. Compare with v_department_labour for plan versus actual on the '
  'same basis.';

grant select on public.v_on_the_floor, public.v_zone_now, public.v_hr_activity,
                public.v_labour_forecast to authenticated;

insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
 ('Human Resources',7,'On The Floor Now',44,'people','on_the_floor','v_on_the_floor',
  'Everyone clocked in this minute — zone, device punched on, hours so far, live loaded cost, whether they are on break, and whether a licence lapsed while they stand there.',
  true,'#2df26a',false,'hr','Live','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Zone Coverage Now',45,'grid','zone_now','v_zone_now',
  'Live coverage per zone against the requirement in force today. SHORT is the row to act on before the shift is lost.',
  true,'#ff4245',false,'hr','Live','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'HR Activity Feed',46,'clock','hr_activity','v_hr_activity',
  'Every HR event in one forensic stream — punches, call-outs, occurrences, claims, posted schedules, signatures, incidents. Filter by any period.',
  true,'#57a9ff',false,'hr','Live','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Labour Forecast',47,'chart','labour_forecast','v_labour_forecast',
  'What the posted schedule will cost before anyone works it, net of unpaid breaks. Compare with Department Labour for plan versus actual.',
  true,'#e2bd63',false,'hr','Payroll & Budget','report','auto','this_month_td','activity')
on conflict do nothing;;
