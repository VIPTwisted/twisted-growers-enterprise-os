-- ZONES, REQUIRED HEADCOUNT, AND THE THREE LABOUR REPORTS.
--
-- employee_schedules.zone is free text today, so the same place can be
-- spelled three ways and no report can be trusted. Zones become rows.
--
-- Required headcount hangs off the zone and can be driven three ways:
--   manual      a person sets it
--   production  a pipeline stage sets it (schedule_assignments already
--               carries work_order_stage_id — that is the bridge to
--               Manufacturing, and it already exists)
--   harvest     a harvest event sets it (harvest_schedule, 137 rows)
-- Nothing is hardwired. Change a row, the requirement changes.

create table if not exists public.zones (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  department_id  uuid references public.departments(id) on delete set null,
  description    text,
  active         boolean not null default true,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (name)
);
comment on table public.zones is
  'Named places people are scheduled into. Replaces the free-text '
  'employee_schedules.zone so staffing can actually be counted. Anyone with HR '
  'rights adds one — no deploy.';

create table if not exists public.zone_staffing_requirements (
  id                uuid primary key default gen_random_uuid(),
  zone_id           uuid not null references public.zones(id) on delete cascade,
  effective_from    date not null default current_date,
  effective_to      date,
  weekday           integer check (weekday between 0 and 6),   -- null = every day
  shift             text,                                       -- null = every shift
  headcount_required integer not null check (headcount_required >= 0),
  hours_per_head    numeric(4,1) not null default 8.0,
  driver            text not null default 'manual'
                    check (driver in ('manual','production','harvest')),
  pipeline_stage_id uuid,
  note              text,
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now()
);
create index if not exists zsr_zone_idx on public.zone_staffing_requirements(zone_id, effective_from desc);
comment on table public.zone_staffing_requirements is
  'How many people a zone needs, effective-dated. driver=production links to a '
  'pipeline stage so Manufacturing''s schedule sets the requirement; driver=harvest '
  'links to the harvest calendar. Both directions are monitored by v_zone_staffing.';

-- Seed zones from whatever the free-text column already contains, so no
-- history is lost. Nothing invented — only what is already recorded.
insert into public.zones (name)
select distinct btrim(zone) from public.employee_schedules
where zone is not null and btrim(zone) <> ''
on conflict (name) do nothing;

