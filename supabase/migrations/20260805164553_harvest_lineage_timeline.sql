-- The microscopic history of one harvest: plan, takedown, drying, packaging,
-- every package produced, its laboratory result, and every manifest that moved it.
create or replace function tg_harvest_timeline(p_match text)
returns table(
  seq int, occurred_on date, phase text, event text, detail text,
  quantity numeric, uom text, location text, status text, identifier text
) as $$
begin
  return query
  -- 1. The plan
  select 1, p.harvest_date, 'Plan', 'Pull #' || p.pull_no || ' scheduled',
    'Room ' || p.flower_room || ' · ' || coalesce(p.cultivars,'') ||
      ' · planned ' || coalesce(p.original_total_plants,0) || ' plants',
    round(coalesce(p.proj_harvest_weight_lbs,0)::numeric,1), 'lb planned',
    p.flower_room, 'Planned', 'Pull #' || p.pull_no
  from harvest_pulls p
  where p_match ilike '%' || p.flower_room || '%' or coalesce(p.cultivars,'') ilike '%' || p_match || '%'
     or p.harvest_date::text = p_match
  union all
  -- 2. Takedown and the harvest record itself
  select 2, h.harvest_start, 'Harvest', 'Takedown recorded in Metrc',
    coalesce(h.raw->>'SourceStrainNames', h.name) || ' · ' || coalesce((h.raw->>'PlantCount'),'0') || ' plants',
    coalesce((h.raw->>'TotalWetWeight')::numeric,0), coalesce(h.raw->>'UnitOfWeightName','g'),
    coalesce(h.raw->>'DryingLocationName','(no room)'),
    case when h.raw->>'FinishedDate' is not null then 'Finished' else 'Open' end, h.name
  from metrc_harvests h where h.name ilike '%' || p_match || '%'
  union all
  -- 3. Where it sits now and how long it has been there
  select 3, current_date, 'Current', 'Live stage: ' || m.stage,
    'In ' || coalesce(m.room,'(no room)') || ' for ' || coalesce(m.days_since_takedown,0) || ' days'
      || case when m.waste_pct is not null then ' · waste ' || m.waste_pct || '%' else '' end
      || case when m.yield_pct is not null then ' · yield ' || m.yield_pct || '%' else '' end,
    coalesce(m.current_weight, m.wet_weight, 0), coalesce(m.uom,'g'),
    coalesce(m.room,'(no room)'), m.stage, m.harvest
  from v_harvest_stage_map m where m.harvest ilike '%' || p_match || '%'
  union all
  -- 4. Waste and destruction recorded against it
  select 4, h.harvest_start, 'Loss', 'Waste recorded',
    'Waste against ' || h.name, coalesce((h.raw->>'TotalWasteWeight')::numeric,0),
    coalesce(h.raw->>'UnitOfWeightName','g'), coalesce(h.raw->>'DryingLocationName','(no room)'),
    'Recorded loss', h.name
  from metrc_harvests h
  where h.name ilike '%' || p_match || '%' and coalesce((h.raw->>'TotalWasteWeight')::numeric,0) > 0
  union all
  -- 5. Every package produced from it
  select 5, pk.packaged_on, 'Package', 'Package created: ' || coalesce(pk.item_name,'(unnamed)'),
    'Tag ending ' || right(pk.tag, 8) || ' · ' || coalesce(pk.raw->>'ProductCategoryName',''),
    coalesce(pk.quantity,0), coalesce(pk.uom,'ea'), coalesce(pk.location,'(no location)'),
    coalesce(pk.lab_testing_state,'Not submitted'), pk.tag
  from metrc_packages pk
  where coalesce(pk.raw->>'SourceHarvestNames','') ilike '%' || p_match || '%'
  union all
  -- 6. Laboratory outcome per package
  select 6, pk.packaged_on, 'Laboratory', 'Laboratory state: ' || coalesce(pk.lab_testing_state,'Not submitted'),
    coalesce(pk.item_name,'(unnamed)') || ' · tag ending ' || right(pk.tag, 8),
    coalesce(pk.quantity,0), coalesce(pk.uom,'ea'), coalesce(pk.location,'(no location)'),
    coalesce(pk.lab_testing_state,'Not submitted'), pk.tag
  from metrc_packages pk
  where coalesce(pk.raw->>'SourceHarvestNames','') ilike '%' || p_match || '%'
    and coalesce(pk.lab_testing_state,'') not in ('','NotSubmitted')
  union all
  -- 7. Every manifest that moved a package from it
  select 7, t.created_on, 'Transfer', 'Manifest ' || t.manifest_number || ' (' || t.direction || ')',
    'To ' || coalesce(t.recipient,'(recipient not recorded)'),
    null::numeric, null::text, coalesce(t.shipper,''), t.direction, t.manifest_number
  from metrc_transfers t
  where exists (
    select 1 from metrc_packages pk
    where coalesce(pk.raw->>'SourceHarvestNames','') ilike '%' || p_match || '%'
      and t.raw::text like '%' || pk.tag || '%'
  )
  order by 2 nulls last, 1;
end $$ language plpgsql stable;

-- One-line lineage summary per harvest, for lists and cards
create or replace view v_harvest_lineage_summary as
select m.harvest, m.license, m.room, m.stage, m.strains, m.plants,
  m.wet_weight, m.waste_weight, m.packaged_weight, m.waste_pct, m.yield_pct,
  m.days_since_takedown,
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || m.harvest || '%') as packages_made,
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || m.harvest || '%'
     and p.lab_testing_state = 'TestPassed') as packages_passed,
  (select count(*) from metrc_packages p where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || m.harvest || '%'
     and p.source_state = 'intransit') as packages_shipped,
  (select round(sum(coalesce(p.quantity,0))::numeric,1) from metrc_packages p
     where coalesce(p.raw->>'SourceHarvestNames','') ilike '%' || m.harvest || '%' and p.source_state in ('active','onhold')) as quantity_on_hand
from v_harvest_stage_map m;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
  'Harvest Lineage', 32, 'dna', 'harvest_lineage', 'v_harvest_lineage_summary',
  'One line per harvest showing its whole life: room, stage, plants, wet and waste and packaged weight, waste and yield percentages, packages made, packages that passed testing, packages shipped, and quantity still on hand.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'harvest_lineage');
select seq, occurred_on, phase, event, quantity, uom, status from tg_harvest_timeline('Gush Mintz') limit 12;;
