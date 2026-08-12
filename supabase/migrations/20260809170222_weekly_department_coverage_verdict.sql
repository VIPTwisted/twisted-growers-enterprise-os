-- ============================================================================
-- WEEKLY DEPARTMENT COVERAGE — "is any department short-staffed this week?"
--
-- Owner requirement, 8 Aug 2026: "we must know when any department payroll setup is
-- short staffed each week. The required coverage is set weekly, monthly, daily or
-- whatever the HR and company needs, and must be quick and easy to revise."
--
-- MEASURED BEFORE BUILDING. Most of this already existed and is well designed:
--   zone_staffing_requirements  effective-dated, nullable weekday (null = every day),
--                               nullable shift (null = all shifts), and
--                               CHECK (zone_id IS NOT NULL OR department_id IS NOT NULL)
--                               so a requirement can target a DEPARTMENT directly with
--                               no zone invented. driver in (manual, production, harvest)
--                               lets a requirement be derived from the work itself.
--   v_zone_staffing             per zone per DAY: required / scheduled / actual + flag
--   v_zone_now                  live floor: on_floor_now vs required
--   v_department_staffing_average  per department over a DATE RANGE
--
-- THE GAP THIS FILLS. Nothing produced a PER WEEK, PER DEPARTMENT verdict, which is
-- exactly what was asked for. Per-day is too noisy to act on and a free date range is
-- not a week.
--
-- REVISION IS BY SUPERSESSION, not edit. To change a requirement, close the current row
-- with effective_to and insert a new one. History is preserved, so last month's verdict
-- stays true to the rule that was in force at the time. Never UPDATE headcount_required
-- in place -- that silently rewrites the past.
--
-- WHAT THIS STILL CANNOT DO, stated rather than hidden (rule A3): the model expresses
-- "N heads on a day" only. It cannot express a PERIOD TOTAL such as "this department
-- needs 900 hours in August" or "40 shifts this week, however distributed". For an
-- eight-week harvest cycle a period total is a natural way to plan. Closing that needs
-- two nullable columns on zone_staffing_requirements -- cadence and
-- period_hours_required -- which is TG-05's table, so it is recommended, not done here.
-- ============================================================================

create or replace view public.v_department_coverage_week
with (security_invoker = true) as
with span as (
  -- Only the range we actually have rules or activity for. With everything empty this
  -- yields no rows, which is correct: no requirement means coverage is UNMEASURABLE,
  -- not satisfied.
  select least(
           coalesce((select min(effective_from) from zone_staffing_requirements), current_date),
           coalesce((select min(work_date) from employee_schedules), current_date),
           coalesce((select min(work_date) from time_entries), current_date)
         ) as from_date,
         greatest(
           coalesce((select max(coalesce(effective_to, current_date + 28))
                     from zone_staffing_requirements), current_date),
           coalesce((select max(work_date) from employee_schedules), current_date),
           coalesce((select max(work_date) from time_entries), current_date)
         ) as to_date
),
days as (
  select d::date as work_date
  from span, generate_series(span.from_date, span.to_date, interval '1 day') d
  where exists (select 1 from zone_staffing_requirements)
),
-- Resolve every requirement onto every day it applies to, at DEPARTMENT grain.
-- A requirement reaches a department either directly or through one of its zones.
required as (
  select dy.work_date,
         coalesce(r.department_id, z.department_id) as department_id,
         sum(r.headcount_required)                  as heads_required,
         sum(r.headcount_required * r.hours_per_head) as hours_required,
         string_agg(distinct r.driver, ', ')         as drivers
  from days dy
  join zone_staffing_requirements r
    on r.effective_from <= dy.work_date
   and (r.effective_to is null or r.effective_to >= dy.work_date)
   and (r.weekday is null or r.weekday = extract(dow from dy.work_date)::int)
  left join zones z on z.id = r.zone_id
  where coalesce(r.department_id, z.department_id) is not null
  group by dy.work_date, coalesce(r.department_id, z.department_id)
),
scheduled as (
  select s.work_date, s.department_id,
         count(distinct s.employee_id) as heads_scheduled,
         sum(extract(epoch from (s.planned_end - s.planned_start)) / 3600.0) as hours_scheduled
  from employee_schedules s
  where s.department_id is not null
    and coalesce(s.status, 'planned') <> 'cancelled'
  group by s.work_date, s.department_id
),
actual as (
  select t.work_date, e.primary_department_id as department_id,
         count(distinct t.employee_id) as heads_actual,
         sum(coalesce(t.productive_hours, 0)) as hours_actual
  from time_entries t
  join employees e on e.id = t.employee_id
  where e.primary_department_id is not null
  group by t.work_date, e.primary_department_id
)
select
  date_trunc('week', coalesce(rq.work_date, sc.work_date, ac.work_date))::date as week_start,
  d.id   as department_id,
  d.name as department,
  count(*) filter (where rq.heads_required is not null)          as days_with_a_requirement,
  sum(coalesce(rq.heads_required, 0))                            as heads_required,
  sum(coalesce(sc.heads_scheduled, 0))                           as heads_scheduled,
  sum(coalesce(ac.heads_actual, 0))                              as heads_actual,
  round(sum(coalesce(rq.hours_required, 0))::numeric, 1)         as hours_required,
  round(sum(coalesce(sc.hours_scheduled, 0))::numeric, 1)        as hours_scheduled,
  round(sum(coalesce(ac.hours_actual, 0))::numeric, 1)           as hours_actual,
  -- The shortfall the owner asked about, in head-days and in hours.
  sum(coalesce(rq.heads_required, 0) - coalesce(sc.heads_scheduled, 0))  as head_days_short_on_the_rota,
  round(sum(coalesce(rq.hours_required, 0) - coalesce(ac.hours_actual, 0))::numeric, 1)
                                                                  as hours_short_actually_worked,
  string_agg(distinct rq.drivers, ', ')                           as set_by,
  case
    when sum(coalesce(rq.heads_required, 0)) = 0            then 'NO REQUIREMENT SET'
    when sum(coalesce(sc.heads_scheduled, 0))
       < sum(coalesce(rq.heads_required, 0))                then 'SHORT ON THE ROTA'
    when sum(coalesce(ac.heads_actual, 0))
       < sum(coalesce(rq.heads_required, 0))                then 'ROTA FULL BUT DID NOT TURN UP'
    else 'COVERED'
  end as verdict,
  case
    when sum(coalesce(rq.heads_required, 0)) = 0 then
      'No coverage requirement exists for this department in this week, so short-staffing '
      || 'CANNOT be detected. This is not the same as being fully staffed.'
    else null
  end as why_it_cannot_be_judged
from departments d
left join required  rq on rq.department_id = d.id
left join scheduled sc on sc.department_id = d.id and sc.work_date = rq.work_date
left join actual    ac on ac.department_id = d.id and ac.work_date = coalesce(rq.work_date, sc.work_date)
where coalesce(rq.work_date, sc.work_date, ac.work_date) is not null
group by 1, 2, 3
order by 1 desc, 3;

comment on view public.v_department_coverage_week is
'Per department, per week: is it short-staffed? head_days_short_on_the_rota is the gap between the requirement and the ROTA (a planning failure); hours_short_actually_worked is the gap against hours ACTUALLY WORKED (an attendance failure). They are different problems and are never merged. "NO REQUIREMENT SET" is a verdict in its own right -- an unmeasurable department must never read as a covered one. Requirements come from zone_staffing_requirements, which may target a department directly or a zone within it; revise by superseding with effective_to, never by editing headcount_required in place, or last month''s verdict silently changes.';;