-- ── REPORT 1 — OVERTIME WATCH ────────────────────────────────────────
create or replace view public.v_ot_watch
with (security_invoker = on) as
with wk as (
  select t.employee_id,
         date_trunc('week', t.work_date)::date as week_start,
         sum(extract(epoch from (t.clock_out - t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0) as worked_hours
  from public.time_entries t
  where t.clock_in is not null and t.clock_out is not null
  group by 1,2
)
select e.id as employee_id, e.employee_code, e.full_name,
       d.name as department, wk.week_start,
       round(wk.worked_hours,2)                                    as worked_hours,
       coalesce(e.weekly_target_hours,40)                          as target_hours,
       round(greatest(wk.worked_hours - 40, 0),2)                  as ot_hours,
       round(greatest(wk.worked_hours - 40, 0) * r.rate * coalesce(r.ot_multiplier,1.5)
             * (1 + coalesce(r.burden_pct,0)),2)                   as ot_cost_loaded,
       case when wk.worked_hours > 40 then 'over'
            when wk.worked_hours >= 36 then 'approaching'
            else 'clear' end                                        as ot_flag
from wk
join public.employees e on e.id = wk.employee_id
left join public.departments d on d.id = e.primary_department_id
left join lateral (
  select * from public.employee_rates r2
  where r2.employee_id = e.id and r2.effective_from <= wk.week_start
    and (r2.effective_to is null or r2.effective_to >= wk.week_start)
  order by r2.effective_from desc limit 1) r on true;

comment on view public.v_ot_watch is
  'Overtime by person by week, with the loaded cost of it. approaching = 36h+, '
  'which is the point a manager can still act.';

-- ── REPORT 2 — FULL TIME BUT NOT WORKING FULL TIME ───────────────────
create or replace view public.v_under_utilised
with (security_invoker = on) as
with wk as (
  select t.employee_id, date_trunc('week', t.work_date)::date as week_start,
         sum(extract(epoch from (t.clock_out - t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0) as worked_hours
  from public.time_entries t
  where t.clock_in is not null and t.clock_out is not null
  group by 1,2
)
select e.id as employee_id, e.employee_code, e.full_name,
       d.name as department, wk.week_start,
       coalesce(e.weekly_target_hours,40)                    as target_hours,
       round(wk.worked_hours,2)                              as worked_hours,
       round(coalesce(e.weekly_target_hours,40) - wk.worked_hours, 2) as short_hours,
       round(100.0 * wk.worked_hours / nullif(e.weekly_target_hours,0), 1) as utilisation_pct,
       round((coalesce(e.weekly_target_hours,40) - wk.worked_hours)
             * r.rate * (1 + coalesce(r.burden_pct,0)), 2)    as paid_for_unworked_loaded
from wk
join public.employees e on e.id = wk.employee_id
left join public.departments d on d.id = e.primary_department_id
left join lateral (
  select * from public.employee_rates r2
  where r2.employee_id = e.id and r2.effective_from <= wk.week_start
    and (r2.effective_to is null or r2.effective_to >= wk.week_start)
  order by r2.effective_from desc limit 1) r on true
where coalesce(e.weekly_target_hours,40) >= 35
  and wk.worked_hours < coalesce(e.weekly_target_hours,40) - 2;

comment on view public.v_under_utilised is
  'Full-time staff (35h+ target) who worked more than two hours short of it. '
  'paid_for_unworked_loaded is only meaningful for salaried staff — an hourly '
  'person short of target is lost capacity, not lost cash.';

-- ── REPORT 3 — ZONE STAFFING: REQUIRED vs SCHEDULED vs ACTUAL ────────
create or replace view public.v_zone_staffing
with (security_invoker = on) as
with req as (
  select z.id as zone_id, z.name as zone, z.department_id,
         r.headcount_required, r.hours_per_head, r.driver, r.weekday, r.shift,
         r.effective_from, r.effective_to
  from public.zones z
  left join public.zone_staffing_requirements r on r.zone_id = z.id
  where z.active
),
sched as (
  select btrim(s.zone) as zone, s.work_date,
         count(distinct s.employee_id) as scheduled_heads,
         sum(extract(epoch from (s.planned_end - s.planned_start))/3600.0) as scheduled_hours
  from public.employee_schedules s
  where s.zone is not null group by 1,2
),
act as (
  select btrim(s.zone) as zone, t.work_date,
         count(distinct t.employee_id) as actual_heads,
         sum(extract(epoch from (t.clock_out - t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0) as actual_hours,
         sum((extract(epoch from (t.clock_out - t.clock_in))/3600.0
             - coalesce(t.unpaid_lunch_min,0)/60.0)
             * r.rate * (1 + coalesce(r.burden_pct,0))) as actual_cost_loaded
  from public.time_entries t
  join public.employee_schedules s
    on s.employee_id = t.employee_id and s.work_date = t.work_date
  left join lateral (
    select * from public.employee_rates r2
    where r2.employee_id = t.employee_id and r2.effective_from <= t.work_date
      and (r2.effective_to is null or r2.effective_to >= t.work_date)
    order by r2.effective_from desc limit 1) r on true
  where t.clock_out is not null
  group by 1,2
)
select req.zone, req.zone_id, d.name as department,
       coalesce(sched.work_date, act.work_date)          as work_date,
       req.driver, req.headcount_required,
       coalesce(sched.scheduled_heads,0)                 as scheduled_heads,
       coalesce(act.actual_heads,0)                      as actual_heads,
       coalesce(sched.scheduled_heads,0) - coalesce(req.headcount_required,0) as sched_vs_required,
       coalesce(act.actual_heads,0) - coalesce(sched.scheduled_heads,0)       as actual_vs_sched,
       round(coalesce(sched.scheduled_hours,0),2)        as scheduled_hours,
       round(coalesce(act.actual_hours,0),2)             as actual_hours,
       round(coalesce(act.actual_cost_loaded,0),2)       as actual_cost_loaded,
       case
         when req.headcount_required is null                       then 'no requirement set'
         when coalesce(act.actual_heads,0) < req.headcount_required then 'short'
         when coalesce(act.actual_heads,0) > req.headcount_required then 'over'
         else 'on plan'
       end                                               as staffing_flag
from req
left join sched on sched.zone = req.zone
left join act   on act.zone = req.zone and act.work_date = sched.work_date
left join public.departments d on d.id = req.department_id;

comment on view public.v_zone_staffing is
  'Required vs scheduled vs actually-worked headcount per zone per day, with the '
  'loaded cost of what was worked. driver shows whether the requirement came from '
  'a person, from Manufacturing''s pipeline, or from the harvest calendar.';

alter table public.zones                       enable row level security;
alter table public.zone_staffing_requirements  enable row level security;

drop policy if exists zones_read on public.zones;
create policy zones_read on public.zones for select to authenticated using (true);
drop policy if exists zsr_read on public.zone_staffing_requirements;
create policy zsr_read on public.zone_staffing_requirements for select to authenticated
  using (public.f_can_read_hr());
drop policy if exists zsr_write on public.zone_staffing_requirements;
create policy zsr_write on public.zone_staffing_requirements for all to authenticated
  using (public.f_can_decide_hr()) with check (public.f_can_decide_hr());

grant select on public.zones to authenticated;
grant select, insert, update, delete on public.zone_staffing_requirements to authenticated;
grant select on public.v_ot_watch, public.v_under_utilised, public.v_zone_staffing to authenticated;;
