-- ZERO HARDWIRING. Owner, 8 Aug 2026.
-- I wrote 8 (a shift), 40 (overtime) and 35 (full time) as literals into three
-- views. Every one is now a row. A full shift is eight hours LESS LUNCH, and
-- salaried staff carry HR-set minimums of 45 or 50 — neither of which a constant
-- could ever express. Rule E1 forbids dropping a view, so existing columns keep
-- their position and type, and the new ones are appended.

alter table public.attendance_policy
  add column if not exists shift_hours_gross   numeric(4,2) not null default 8.00,
  add column if not exists ot_weekly_threshold numeric(5,2) not null default 40.00,
  add column if not exists full_time_min_hours numeric(5,2) not null default 35.00,
  add column if not exists ot_daily_threshold  numeric(4,2),
  add column if not exists approaching_ot_within numeric(4,2) not null default 4.00,
  add column if not exists shortfall_tolerance_hours numeric(4,2) not null default 2.00;

comment on column public.attendance_policy.shift_hours_gross is
  'A full shift door to door, BEFORE the unpaid meal break. Owner: eight hours less '
  'lunch, so with the 30-minute meal window a full shift pays 7.5.';
comment on column public.attendance_policy.ot_weekly_threshold is
  'Hours after which HOURLY staff earn overtime. FLSA is 40 — a row, because a state '
  'or union rule can move it.';
comment on column public.attendance_policy.ot_daily_threshold is
  'Daily OT threshold where a jurisdiction has one. Null in Massachusetts: overtime '
  'is weekly only, so a daily split must never be assumed.';
comment on column public.attendance_policy.approaching_ot_within is
  'How near the threshold counts as approaching — the last point a manager can move '
  'a shift and avoid the cost.';
comment on column public.attendance_policy.shortfall_tolerance_hours is
  'How far short of target is tolerated before it is reported.';

alter table public.employees
  add column if not exists hours_basis text not null default 'shift';
do $$ begin
  alter table public.employees add constraint employees_hours_basis_ck
    check (hours_basis in ('shift','weekly_minimum','exempt'));
exception when duplicate_object then null; end $$;
comment on column public.employees.hours_basis is
  'How hours are judged. shift = paid per shift, OT above the weekly threshold. '
  'weekly_minimum = salaried with a contracted floor in weekly_target_hours (45 or '
  '50, set by HR); short is a shortfall, over is not overtime. exempt = not measured.';

-- Who may change any of it: admin, HR manager, COO, CEO, CFO. app_role carries
-- COO and CEO as owner/executive. One place, not forty call sites.
create or replace function public.f_can_decide_hr() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('owner','executive','admin','hr','cfo')
$$;
create or replace function public.f_can_read_hr() returns boolean
language sql stable security definer set search_path = public as $$
  select public.current_app_role() in ('owner','executive','admin','hr','cfo','manager')
$$;

create or replace view public.v_ot_watch with (security_invoker = on) as
with pol as (select ot_weekly_threshold, approaching_ot_within from public.attendance_policy limit 1),
wk as (
  select t.employee_id, date_trunc('week', t.work_date)::date as week_start,
         sum(extract(epoch from (t.clock_out-t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0) as worked_hours
  from public.time_entries t
  where t.clock_in is not null and t.clock_out is not null group by 1,2)
select e.id as employee_id, e.employee_code, e.full_name, d.name as department,
       wk.week_start,
       round(wk.worked_hours,2) as worked_hours,
       coalesce(e.weekly_target_hours, pol.ot_weekly_threshold)::numeric as target_hours,
       (case when e.hours_basis='shift'
             then round(greatest(wk.worked_hours - pol.ot_weekly_threshold,0),2)
             else 0 end)::numeric as ot_hours,
       (case when e.hours_basis='shift'
             then round(greatest(wk.worked_hours - pol.ot_weekly_threshold,0)
                  * r.rate * coalesce(r.ot_multiplier,1.5) * (1+coalesce(r.burden_pct,0)),2)
             else 0 end)::numeric as ot_cost_loaded,
       case when e.hours_basis <> 'shift' then 'salaried'
            when wk.worked_hours >  pol.ot_weekly_threshold then 'over'
            when wk.worked_hours >= pol.ot_weekly_threshold - pol.approaching_ot_within then 'approaching'
            else 'clear' end as ot_flag,
       e.hours_basis,
       pol.ot_weekly_threshold::numeric as ot_threshold
from wk cross join pol
join public.employees e on e.id = wk.employee_id
left join public.departments d on d.id = e.primary_department_id
left join lateral (select * from public.employee_rates r2
  where r2.employee_id=e.id and r2.effective_from<=wk.week_start
    and (r2.effective_to is null or r2.effective_to>=wk.week_start)
  order by r2.effective_from desc limit 1) r on true;

comment on view public.v_ot_watch is
  'Weekly overtime for HOURLY staff, every threshold read from attendance_policy. '
  'Salaried staff show as salaried with zero OT — hours past a contracted floor are '
  'expected, not payable.';

create or replace view public.v_under_utilised with (security_invoker = on) as
with pol as (select full_time_min_hours, ot_weekly_threshold, shortfall_tolerance_hours
             from public.attendance_policy limit 1),
wk as (
  select t.employee_id, date_trunc('week', t.work_date)::date as week_start,
         sum(extract(epoch from (t.clock_out-t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0) as worked_hours
  from public.time_entries t
  where t.clock_in is not null and t.clock_out is not null group by 1,2)
select e.id as employee_id, e.employee_code, e.full_name, d.name as department,
       wk.week_start,
       coalesce(e.weekly_target_hours, pol.ot_weekly_threshold)::numeric as target_hours,
       round(wk.worked_hours,2) as worked_hours,
       round(coalesce(e.weekly_target_hours, pol.ot_weekly_threshold) - wk.worked_hours,2)::numeric as short_hours,
       round(100.0*wk.worked_hours/nullif(coalesce(e.weekly_target_hours,pol.ot_weekly_threshold),0),1)::numeric as utilisation_pct,
       (case when e.hours_basis='weekly_minimum'
             then round((coalesce(e.weekly_target_hours,0)-wk.worked_hours)*r.rate*(1+coalesce(r.burden_pct,0)),2)
             else null end)::numeric as paid_for_unworked_loaded,
       e.hours_basis,
       case when e.hours_basis='weekly_minimum' then 'below contracted minimum'
            else 'below target' end as shortfall_kind
from wk cross join pol
join public.employees e on e.id = wk.employee_id
left join public.departments d on d.id = e.primary_department_id
left join lateral (select * from public.employee_rates r2
  where r2.employee_id=e.id and r2.effective_from<=wk.week_start
    and (r2.effective_to is null or r2.effective_to>=wk.week_start)
  order by r2.effective_from desc limit 1) r on true
where coalesce(e.weekly_target_hours, pol.ot_weekly_threshold) >= pol.full_time_min_hours
  and wk.worked_hours < coalesce(e.weekly_target_hours, pol.ot_weekly_threshold) - pol.shortfall_tolerance_hours;

comment on view public.v_under_utilised is
  'Anyone at or above the full-time floor who worked short of THEIR OWN target — 40 '
  'for a full-timer, 45 or 50 for salaried staff. Every threshold is a row.';

grant select on public.v_ot_watch, public.v_under_utilised to authenticated;;
