-- Every harvest, milestone by milestone, with the deadline, what actually happened,
-- how many days late, and who is holding up the room.
create or replace view v_harvest_lifecycle as
with a as (
  select h.license, h.name as harvest,
    coalesce(h.raw->>'SourceStrainNames', h.name) as strain,
    coalesce(h.raw->>'DryingLocationName','(no room)') as room,
    h.harvest_start as takedown_actual,
    (h.raw->>'FinishedDate')::date as finished_actual,
    coalesce((h.raw->>'PlantCount')::numeric,0) as plants,
    coalesce((h.raw->>'TotalWetWeight')::numeric,0) as wet_g,
    coalesce((h.raw->>'TotalWasteWeight')::numeric,0) as waste_g,
    coalesce((h.raw->>'TotalPackagedWeight')::numeric,0) as packaged_g,
    h.raw->>'LabTestingState' as lab_state
  from metrc_harvests h where h.harvest_start is not null
),
p as (
  select pl.pull_no, pl.harvest_date as planned_date, pl.flower_room, pl.cultivars,
    pl.dry_start as planned_dry_start, pl.dry_day_10 as planned_dry_target,
    pl.dry_day_14 as planned_dry_deadline, pl.day2_replant_date as planned_replant,
    pl.proj_harvest_weight_lbs as planned_lbs, pl.original_total_plants as planned_plants
  from harvest_pulls pl
),
r as (select threshold, rule_key from harvest_alert_rules where active)
select
  a.harvest, a.strain, a.room, a.license,
  -- STAGE 1: the plan
  p.pull_no as planned_pull, p.planned_date, p.planned_plants,
  round(coalesce(p.planned_lbs,0)::numeric,1) as planned_lbs,
  -- STAGE 2: takedown
  a.takedown_actual,
  case when p.planned_date is null then 'No matching plan'
       when a.takedown_actual > p.planned_date then 'LATE by ' || (a.takedown_actual - p.planned_date) || ' days'
       when a.takedown_actual < p.planned_date then 'Early by ' || (p.planned_date - a.takedown_actual) || ' days'
       else 'On the planned date' end as takedown_status,
  a.plants as actual_plants,
  case when p.planned_plants > 0 then round((100.0 * a.plants / p.planned_plants)::numeric,1) end as plants_pct_of_plan,
  -- STAGE 3: drying, against the 10 and 14 day rules
  (current_date - a.takedown_actual) as days_since_takedown,
  (a.takedown_actual + ((select threshold from r where rule_key='dry_target_days')::int)) as dry_target_date,
  (a.takedown_actual + ((select threshold from r where rule_key='dry_max_days')::int)) as dry_deadline_date,
  case
    when a.finished_actual is not null then 'Dry complete on ' || a.finished_actual
    when (current_date - a.takedown_actual) > (select threshold from r where rule_key='dry_max_days')
      then 'DRY DEADLINE BLOWN - day ' || (current_date - a.takedown_actual) || ' of ' || (select threshold from r where rule_key='dry_max_days')::int
    when (current_date - a.takedown_actual) >= (select threshold from r where rule_key='dry_target_days')
      then 'At dry target - day ' || (current_date - a.takedown_actual) || ', finish it'
    else 'Drying on track - day ' || (current_date - a.takedown_actual) end as drying_status,
  -- STAGE 4: weights reported
  case when a.wet_g > 0 then 'Reported' 
       when (current_date - a.takedown_actual) >= (select threshold from r where rule_key='weights_due_days')
         then 'WEIGHTS NOT REPORTED - ' || (current_date - a.takedown_actual) || ' days after takedown'
       else 'Due within ' || ((select threshold from r where rule_key='weights_due_days')::int - (current_date - a.takedown_actual)) || ' days' end as weights_status,
  round((a.wet_g/453.592)::numeric,1) as wet_lbs,
  round((a.waste_g/453.592)::numeric,1) as waste_lbs,
  case when a.wet_g>0 then round((100.0*a.waste_g/a.wet_g)::numeric,1) end as waste_pct,
  -- STAGE 5: packaging and yield versus the projection
  round((a.packaged_g/453.592)::numeric,1) as packaged_lbs,
  case when a.wet_g>0 then round((100.0*a.packaged_g/a.wet_g)::numeric,1) end as yield_pct,
  case when coalesce(p.planned_lbs,0)>0
    then round(((a.packaged_g/453.592) - p.planned_lbs)::numeric,1) end as lbs_vs_plan,
  (select count(*) from metrc_packages k where coalesce(k.raw->>'SourceHarvestNames','') ilike '%'||a.harvest||'%') as packages_made,
  -- STAGE 6: allocation
  (select count(*) from allocation_requests ar where ar.source_ref ilike '%'||a.harvest||'%' or ar.strain ilike '%'||a.strain||'%') as allocation_requests,
  (select string_agg(distinct ar.requester_name||' -> '||coalesce(ar.decider_name,'awaiting decision')||' ('||ar.status||')', '; ')
     from allocation_requests ar where ar.source_ref ilike '%'||a.harvest||'%' or ar.strain ilike '%'||a.strain||'%') as allocation_chain,
  -- STAGE 7: sold
  (select count(*) from metrc_packages k where coalesce(k.raw->>'SourceHarvestNames','') ilike '%'||a.harvest||'%' and k.source_state='intransit') as packages_shipped,
  a.lab_state,
  -- THE VERDICT
  case
    when a.finished_actual is null and (current_date - a.takedown_actual) > (select threshold from r where rule_key='dry_max_days') then 'BLOCKING THE ROOM'
    when a.wet_g = 0 and (current_date - a.takedown_actual) >= (select threshold from r where rule_key='weights_due_days') then 'MISSING WEIGHTS'
    when p.planned_date is not null and a.takedown_actual > p.planned_date + 2 then 'HARVESTED LATE'
    when a.wet_g > 0 and (100.0*a.waste_g/nullif(a.wet_g,0)) > (select threshold from r where rule_key='waste_pct_max') then 'EXCESS WASTE'
    when a.finished_actual is not null then 'Complete'
    else 'On track' end as verdict
from a
left join p on p.flower_room = a.room and a.takedown_actual between p.planned_date - 4 and p.planned_date + 10
order by
  case when a.finished_actual is null then 0 else 1 end,
  a.takedown_actual desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
  'Harvest Lifecycle & Deadlines', 24, 'clock', 'harvest_lifecycle', 'v_harvest_lifecycle',
  'Every harvest milestone by milestone: planned pull date versus actual takedown and how many days late, plants against plan, day count in drying with the target and deadline dates, whether weights were reported and how late, waste and yield against projection, packages made, the allocation chain from requester to approver, what shipped, and a plain verdict naming anything blocking a room or missing weights.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'harvest_lifecycle');
select verdict, count(*) n from v_harvest_lifecycle group by 1 order by n desc;;
