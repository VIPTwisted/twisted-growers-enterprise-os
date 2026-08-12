drop view if exists v_harvest_issues cascade;
drop view if exists v_harvest_forensic cascade;

create view v_harvest_forensic as
with h as (
  select
    name as harvest_name, license,
    coalesce(nullif(raw->>'SourceStrainNames',''),'(not recorded)') as strain,
    coalesce(nullif(raw->>'DryingLocationName',''),'(not recorded)') as drying_room,
    raw->>'HarvestType' as harvest_type,
    harvest_start,
    (raw->>'FinishedDate')::date as finished_date,
    (raw->>'PlantCount')::int as plants,
    wet_weight as wet_g, waste_weight as waste_g,
    (raw->>'TotalPackagedWeight')::numeric as packaged_g,
    (raw->>'CurrentWeight')::numeric as current_g,
    package_count, raw->>'LabTestingState' as lab_state,
    (raw->>'IsOnHold')::boolean as on_hold
  from metrc_harvests
),
pk as (
  select h.harvest_name,
    min(p.packaged_on)::date as first_package_on,
    max(p.packaged_on)::date as last_package_on,
    count(*) as packages_made,
    count(*) filter (where p.raw->>'LabTestingState'='TestFailed') as failed_packages,
    count(*) filter (where p.raw->>'LabTestingState'='TestPassed') as passed_packages,
    count(*) filter (where p.raw->>'LabTestingState'='NotSubmitted') as untested_packages,
    round(sum(p.quantity) filter (where p.raw#>>'{Item,ProductCategoryName}' ilike '%bud%')/453.592,2) as bud_lb,
    round(sum(p.quantity) filter (where p.raw#>>'{Item,ProductCategoryName}' ilike '%shake%'
        or p.raw#>>'{Item,ProductCategoryName}' ilike '%trim%')/453.592,2) as shake_trim_lb,
    string_agg(distinct p.raw#>>'{Item,ProductCategoryName}', ', ') as categories_made
  from h join metrc_packages p
    on (', '||coalesce(p.raw->>'SourceHarvestNames','')||', ') like ('%, '||h.harvest_name||', %')
    or p.raw->>'SourceHarvestNames' = h.harvest_name
  group by 1
)
select
  h.harvest_name, h.license, h.strain, h.drying_room, h.harvest_type,
  -- the timeline
  h.harvest_start as harvest_started,
  pk.first_package_on as first_package_taken_off,
  pk.last_package_on as last_package_taken_off,
  h.finished_date as harvest_closed,
  (pk.first_package_on - h.harvest_start) as dry_days_to_first_package,
  (pk.last_package_on - pk.first_package_on) as packaging_window_days,
  coalesce(h.finished_date, current_date) - h.harvest_start as total_days_start_to_now,
  -- the weights
  h.plants,
  round(h.wet_g/453.592,2) wet_lb,
  round(h.packaged_g/453.592,2) packaged_lb,
  round(h.waste_g/453.592,2) waste_lb,
  round(h.current_g/453.592,2) still_in_room_lb,
  pk.bud_lb, pk.shake_trim_lb, pk.categories_made,
  coalesce(pk.packages_made,0) packages_made,
  coalesce(pk.passed_packages,0) passed_packages,
  coalesce(pk.failed_packages,0) failed_packages,
  coalesce(pk.untested_packages,0) untested_packages,
  h.lab_state, h.on_hold,
  -- the ratios
  round(h.wet_g/nullif(h.plants,0),1) as wet_g_per_plant,
  round(h.packaged_g/nullif(h.plants,0),1) as packaged_g_per_plant,
  round(h.packaged_g/nullif(h.wet_g,0)*100,1) as conversion_pct,
  round(h.waste_g/nullif(h.wet_g,0)*100,1) as waste_pct_of_wet,
  round(h.wet_g/nullif(h.packaged_g,0),2) as wet_to_dry_ratio,
  case when h.finished_date is null then 'STILL OPEN - not finished' else 'Finished' end as harvest_state,
  -- the drying verdict
  case
    when pk.first_package_on is null then 'NOTHING PACKAGED YET - no dry time can be measured'
    when (pk.first_package_on - h.harvest_start) < 7 then 'DRIED TOO FAST: '||(pk.first_package_on - h.harvest_start)||' days. Under 7 days locks in moisture and chlorophyll - harsh smoke and mould risk.'
    when (pk.first_package_on - h.harvest_start) between 7 and 16 then 'DRY TIME NORMAL: '||(pk.first_package_on - h.harvest_start)||' days, inside the 10 to 14 day target.'
    when (pk.first_package_on - h.harvest_start) between 17 and 30 then 'DRIED TOO LONG: '||(pk.first_package_on - h.harvest_start)||' days. Every extra day past 14 burns off saleable weight permanently.'
    else 'DRY TIME FAR OVER: '||(pk.first_package_on - h.harvest_start)||' days from cut to first package. This is not drying, this is product sitting.'
  end as drying_verdict,
  -- the diagnosis
  case
    when h.finished_date is null and (current_date - h.harvest_start) > 21
      then 'OPEN TOO LONG: cut '||(current_date - h.harvest_start)||' days ago, still not closed. '||round(h.current_g/453.592,2)||' lb is sitting in '||h.drying_room||' unsold, and its unfinished conversion drags the monthly average down.'
    when h.finished_date is null then 'IN PROCESS: normal. Exclude from conversion averages until it closes.'
    when h.plants is null or h.plants = 0 then 'NO PLANT COUNT RECORDED: yield per plant cannot be computed.'
    when h.wet_g = 0 then 'NO WET WEIGHT RECORDED: conversion cannot be computed.'
    when h.packaged_g = 0 then 'CLOSED WITH ZERO PACKAGED: '||round(h.wet_g/453.592,2)||' lb went in and no package came out. Either weight went unrecorded or the close was premature.'
    when h.packaged_g/nullif(h.wet_g,0) > 0.35
      then 'CONVERSION IMPLAUSIBLY HIGH at '||round(h.packaged_g/nullif(h.wet_g,0)*100,1)||' percent. Fresh flower is 75 to 80 percent water, so this means the WET weight was recorded too LOW - not that the harvest did well. Check the takedown scale.'
    when h.packaged_g/nullif(h.wet_g,0) < 0.15
      then 'CONVERSION LOW at '||round(h.packaged_g/nullif(h.wet_g,0)*100,1)||' percent against a 20 to 25 percent norm. Either real loss in dry and trim, or the wet weight was recorded too HIGH.'
    else 'NORMAL: '||round(h.packaged_g/nullif(h.wet_g,0)*100,1)||' percent sits inside the 20 to 25 percent wet-to-packaged norm for indoor flower.'
  end as what_is_wrong,
  case
    when h.finished_date is null and (current_date - h.harvest_start) > 21 then 'CRITICAL'
    when h.finished_date is not null and h.packaged_g = 0 then 'CRITICAL'
    when h.finished_date is null then 'INFO'
    when h.plants is null or h.plants = 0 or h.wet_g = 0 then 'HIGH'
    when (pk.first_package_on - h.harvest_start) > 16 or (pk.first_package_on - h.harvest_start) < 7 then 'HIGH'
    when h.packaged_g/nullif(h.wet_g,0) > 0.35 or h.packaged_g/nullif(h.wet_g,0) < 0.15 then 'MEDIUM'
    else 'OK' end as severity
from h left join pk on pk.harvest_name = h.harvest_name;

create view v_harvest_issues as
select * from v_harvest_forensic where severity <> 'OK'
order by case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,
  total_days_start_to_now desc;

drop view if exists v_dry_room_performance cascade;
create view v_dry_room_performance as
select drying_room,
  count(*) harvests, sum(plants) plants,
  round(sum(wet_lb),1) wet_lb, round(sum(packaged_lb),1) packaged_lb,
  round(sum(still_in_room_lb),1) sitting_unfinished_lb,
  round(avg(dry_days_to_first_package),1) avg_dry_days,
  min(dry_days_to_first_package) fastest_dry_days,
  max(dry_days_to_first_package) slowest_dry_days,
  count(*) filter (where dry_days_to_first_package > 16) dried_too_long,
  count(*) filter (where dry_days_to_first_package < 7) dried_too_fast,
  count(*) filter (where harvest_state like 'STILL OPEN%') still_open,
  round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1) conversion_pct
from v_harvest_forensic group by 1 order by 3 desc nulls last;;
