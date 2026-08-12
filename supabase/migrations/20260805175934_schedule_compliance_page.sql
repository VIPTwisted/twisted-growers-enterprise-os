-- Every pull and every dry against the every-other-week schedule: who missed, by how long.
create or replace view v_schedule_compliance as
with r as (select rule_key, threshold from harvest_alert_rules where active),
pulls as (
  select p.pull_no, p.harvest_date as scheduled_date, p.flower_room, p.cultivars,
    p.original_total_plants as planned_plants, p.proj_harvest_weight_lbs as planned_lbs,
    p.facility_days_since_last_pull as planned_gap_days,
    (select min(h.harvest_start) from metrc_harvests h
       where coalesce(h.raw->>'DryingLocationName','') <> ''
         and h.harvest_start between p.harvest_date - 5 and p.harvest_date + 21) as actual_date
  from harvest_pulls p
)
select
  'Pull' as event_type,
  pl.pull_no, pl.flower_room as room, pl.cultivars,
  pl.scheduled_date, pl.actual_date,
  case when pl.actual_date is null and pl.scheduled_date < current_date
         then (current_date - pl.scheduled_date)
       when pl.actual_date is not null then (pl.actual_date - pl.scheduled_date) end as days_off_schedule,
  case
    when pl.actual_date is null and pl.scheduled_date < current_date - ((select threshold from r where rule_key='pull_overdue_days')::int)
      then 'MISSED - never harvested, ' || (current_date - pl.scheduled_date) || ' days past schedule'
    when pl.actual_date is null and pl.scheduled_date >= current_date then 'Scheduled'
    when pl.actual_date > pl.scheduled_date + 2 then 'LATE by ' || (pl.actual_date - pl.scheduled_date) || ' days'
    when pl.actual_date < pl.scheduled_date - 2 then 'Early by ' || (pl.scheduled_date - pl.actual_date) || ' days'
    else 'On schedule' end as compliance,
  pl.planned_plants, round(coalesce(pl.planned_lbs,0)::numeric,1) as planned_lbs,
  pl.planned_gap_days as planned_gap_days,
  null::text as room_now, null::numeric as days_in_dry
from pulls pl
union all
select
  'Dry', null, m.room, m.strains,
  m.harvest_start, (m.harvest_start + ((select threshold from r where rule_key='dry_max_days')::int)),
  case when m.stage like 'Drying%' and m.days_since_takedown > (select threshold from r where rule_key='dry_max_days')
       then m.days_since_takedown - ((select threshold from r where rule_key='dry_max_days')::int) end,
  case
    when m.stage not like 'Drying%' and m.stage <> 'Curing / Trim' then 'Dry complete'
    when m.days_since_takedown > (select threshold from r where rule_key='dry_max_days')
      then 'DRY DEADLINE BLOWN by ' || (m.days_since_takedown - ((select threshold from r where rule_key='dry_max_days')::int)) || ' days'
    when m.days_since_takedown >= (select threshold from r where rule_key='dry_target_days')
      then 'At dry target - finish now'
    else 'On schedule' end,
  m.plants, round(coalesce(m.wet_weight,0)/453.592, 1), null,
  m.room, m.days_since_takedown
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived');

create or replace view v_schedule_scorecard as
select event_type,
  count(*) filter (where compliance = 'On schedule' or compliance = 'Dry complete' or compliance = 'Scheduled')::numeric as on_schedule,
  count(*) filter (where compliance like 'LATE%' or compliance like 'DRY DEADLINE%')::numeric as late,
  count(*) filter (where compliance like 'MISSED%')::numeric as missed,
  count(*) filter (where compliance like 'Early%')::numeric as early,
  count(*)::numeric as total,
  round(100.0 * count(*) filter (where compliance in ('On schedule','Dry complete','Scheduled')) / nullif(count(*),0), 1) as pct_on_schedule,
  round(avg(days_off_schedule) filter (where days_off_schedule > 0)::numeric, 1) as average_days_late
from v_schedule_compliance group by event_type;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, v.adm, false
from (values
  ('Schedule Compliance (pulls & drying)', 23, 'shield', 'schedule_compliance', 'v_schedule_compliance', 'Every scheduled pull and every drying batch against the every-other-week timeline: scheduled date, what actually happened, days off schedule, and whether it was on schedule, late, missed entirely, or has blown the drying deadline.', false),
  ('Schedule Scorecard', 24, 'gauge', 'schedule_scorecard', 'v_schedule_scorecard', 'The honest count: how many pulls and dries were on schedule, late, missed or early, the percentage on schedule, and the average number of days late.', false),
  ('Modify Harvest Schedule', 25, 'clock', 'harvest_pulls_edit', 'harvest_pulls', 'The master eight-week harvest schedule - change a pull date, room, plant count or projection here and every alert, planner event and compliance measure follows immediately.', true)
) v(l, io, ic, vk, tr, d, adm)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select event_type, on_schedule, late, missed, total, pct_on_schedule, average_days_late from v_schedule_scorecard;;
