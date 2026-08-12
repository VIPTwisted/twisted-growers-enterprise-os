drop view if exists v_metrc_seed_to_sale;
-- Per strain, the whole story: what was grown, what it weighed, what was lost,
-- what got manufactured from it, where it sits now, and what left the building.
create view v_metrc_seed_to_sale as
with harv as (
  select coalesce(h.raw->>'SourceStrainNames', 'Unassigned') as strain,
    count(*) as harvests,
    sum(coalesce((h.raw->>'PlantCount')::numeric,0)) as plants_harvested,
    sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)) as wet_g,
    sum(coalesce((h.raw->>'TotalWasteWeight')::numeric,0)) as waste_g,
    sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)) as packaged_g,
    string_agg(distinct coalesce(h.raw->>'DryingLocationName',''), ', ') filter (where h.raw->>'FinishedDate' is null) as rooms_now,
    max(h.harvest_start) as last_harvest
  from metrc_harvests h group by 1
),
pk as (
  select coalesce(nullif(p.raw->>'SourceHarvestNames',''),'(no source)') as src,
    p.tag, p.item_name, p.quantity, p.uom, p.location, p.lab_testing_state, p.source_state,
    coalesce(p.raw->>'ProductCategoryName','') as product_category
  from metrc_packages p
),
live as (
  select strain, sum(plants) as plants_live from (
    select coalesce(strain,'Unassigned') as strain, count(*) as plants
    from metrc_plants where source_state in ('vegetative','flowering','onhold') group by 1
  ) x group by 1
)
select
  h.strain,
  coalesce(l.plants_live, 0) as plants_growing_now,
  h.plants_harvested,
  h.harvests as harvest_events,
  round((h.wet_g / 453.592)::numeric, 1) as wet_weight_lbs,
  round((h.waste_g / 453.592)::numeric, 1) as waste_lbs,
  case when h.wet_g > 0 then round((100.0 * h.waste_g / h.wet_g)::numeric, 1) end as waste_pct,
  round((h.packaged_g / 453.592)::numeric, 1) as packaged_lbs,
  case when h.wet_g > 0 then round((100.0 * h.packaged_g / h.wet_g)::numeric, 1) end as yield_pct,
  (select count(*) from pk where pk.src ilike '%' || h.strain || '%') as packages_made,
  (select string_agg(distinct pk.product_category, ', ') from pk
     where pk.src ilike '%' || h.strain || '%' and pk.product_category <> '') as manufactured_into,
  (select round(sum(coalesce(pk.quantity,0))::numeric,1) from pk
     where pk.src ilike '%' || h.strain || '%' and pk.source_state in ('active','onhold')) as on_hand_now,
  (select string_agg(distinct pk.location, ', ') from pk
     where pk.src ilike '%' || h.strain || '%' and pk.source_state in ('active','onhold') and pk.location is not null) as sitting_in,
  (select count(*) from pk where pk.src ilike '%' || h.strain || '%' and pk.lab_testing_state = 'TestPassed') as packages_passed_testing,
  (select count(*) from pk where pk.src ilike '%' || h.strain || '%' and pk.lab_testing_state = 'TestFailed') as packages_failed_testing,
  (select count(*) from pk where pk.src ilike '%' || h.strain || '%' and pk.source_state = 'intransit') as packages_shipped_out,
  nullif(h.rooms_now,'') as still_in_rooms,
  h.last_harvest
from harv h
left join live l on l.strain = h.strain
where h.strain <> 'Unassigned'
order by h.wet_g desc nulls last;
update nav_registry set description = 'Per strain, the whole story: plants growing now, plants harvested, wet weight, waste and waste percentage, packaged weight and yield percentage, packages made, what it was manufactured into, quantity on hand, which rooms it sits in, packages that passed and failed testing, and packages shipped out.'
where view_key = 'metrc_rpt_seed_to_sale';
select strain, plants_harvested, wet_weight_lbs, waste_pct, packaged_lbs, yield_pct, packages_made, manufactured_into, on_hand_now, sitting_in
from v_metrc_seed_to_sale limit 6;;
