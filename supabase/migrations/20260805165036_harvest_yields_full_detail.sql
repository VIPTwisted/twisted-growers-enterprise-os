drop view if exists v_metrc_harvest_yields;
-- One row per harvest: name, strain, room, plan versus actual, losses,
-- who asked for the material, who approved it, where it went, and what became of it.
create view v_metrc_harvest_yields as
with h as (
  select mh.license, mh.name as harvest_name,
    coalesce(mh.raw->>'SourceStrainNames', 'not recorded') as strain,
    coalesce(mh.raw->>'DryingLocationName','(no room)') as room,
    mh.harvest_start,
    (mh.raw->>'FinishedDate')::date as finished_on,
    coalesce((mh.raw->>'PlantCount')::numeric,0) as plants,
    coalesce((mh.raw->>'TotalWetWeight')::numeric,0) as wet_g,
    coalesce((mh.raw->>'TotalWasteWeight')::numeric,0) as waste_g,
    coalesce((mh.raw->>'TotalPackagedWeight')::numeric,0) as packaged_g,
    coalesce((mh.raw->>'CurrentWeight')::numeric,0) as current_g,
    mh.raw->>'LabTestingState' as lab_state
  from metrc_harvests mh
),
plan as (
  select p.pull_no, p.harvest_date, p.flower_room, p.cultivars,
    p.original_total_plants as planned_plants,
    p.proj_harvest_weight_lbs as planned_lbs
  from harvest_pulls p
)
select
  h.harvest_name,
  h.strain,
  h.room,
  h.harvest_start as takedown_date,
  h.finished_on,
  m.stage as current_stage,
  m.days_since_takedown as days_since_takedown,
  -- plan versus actual
  pl.pull_no as planned_pull,
  pl.planned_plants,
  h.plants as actual_plants,
  round(coalesce(pl.planned_lbs,0)::numeric, 1) as projected_lbs,
  round((h.wet_g / 453.592)::numeric, 1) as actual_wet_lbs,
  round((h.packaged_g / 453.592)::numeric, 1) as actual_packaged_lbs,
  case when coalesce(pl.planned_lbs,0) > 0
    then round((100.0 * (h.packaged_g / 453.592) / pl.planned_lbs)::numeric, 1) end as pct_of_projection,
  case when coalesce(pl.planned_lbs,0) > 0
    then round(((h.packaged_g / 453.592) - pl.planned_lbs)::numeric, 1) end as variance_lbs,
  -- losses
  round((h.waste_g / 453.592)::numeric, 1) as waste_lbs,
  case when h.wet_g > 0 then round((100.0 * h.waste_g / h.wet_g)::numeric, 1) end as waste_pct,
  case when h.wet_g > 0 then round((100.0 * h.packaged_g / h.wet_g)::numeric, 1) end as yield_pct,
  -- allocation: who asked, who decided, where it went
  (select count(*) from allocation_requests a
     where a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%') as allocation_requests,
  (select string_agg(distinct a.requester_name, ', ') from allocation_requests a
     where a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%') as requested_by,
  (select string_agg(distinct a.decider_name, ', ') from allocation_requests a
     where (a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%')
       and a.status = 'approved') as approved_by,
  (select round(sum(coalesce(a.approved_quantity, a.quantity))::numeric, 1) from allocation_requests a
     where (a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%')
       and a.status = 'approved') as allocated_quantity,
  (select string_agg(distinct a.destination, ', ') from allocation_requests a
     where (a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%')
       and a.status = 'approved') as allocated_to,
  (select string_agg(distinct a.purpose, ' · ') from allocation_requests a
     where (a.source_ref ilike '%' || h.harvest_name || '%' or a.material_name ilike '%' || h.strain || '%')
       and a.status = 'approved') as allocated_for,
  -- what became of it
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%') as packages_made,
  (select string_agg(distinct nullif(p.raw->>'ProductCategoryName',''), ', ') from metrc_packages p
     where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%') as manufactured_into,
  (select round(sum(coalesce(p.quantity,0))::numeric,1) from metrc_packages p
     where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%'
       and p.source_state in ('active','onhold')) as still_on_hand,
  (select string_agg(distinct p.location, ', ') from metrc_packages p
     where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%'
       and p.source_state in ('active','onhold')) as sitting_in,
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%'
     and p.lab_testing_state = 'TestPassed') as passed_testing,
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || h.harvest_name || '%'
     and p.source_state = 'intransit') as shipped_out,
  h.lab_state,
  h.license
from h
left join v_harvest_stage_map m on m.harvest = h.harvest_name
left join plan pl on pl.flower_room = h.room and h.harvest_start between pl.harvest_date - 4 and pl.harvest_date + 10
order by h.harvest_start desc nulls last;
update nav_registry set description = 'One row per harvest with the whole story: strain, room, takedown date, current stage and days there, planned versus actual plants and pounds, percentage of projection and variance, waste and yield percentages, who requested the material and who approved it, how much was allocated and to what, what it was manufactured into, what is still on hand and where it sits, testing outcomes, and what shipped.'
where view_key = 'metrc_rpt_yields';
select harvest_name, strain, room, current_stage, planned_plants, actual_plants, projected_lbs, actual_packaged_lbs, pct_of_projection, waste_pct, yield_pct, packages_made, still_on_hand, left(coalesce(sitting_in,'-'),30) sitting_in
from v_metrc_harvest_yields limit 6;;
