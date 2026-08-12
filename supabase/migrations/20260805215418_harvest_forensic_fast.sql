drop view if exists v_harvest_issues cascade;
drop view if exists v_monthly_conversion_truth cascade;
drop view if exists v_dry_room_performance cascade;
drop view if exists v_yield_versus_industry cascade;
drop view if exists v_cultivation_meeting_pack cascade;
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
)
select
  h.harvest_name, h.license, h.strain, h.drying_room, h.harvest_type,
  h.harvest_start as harvest_started,
  pk.first_package_on as first_package_taken_off,
  pk.last_package_on as last_package_taken_off,
  h.finished_date as harvest_closed,
  (pk.first_package_on - h.harvest_start) as dry_days_to_first_package,
  (pk.last_package_on - pk.first_package_on) as packaging_window_days,
  coalesce(h.finished_date, current_date) - h.harvest_start as total_days_start_to_now,
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
  round(h.wet_g/nullif(h.plants,0),1) as wet_g_per_plant,
  round(h.packaged_g/nullif(h.plants,0),1) as packaged_g_per_plant,
  round(h.packaged_g/nullif(h.wet_g,0)*100,1) as conversion_pct,
  round(h.waste_g/nullif(h.wet_g,0)*100,1) as waste_pct_of_wet,
  round(h.wet_g/nullif(h.packaged_g,0),2) as wet_to_dry_ratio,
  case when h.finished_date is null then 'STILL OPEN - not finished' else 'Finished' end as harvest_state,
  case
    when pk.first_package_on is null then 'NOTHING PACKAGED YET - no dry time can be measured'
    when (pk.first_package_on - h.harvest_start) < 7 then 'DRIED TOO FAST: '||(pk.first_package_on - h.harvest_start)||' days. Under 7 days locks in moisture and chlorophyll - harsh smoke and mould risk.'
    when (pk.first_package_on - h.harvest_start) between 7 and 16 then 'DRY TIME NORMAL: '||(pk.first_package_on - h.harvest_start)||' days, inside the 10 to 14 day target.'
    when (pk.first_package_on - h.harvest_start) between 17 and 30 then 'DRIED TOO LONG: '||(pk.first_package_on - h.harvest_start)||' days. Every extra day past 14 burns off saleable weight permanently.'
    else 'DRY TIME FAR OVER: '||(pk.first_package_on - h.harvest_start)||' days from cut to first package. This is not drying, this is product sitting.'
  end as drying_verdict,
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
from h left join mv_harvest_pkg_rollup pk on pk.harvest_name = h.harvest_name;

create view v_harvest_issues as
select * from v_harvest_forensic where severity <> 'OK'
order by case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,
  total_days_start_to_now desc;

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
from v_harvest_forensic group by 1 order by 3 desc nulls last;

create view v_monthly_conversion_truth as
select
  to_char(harvest_started,'YYYY-MM') as month,
  count(*) as harvests_cut,
  count(*) filter (where harvest_state='Finished') as harvests_closed,
  count(*) filter (where harvest_state like 'STILL OPEN%') as still_open,
  sum(plants) as plants,
  round(sum(wet_lb),1) as wet_lb,
  round(sum(packaged_lb),1) as packaged_lb,
  round(sum(still_in_room_lb),1) as sitting_unfinished_lb,
  round(sum(packaged_lb) filter (where harvest_state='Finished')
    /nullif(sum(wet_lb) filter (where harvest_state='Finished'),0)*100,1) as conversion_pct_closed_only,
  round(avg(dry_days_to_first_package),1) as avg_dry_days,
  count(*) filter (where dry_days_to_first_package > 16) as dried_too_long,
  count(*) filter (where dry_days_to_first_package < 7) as dried_too_fast,
  case
    when count(*) filter (where harvest_state like 'STILL OPEN%') > 0
      then count(*) filter (where harvest_state like 'STILL OPEN%')||' of '||count(*)||' harvests from this month are still open. This month CANNOT be judged yet.'
    when round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1) between 20 and 28 then 'NORMAL. Inside the 20-25 percent commercial norm.'
    when round(sum(packaged_lb)/nullif(sum(wet_lb),0)*100,1) > 30 then 'SUSPECT HIGH. Check whether wet weight was recorded low at takedown.'
    else 'BELOW NORM. Investigate dry duration and trim standard.'
  end as how_to_read_this_month
from v_harvest_forensic where harvest_started is not null
group by 1 order by 1 desc;

create view v_yield_versus_industry as
select m.month, m.harvests_cut, m.harvests_closed, m.still_open,
  m.plants as plants_harvested, m.wet_lb as wet_lbs, m.packaged_lb as saleable_lbs,
  m.sitting_unfinished_lb, m.conversion_pct_closed_only as our_conversion_pct,
  20 as industry_average_pct, 25 as industry_good_pct,
  round(m.packaged_lb*453.592/nullif(m.plants,0),1) as our_grams_per_plant,
  '50 to 75 (density-derived)' as industry_grams_per_plant_range,
  round(m.plants/nullif(m.packaged_lb,0),1) as our_plants_per_pound,
  m.avg_dry_days, m.dried_too_long, m.dried_too_fast,
  case
    when m.still_open > 0 then 'CANNOT BE JUDGED YET — '||m.still_open||' of '||m.harvests_cut||' harvests still open'
    when m.conversion_pct_closed_only > 30 then 'SUSPECT HIGH — check wet weight recording'
    when m.conversion_pct_closed_only >= 25 then 'GOOD'
    when m.conversion_pct_closed_only >= 20 then 'AT INDUSTRY AVERAGE'
    else 'BELOW INDUSTRY AVERAGE' end as industry_verdict,
  m.how_to_read_this_month
from v_monthly_conversion_truth m order by m.month desc;;
