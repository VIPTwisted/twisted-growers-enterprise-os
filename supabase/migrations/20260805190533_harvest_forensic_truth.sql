drop view if exists v_harvest_forensic cascade;
create view v_harvest_forensic as
with h as (
  select
    name as harvest_name,
    license,
    coalesce(nullif(raw->>'SourceStrainNames',''),'(not recorded)') as strain,
    coalesce(nullif(raw->>'DryingLocationName',''),'(not recorded)') as drying_room,
    raw->>'HarvestType' as harvest_type,
    harvest_start,
    (raw->>'FinishedDate')::date as finished_date,
    (raw->>'PlantCount')::int as plants,
    wet_weight as wet_g,
    waste_weight as waste_g,
    (raw->>'TotalPackagedWeight')::numeric as packaged_g,
    (raw->>'CurrentWeight')::numeric as current_g,
    (raw->>'TotalRestoredWeight')::numeric as restored_g,
    package_count,
    raw->>'LabTestingState' as lab_state,
    (raw->>'IsOnHold')::boolean as on_hold
  from metrc_harvests
)
select
  harvest_name, license, strain, drying_room, harvest_start, finished_date, plants,
  round(wet_g/453.592,2) wet_lb,
  round(packaged_g/453.592,2) packaged_lb,
  round(waste_g/453.592,2) waste_lb,
  round(current_g/453.592,2) still_in_room_lb,
  package_count, lab_state, on_hold,
  case when finished_date is null then 'STILL OPEN - not finished'
       else 'Finished' end as harvest_state,
  case when finished_date is null then (current_date - harvest_start)
       else (finished_date - harvest_start) end as days_in_process,
  round(wet_g/nullif(plants,0),1) as wet_g_per_plant,
  round(packaged_g/nullif(plants,0),1) as packaged_g_per_plant,
  round(packaged_g/nullif(wet_g,0)*100,1) as conversion_pct,
  round((wet_g - packaged_g - waste_g - current_g)/453.592,2) as unaccounted_lb,
  -- the diagnosis
  case
    when finished_date is null and (current_date - harvest_start) > 21
      then 'OPEN TOO LONG: harvested ' || (current_date - harvest_start) || ' days ago and still not finished. Cannot be measured, cannot be sold, and its conversion drags the monthly average down while it sits.'
    when finished_date is null
      then 'IN PROCESS: normal, still drying or being packaged. Exclude from conversion averages until finished.'
    when plants is null or plants = 0
      then 'NO PLANT COUNT RECORDED: yield per plant cannot be computed for this harvest.'
    when wet_g = 0
      then 'NO WET WEIGHT RECORDED: conversion cannot be computed.'
    when packaged_g = 0
      then 'FINISHED WITH ZERO PACKAGED: closed out without a single package. Either the weight went somewhere unrecorded or the close was premature.'
    when abs(wet_g - packaged_g - waste_g - current_g) > wet_g * 0.05
      then 'WEIGHT DOES NOT RECONCILE: ' || round((wet_g - packaged_g - waste_g - current_g)/453.592,2) || ' lb of the wet weight is not explained by packages, waste, or what remains in the room.'
    when packaged_g/nullif(wet_g,0) > 0.35
      then 'CONVERSION IMPLAUSIBLY HIGH: ' || round(packaged_g/nullif(wet_g,0)*100,1) || ' percent. Fresh cannabis is roughly 75 to 80 percent water, so wet to packaged above about 30 percent means the WET weight was recorded too low, not that the harvest did well.'
    when packaged_g/nullif(wet_g,0) < 0.15
      then 'CONVERSION LOW: ' || round(packaged_g/nullif(wet_g,0)*100,1) || ' percent against a 20 to 25 percent norm. Either real loss in dry and trim, or the wet weight was recorded too high.'
    else 'NORMAL: ' || round(packaged_g/nullif(wet_g,0)*100,1) || ' percent sits inside the 20 to 25 percent wet-to-packaged norm for indoor flower.'
  end as what_is_wrong,
  case
    when finished_date is null and (current_date - harvest_start) > 21
      then 'CRITICAL' when packaged_g = 0 and finished_date is not null then 'CRITICAL'
    when finished_date is null then 'INFO'
    when plants is null or plants = 0 or wet_g = 0 then 'HIGH'
    when abs(wet_g - packaged_g - waste_g - current_g) > wet_g * 0.05 then 'HIGH'
    when packaged_g/nullif(wet_g,0) > 0.35 or packaged_g/nullif(wet_g,0) < 0.15 then 'MEDIUM'
    else 'OK' end as severity
from h;

drop view if exists v_harvest_issues cascade;
create view v_harvest_issues as
select * from v_harvest_forensic where severity <> 'OK' order by
  case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,
  harvest_start desc;

drop view if exists v_harvest_benchmark_note cascade;
create view v_harvest_benchmark_note as
select
  'Wet to packaged' as measure,
  '20 to 25 percent' as published_norm,
  'Fresh cannabis is 75-80 percent water. A 4:1 to 5:1 wet:dry ratio is the standard commercial expectation.' as why,
  'Any month above about 30 percent means the wet weight was recorded low, not that yield was high.' as how_to_read
union all select
  'Grams per square foot of canopy',
  '35 g/sq ft start-up, 50 to 70 g/sq ft established',
  'This is the benchmark commercial cultivators actually use, because it is independent of how many plants you put under the light.',
  'Grams per plant is NOT a valid benchmark - it is set by plant density and veg time, not by grower skill.'
union all select
  'Plant density',
  '0.65 to 1.0 flowering plants per square foot',
  'Published bench-production range for indoor and greenhouse.',
  'At this density, 50 g/sq ft works out to roughly 50 to 75 grams per plant - not 130.';;
