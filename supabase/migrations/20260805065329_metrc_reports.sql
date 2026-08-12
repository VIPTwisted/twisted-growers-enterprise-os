-- 0032: Metrc Reporting - seed-to-sale reports computed live from the mirror

create or replace view v_metrc_plant_census with (security_invoker = true) as
select license, coalesce(room, '—') as room, coalesce(phase, 'unknown') as phase,
  count(*) as plants, count(distinct strain) as strains,
  min(planted_on) as oldest_planting, max(planted_on) as newest_planting
from metrc_plants
group by license, room, phase
order by license, room, phase;

create or replace view v_metrc_strain_census with (security_invoker = true) as
select license, coalesce(strain, '—') as strain,
  count(*) as total_plants,
  count(*) filter (where phase = 'vegetative') as vegetative,
  count(*) filter (where phase = 'flowering') as flowering,
  count(*) filter (where phase = 'onhold') as on_hold,
  count(*) filter (where phase = 'inactive') as inactive,
  count(distinct room) as rooms
from metrc_plants
group by license, strain
order by total_plants desc;

create or replace view v_metrc_package_inventory with (security_invoker = true) as
select license, coalesce(item_name, '—') as item,
  coalesce(location, '—') as location,
  count(*) as packages,
  round(sum(quantity)::numeric, 2) as total_qty,
  min(uom) as uom,
  coalesce(lab_testing_state, '—') as lab_state,
  count(*) filter (where finished) as finished_pkgs,
  min(packaged_on) as oldest, max(packaged_on) as newest
from metrc_packages
group by license, item_name, location, lab_testing_state
order by license, total_qty desc nulls last;

create or replace view v_metrc_lab_status with (security_invoker = true) as
select license, coalesce(lab_testing_state, '—') as lab_testing_state,
  count(*) as packages, round(sum(quantity)::numeric, 2) as total_qty,
  count(distinct item_name) as items
from metrc_packages
group by license, lab_testing_state
order by license, packages desc;

create or replace view v_metrc_transfer_ledger with (security_invoker = true) as
select license, direction,
  to_char(date_trunc('month', created_on), 'YYYY-MM') as month,
  count(*) as manifests,
  count(distinct coalesce(shipper, '')) as shippers,
  count(distinct coalesce(recipient::text, '')) as recipients
from metrc_transfers
group by license, direction, 3
order by month desc, license, direction;

create or replace view v_metrc_harvest_yields with (security_invoker = true) as
select license,
  to_char(date_trunc('month', harvest_start), 'YYYY-MM') as month,
  count(*) as harvests,
  round((sum(wet_weight) / 453.592)::numeric, 1) as wet_lbs,
  round((sum(waste_weight) / 453.592)::numeric, 1) as waste_lbs,
  case when sum(wet_weight) > 0 then round((100.0 * sum(waste_weight) / sum(wet_weight))::numeric, 1) end as waste_pct,
  sum(package_count) as packages_produced
from metrc_harvests
group by license, 2
order by month desc;

create or replace view v_metrc_seed_to_sale with (security_invoker = true) as
with b as (select strain, sum(count) as batch_plants from metrc_plant_batches group by strain),
p as (select strain,
        count(*) filter (where phase in ('vegetative','flowering')) as live_plants,
        count(*) filter (where phase = 'inactive') as retired_plants
      from metrc_plants group by strain)
select coalesce(b.strain, p.strain, '—') as strain,
  coalesce(b.batch_plants, 0) as batch_plants,
  coalesce(p.live_plants, 0) as live_plants,
  coalesce(p.retired_plants, 0) as retired_plants
from b
full outer join p on p.strain = b.strain
order by coalesce(p.live_plants, 0) desc;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('Metrc', 10, 3, 'metrc_rpt_plants', 'Report: Plant Census', 'v_metrc_plant_census', null, 'leafline',
   'Live plant counts by room and growth phase per license - the daily census, straight from state data.', true, '#57a9ff'),
  ('Metrc', 10, 4, 'metrc_rpt_strains', 'Report: Strain Census', 'v_metrc_strain_census', null, 'dna',
   'Every strain with veg/flower/hold/inactive splits and room spread.', true, '#57a9ff'),
  ('Metrc', 10, 5, 'metrc_rpt_packages', 'Report: Package Inventory', 'v_metrc_package_inventory', null, 'box',
   'Active package inventory by item, location, and lab state with quantities - what the state believes you hold.', true, '#57a9ff'),
  ('Metrc', 10, 6, 'metrc_rpt_lab', 'Report: Lab Testing Status', 'v_metrc_lab_status', null, 'flask',
   'Packages grouped by lab testing state per license - what is cleared, pending, or failed.', true, '#57a9ff'),
  ('Metrc', 10, 7, 'metrc_rpt_transfers', 'Report: Transfer Ledger', 'v_metrc_transfer_ledger', null, 'truck',
   'Manifests by month and direction with shipper/recipient counts - the wholesale movement record.', true, '#57a9ff'),
  ('Metrc', 10, 8, 'metrc_rpt_yields', 'Report: Harvest Yields', 'v_metrc_harvest_yields', null, 'scale',
   'Monthly wet weight, waste, waste percent, and packages produced from state harvest records.', true, '#57a9ff'),
  ('Metrc', 10, 9, 'metrc_rpt_s2s', 'Report: Seed to Sale (Strain Chain)', 'v_metrc_seed_to_sale', null, 'gauge',
   'Per strain: batch plants planted, live plants now, retired - grows into full tag-to-tag lineage (harvest, package, transfer) as worker v13 links each stage.', true, '#57a9ff')
on conflict do nothing;

update actions_register set note = note || ' PHASE 1 SHIPPED 2026-08-05: seven live report views (plant census, strain census, package inventory, lab status, transfer ledger, harvest yields, seed-to-sale strain chain) in the Metrc menu with filters/CSV/print. v13 deepens with per-tag lineage, COAs, manifest lines, destroys.'
where title like 'Metrc worker v13%';

select 'plant_census' as report, count(*) from v_metrc_plant_census
union all select 'strain_census', count(*) from v_metrc_strain_census
union all select 'package_inventory', count(*) from v_metrc_package_inventory
union all select 'lab_status', count(*) from v_metrc_lab_status
union all select 'transfer_ledger', count(*) from v_metrc_transfer_ledger
union all select 'harvest_yields', count(*) from v_metrc_harvest_yields
union all select 'seed_to_sale', count(*) from v_metrc_seed_to_sale;;
