-- Agent I, 13 Aug 2026. DBI-110.
--
-- OWNER: "TRACK BY MONTH, QUARTER, YEAR HOW MANY DAYS THIS COST US AND WHAT IT AMOUNTS TO IN
-- TOTAL POUNDS AND DOLLARS. TEAM MUST ALWAYS BE ABLE TO ADJUST AVERAGE COST BY POUND IN OS."
--
-- HIS THREE RULINGS, collaborated before building rather than assumed:
--   Q1 early does NOT offset late — "NO I DONT BELIEVE SO". Coming down 3 days early does not
--      bank 3 days of room time; the next cycle starts when it is planted. So 43 days late
--      stands, and the 18 early days are reported separately and never netted off.
--   Q2 $1,100 is the AVERAGE COST TO MANUFACTURE per pound, it fluctuates monthly with the P&L,
--      and it is used until the P&L corrects it. Dated, so last year reproduces at last year's
--      rate.
--   Q3 report BOTH — days late and pounds of room-time at risk as the discipline measure, and
--      cycles actually lost as the money.
--
-- THE ARITHMETIC, and every input is a row he can change:
--   a room-day = pull_target_dried_lb / room_cycle_days = 180 / 56 = 3.214 lb
--   pounds at risk = days late x lb per room-day
--   dollars = pounds x the manufacture cost per lb IN FORCE ON THAT PULL'S DATE
-- Change 180 or 56 in Business Rules and every figure here follows. Nothing is hardcoded.
--
-- WHY THE RATE IS JOINED BY DATE AND NOT READ AS A CONSTANT. He said it moves every month. A
-- single current rate would silently restate every historical month the day it changes, so last
-- quarter's report would stop reproducing. inventory_cost_rate already carries effective_from and
-- effective_to and is the right home; a second cost table would be the duplicate-definition
-- defect this platform keeps finding.
--
-- A DISCREPANCY I AM SURFACING RATHER THAN RESOLVING. inventory_cost_rate already holds
-- global/flower at $1,200/lb from the cost spreadsheet ("Summary Q6, Flower @ $1200/lb"), and the
-- owner has just given $1,100 as the average manufacture cost. Both are recorded. They may be
-- different things — $1,200 a full cost basis, $1,100 an average — or one may be stale. I am not
-- picking, because the difference is 9% on every dollar figure below.
--
-- POUNDS AT RISK IS NOT THE SAME AS POUNDS LOST, and the view says so. Four rooms on 56-day
-- cycles allow roughly 26 pulls a year against 24 scheduled, so there is about two pulls of
-- slack. Some lateness absorbs into it. cycles_lost counts only lateness beyond a full cycle;
-- pounds_at_risk is the discipline number and is always true.
--
-- UNDO: drop view v_schedule_cost_by_period; drop view v_schedule_cost_detail;
--       delete from inventory_cost_rate where material = 'manufacture_average'.

insert into inventory_cost_rate
  (scope, scope_key, material, cost_per_lb, currency, effective_from, set_by, note, evidence_status)
values
('global', null, 'manufacture_average', 1100, 'USD', date '2024-01-01', 'Owner (Vinny)',
 'Average cost to manufacture one pound. Owner 13 Aug 2026: "THIS NUMBER FLEXUATES PER P&L EACH '
 'MONTH FOR NOW USE 1100.00 UNTIL WE GET P&L THEN WE WILL CORRECT IF NEEDED THIS IS OUR AVERAGE '
 'COST TO MANUFACTURE PER MONTH." '
 'TO CHANGE IT FOR A NEW MONTH: close this row with an effective_to and INSERT A NEW ROW. Never '
 'edit the amount in place — a figure published last quarter must still reproduce at the rate '
 'that applied then. '
 'NOTE THE OTHER FIGURE: global/flower reads $1,200/lb from the cost spreadsheet. These may be '
 'different things or one may be stale; the difference is 9% on every dollar below and it has not '
 'been resolved by anyone.',
 'owner_set')
on conflict do nothing;

