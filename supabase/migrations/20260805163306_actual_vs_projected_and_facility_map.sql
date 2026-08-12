-- Where every gram physically sits right now, across both licenses.
create or replace view v_facility_live_map as
select 'Drying / Curing' as area, m.room as location, m.license,
  count(*)::numeric as records, 'harvests' as record_type,
  round(sum(coalesce(m.current_weight, m.wet_weight, 0))::numeric, 1) as weight_on_hand,
  min(m.harvest_start) as oldest_date,
  max(m.days_since_takedown)::numeric as oldest_days,
  string_agg(distinct m.stage, ' · ') as stages,
  string_agg(distinct m.strains, ', ') as contents
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived') and coalesce(m.room,'') <> ''
group by 1,2,3
union all
select 'Packaged inventory', coalesce(p.location,'(no location)'), p.license,
  count(*)::numeric, 'packages',
  round(sum(coalesce(p.quantity,0))::numeric, 1),
  min(p.packaged_on), max(current_date - p.packaged_on)::numeric,
  string_agg(distinct coalesce(p.lab_testing_state,'—'), ' · '),
  string_agg(distinct p.item_name, ', ')
from metrc_packages p
where p.source_state in ('active','onhold')
group by 1,2,3
union all
select 'In transit', coalesce(p.location,'(manifested)'), p.license,
  count(*)::numeric, 'packages',
  round(sum(coalesce(p.quantity,0))::numeric, 1),
  min(p.packaged_on), max(current_date - p.packaged_on)::numeric,
  'Leaving the facility', string_agg(distinct p.item_name, ', ')
from metrc_packages p where p.source_state = 'intransit'
group by 1,2,3;

-- Planned pull versus what Metrc actually recorded: plants, weights, variance.
create or replace view v_harvest_plan_vs_actual as
with plan as (
  select p.pull_no, p.harvest_date, p.flower_room, p.cultivars,
    p.original_total_plants as planned_plants,
    p.proj_harvest_weight_lbs as planned_lbs,
    p.dry_day_14 as dry_deadline
  from harvest_pulls p
),
act as (
  select h.harvest_start, coalesce(h.raw->>'DryingLocationName','') as room,
    sum((h.raw->>'PlantCount')::numeric) as actual_plants,
    sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)) as actual_wet_g,
    sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)) as actual_packaged_g,
    sum(coalesce((h.raw->>'TotalWasteWeight')::numeric,0)) as actual_waste_g,
    count(*) as harvest_records,
    string_agg(distinct h.name, ', ') as harvests
  from metrc_harvests h
  where h.harvest_start is not null
  group by 1,2
)
select pl.pull_no, pl.harvest_date as planned_date, pl.flower_room, pl.cultivars,
  pl.planned_plants, round(pl.planned_lbs::numeric,1) as planned_lbs,
  a.harvest_start as actual_date, a.room as actual_room, a.harvests,
  a.actual_plants,
  round((a.actual_wet_g / 453.592)::numeric, 1) as actual_wet_lbs,
  round((a.actual_packaged_g / 453.592)::numeric, 1) as actual_packaged_lbs,
  round((a.actual_waste_g / 453.592)::numeric, 1) as actual_waste_lbs,
  case when a.harvest_start is null then 'NOT HARVESTED'
       when a.harvest_start > pl.harvest_date then 'Late by ' || (a.harvest_start - pl.harvest_date) || ' days'
       when a.harvest_start < pl.harvest_date then 'Early by ' || (pl.harvest_date - a.harvest_start) || ' days'
       else 'On plan' end as timing,
  case when a.actual_plants is not null and pl.planned_plants > 0
       then round((100.0 * a.actual_plants / pl.planned_plants)::numeric, 1) end as plants_pct_of_plan,
  case when a.actual_packaged_g > 0 and pl.planned_lbs > 0
       then round((100.0 * (a.actual_packaged_g / 453.592) / pl.planned_lbs)::numeric, 1) end as weight_pct_of_plan,
  pl.dry_deadline
from plan pl
left join act a on a.harvest_start between pl.harvest_date - 4 and pl.harvest_date + 10
order by pl.harvest_date desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Facility Live Map', 30, 'box', 'facility_live_map', 'v_facility_live_map', 'Where every gram physically sits right now: each drying and curing room, every inventory location, and everything in transit - with weight on hand, how long it has been there, and what is in it.'),
  ('Plan vs Actual Harvests', 31, 'scale', 'harvest_plan_actual', 'v_harvest_plan_vs_actual', 'Every planned pull against what Metrc actually recorded: planned versus actual plants and pounds, timing variance, packaged and waste weight, and pulls that never happened.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select area, location, records, weight_on_hand, oldest_days from v_facility_live_map order by weight_on_hand desc limit 8;;
