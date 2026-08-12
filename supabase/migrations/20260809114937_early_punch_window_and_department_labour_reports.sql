-- EARLY-PUNCH WINDOW. Owner, 8 Aug 2026: clock in no earlier than five
-- minutes before the shift, and be IN ZONE ready to work at start. Both
-- numbers are policy rows, not constants — manufacturing need moves them.
alter table public.attendance_policy
  add column if not exists early_punch_minutes  integer not null default 5,
  add column if not exists in_zone_by_minutes   integer not null default 0,
  add column if not exists block_early_punch    boolean not null default false;

comment on column public.attendance_policy.early_punch_minutes is
  'How far ahead of the shift a punch is accepted. Owner: no more than five '
  'minutes early. block_early_punch decides whether an earlier punch is refused '
  'outright or accepted and flagged — refusing it strands someone at the door, so '
  'it starts as flag-only and HR can tighten it.';
comment on column public.attendance_policy.in_zone_by_minutes is
  'Minutes after shift start by which the person must be in zone and working. '
  'Zero means at the start bell.';

-- Flag early and late punches against the window. Purely additive: it
-- records a judgement, it does not reject the punch.
alter table public.time_entries
  add column if not exists early_minutes integer,
  add column if not exists in_zone_at    timestamptz;

comment on column public.time_entries.early_minutes is
  'Minutes clocked in BEFORE the scheduled start. Above attendance_policy.'
  'early_punch_minutes it is unapproved early time — paid, and nobody asked for it.';

-- ── DEPARTMENT LABOUR, THE DETAILED VIEW ─────────────────────────────
-- Cost and heads per department per day per shift, against what was
-- scheduled and what was required. Every figure computed, none typed.
create or replace view public.v_department_labour
with (security_invoker = on) as
with punch as (
  select t.employee_id, t.work_date,
         s.department_id, btrim(s.zone) as zone, s.shift_template_id,
         st.name as shift,
         extract(epoch from (t.clock_out - t.clock_in))/3600.0
           - coalesce(t.unpaid_lunch_min,0)/60.0            as hours,
         t.late_minutes, t.early_minutes,
         r.rate, coalesce(r.ot_multiplier,1.5) as otm, coalesce(r.burden_pct,0) as burden
  from public.time_entries t
  left join public.employee_schedules s
    on s.employee_id = t.employee_id and s.work_date = t.work_date
  left join public.shift_templates st on st.id = s.shift_template_id
  left join lateral (
    select * from public.employee_rates r2
    where r2.employee_id = t.employee_id and r2.effective_from <= t.work_date
      and (r2.effective_to is null or r2.effective_to >= t.work_date)
    order by r2.effective_from desc limit 1) r on true
  where t.clock_in is not null and t.clock_out is not null
)
select d.id as department_id, coalesce(d.name,'Unassigned') as department,
       p.work_date,
       date_trunc('week',  p.work_date)::date as week_start,
       date_trunc('month', p.work_date)::date as month_start,
       coalesce(p.shift,'Unscheduled')        as shift,
       p.zone,
       count(distinct p.employee_id)                                   as heads,
       round(sum(p.hours),2)                                           as hours,
       round(avg(p.hours),2)                                           as avg_hours_per_head,
       round(sum(least(p.hours,8)),2)                                  as straight_hours,
       round(sum(greatest(p.hours-8,0)),2)                             as ot_hours,
       round(sum(least(p.hours,8) * p.rate * (1+p.burden)),2)          as straight_cost_loaded,
       round(sum(greatest(p.hours-8,0) * p.rate * p.otm * (1+p.burden)),2) as ot_cost_loaded,
       round(sum((least(p.hours,8) + greatest(p.hours-8,0)*p.otm) * p.rate * (1+p.burden)),2) as total_cost_loaded,
       round(sum((least(p.hours,8) + greatest(p.hours-8,0)*p.otm) * p.rate * (1+p.burden))
             / nullif(sum(p.hours),0), 2)                              as cost_per_hour,
       count(*) filter (where coalesce(p.late_minutes,0) > 0)          as late_punches,
       round(avg(nullif(p.late_minutes,0)),1)                          as avg_late_minutes,
       count(*) filter (where coalesce(p.early_minutes,0) >
                        (select early_punch_minutes from public.attendance_policy limit 1)) as early_punches_over_window
from punch p
left join public.departments d on d.id = p.department_id
group by d.id, d.name, p.work_date, p.shift, p.zone;

comment on view public.v_department_labour is
  'Payroll cost and headcount per department per day per shift per zone, split '
  'straight versus overtime, all loaded with burden. Roll up by week_start or '
  'month_start for the period view. Punctuality travels with the cost because the '
  'two are the same conversation.';

-- Average staffing per department per shift, and how it compares with the
-- minimum HR set. Answers "are we actually running the department we planned".
create or replace view public.v_department_staffing_average
with (security_invoker = on) as
with daily as (
  select department_id, department, shift, work_date, week_start, month_start,
         heads, hours, total_cost_loaded
  from public.v_department_labour
)
select d.department_id, d.department, d.shift,
       min(d.work_date) as from_date, max(d.work_date) as to_date,
       count(distinct d.work_date)                as days_run,
       round(avg(d.heads),2)                      as avg_heads,
       min(d.heads)                               as min_heads,
       max(d.heads)                               as max_heads,
       round(avg(d.hours),2)                      as avg_hours_per_day,
       round(sum(d.total_cost_loaded),2)          as total_cost_loaded,
       round(avg(d.total_cost_loaded),2)          as avg_cost_per_day,
       req.headcount_required                     as minimum_required,
       case
         when req.headcount_required is null then 'no minimum set'
         when avg(d.heads) < req.headcount_required then 'below minimum'
         when avg(d.heads) > req.headcount_required then 'above minimum'
         else 'on minimum'
       end                                        as against_minimum
from daily d
left join lateral (
  select r.headcount_required from public.zone_staffing_requirements r
  where r.department_id = d.department_id
    and r.effective_from <= d.work_date
    and (r.effective_to is null or r.effective_to >= d.work_date)
  order by r.effective_from desc limit 1) req on true
group by d.department_id, d.department, d.shift, req.headcount_required;

comment on view public.v_department_staffing_average is
  'Average, minimum and maximum heads actually worked per department per shift, '
  'against the minimum HR set. "below minimum" is the row that matters.';

grant select on public.v_department_labour, public.v_department_staffing_average to authenticated;

insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
  ('Human Resources',7,'Department Labour',18,'dollar','dept_labour','v_department_labour',
   'Payroll cost and headcount per department, per day, per shift, per zone. Straight and overtime split out, everything loaded with burden, punctuality alongside the cost.',
   true,'#e2bd63',false,'hr','Payroll & Budget','report','auto','this_month_td','activity'),
  ('Human Resources',7,'Average Staffing by Shift',19,'people','dept_staffing_avg','v_department_staffing_average',
   'Average, minimum and maximum people actually worked per department per shift, measured against the minimum HR set.',
   true,'#2df26a',false,'hr','Time & Scheduling','report','auto','this_month_td','activity')
on conflict do nothing;;