create or replace view public.v_schedule_cost_detail as
with r as (
  select (select value::numeric from conversion_factors where key='pull_target_dried_lb') as lb_per_pull,
         (select value::numeric from conversion_factors where key='room_cycle_days')      as cycle_days
),
late as (
  select sc.room, sc.cultivars, sc.scheduled_date, sc.actual_date,
         (sc.actual_date - sc.scheduled_date) as days_late
  from v_schedule_compliance sc
  where sc.event_type = 'Pull'
    and sc.actual_date is not null and sc.scheduled_date is not null
    and sc.actual_date > sc.scheduled_date
)
select l.room, l.cultivars, l.scheduled_date, l.actual_date, l.days_late,
       round(r.lb_per_pull / r.cycle_days, 4)                        as lb_per_room_day,
       round(l.days_late * (r.lb_per_pull / r.cycle_days), 1)        as pounds_at_risk,
       cr.cost_per_lb                                                as cost_per_lb_then,
       round(l.days_late * (r.lb_per_pull / r.cycle_days) * cr.cost_per_lb, 0) as dollars_at_risk,
       floor(l.days_late / r.cycle_days)::int                        as whole_cycles_lost,
       date_trunc('month',   l.scheduled_date)::date                 as month,
       date_trunc('quarter', l.scheduled_date)::date                 as quarter,
       date_trunc('year',    l.scheduled_date)::date                 as year
from late l
cross join r
left join lateral (
  select ic.cost_per_lb from inventory_cost_rate ic
   where ic.material = 'manufacture_average'
     and ic.effective_from <= l.scheduled_date
     and (ic.effective_to is null or ic.effective_to >= l.scheduled_date)
   order by ic.effective_from desc limit 1) cr on true;

comment on view public.v_schedule_cost_detail is
 'Every late pull, and what the lateness is worth in room-time. A room-day is '
 'pull_target_dried_lb / room_cycle_days — 180/56 = 3.214 lb today, and both inputs are rows the '
 'owner can change. The dollar rate is the manufacture cost IN FORCE ON THAT PULL''S DATE, not '
 'today''s, so a report run last quarter still reproduces. Early pulls are NOT netted off: owner '
 'ruling 13 Aug 2026 that coming down early does not bank room time.';

create or replace view public.v_schedule_cost_by_period as
select 'month'::text as period_type, month as period_start,
       count(*) as late_pulls, sum(days_late) as days_late,
       round(sum(pounds_at_risk),1) as pounds_at_risk,
       round(sum(dollars_at_risk),0) as dollars_at_risk,
       sum(whole_cycles_lost) as whole_cycles_lost,
       max(cost_per_lb_then) as cost_per_lb_used
from v_schedule_cost_detail group by month
union all
select 'quarter', quarter, count(*), sum(days_late), round(sum(pounds_at_risk),1),
       round(sum(dollars_at_risk),0), sum(whole_cycles_lost), max(cost_per_lb_then)
from v_schedule_cost_detail group by quarter
union all
select 'year', year, count(*), sum(days_late), round(sum(pounds_at_risk),1),
       round(sum(dollars_at_risk),0), sum(whole_cycles_lost), max(cost_per_lb_then)
from v_schedule_cost_detail group by year
order by 1, 2;

comment on view public.v_schedule_cost_by_period is
 'What not sticking to the harvest schedule cost, by month, quarter and year. TWO NUMBERS AND THEY '
 'MEAN DIFFERENT THINGS. pounds_at_risk and dollars_at_risk are the DISCIPLINE measure: room-time '
 'that went to lateness, always true, and the figure to run a monthly meeting on. '
 'whole_cycles_lost is the MONEY measure and is deliberately harsher to satisfy: four rooms on '
 '56-day cycles allow roughly 26 pulls a year against 24 scheduled, so about two pulls of slack '
 'exists and some lateness absorbs into it. Reporting only pounds_at_risk would overstate the '
 'cash effect; reporting only cycles_lost would let a year of small slips look free. '
 'cost_per_lb_used names the rate applied, so nobody has to guess which one produced the dollars.';;
