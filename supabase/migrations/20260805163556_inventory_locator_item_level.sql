-- ITEM-LEVEL seed-to-sale locator: every plant batch, harvest, and package - what it is,
-- where it physically sits, what stage it is in, and how long it has been there.
create or replace view v_inventory_locator as
-- 1. Living plants by room
select
  'Plants' as category,
  1 as stage_no,
  'Growing' as stage,
  pl.room as location,
  pl.license,
  pl.strain as item,
  pl.tag as identifier,
  count(*)::numeric as quantity,
  'plants' as uom,
  min(pl.planted_on) as since_date,
  max(current_date - pl.planted_on)::numeric as days_here,
  string_agg(distinct pl.phase, ' · ') as detail,
  null::text as lab_state,
  null::text as source_lineage
from metrc_plants pl
where pl.source_state in ('vegetative','flowering','onhold')
group by 1,2,3,4,5,6,7
union all
-- 2. Plant batches (clones / immature)
select 'Plant batches', 1, 'Propagation', 'Propagation area', pb.license,
  pb.strain, pb.name, coalesce(pb.count,0)::numeric, 'plants',
  pb.planted_on, (current_date - pb.planted_on)::numeric,
  coalesce(pb.batch_type,'batch'), null, null
from metrc_plant_batches pb
where pb.source_state = 'active'
union all
-- 3. Harvests in drying, curing, trimming, packaging
select 'Harvest lots', 2, m.stage, coalesce(m.room,'(no room recorded)'), m.license,
  coalesce(m.strains, m.harvest), m.harvest,
  round(coalesce(m.current_weight, m.wet_weight, 0)::numeric, 1), coalesce(m.uom,'g'),
  m.harvest_start, m.days_since_takedown::numeric,
  coalesce(m.sub_room, m.harvest_type, 'harvest'), m.lab_state,
  m.harvest
from v_harvest_stage_map m
where m.stage not in ('Finished','Archived')
union all
-- 4. Packaged inventory sitting in the facility
select 'Packages', 3,
  case when (p.raw->>'IsOnHold')::boolean then 'ON HOLD'
       when p.lab_testing_state = 'TestFailed' then 'FAILED TESTING'
       when p.lab_testing_state = 'TestPassed' then 'Sellable'
       when p.lab_testing_state in ('SubmittedForTesting','AwaitingConfirmation') then 'Awaiting laboratory'
       else 'In inventory' end,
  coalesce(p.location,'(no location)'), p.license,
  coalesce(p.item_name,'(unnamed item)'), p.tag,
  coalesce(p.quantity,0)::numeric, coalesce(p.uom,'ea'),
  p.packaged_on, (current_date - p.packaged_on)::numeric,
  coalesce(p.raw->>'ProductCategoryName','package'), p.lab_testing_state,
  nullif(p.raw->>'SourceHarvestNames','')
from metrc_packages p
where p.source_state in ('active','onhold')
union all
-- 5. Anything on a manifest heading out the door
select 'In transit', 4, 'Leaving the facility', coalesce(p.location,'(manifested)'), p.license,
  coalesce(p.item_name,'(unnamed item)'), p.tag,
  coalesce(p.quantity,0)::numeric, coalesce(p.uom,'ea'),
  p.packaged_on, (current_date - p.packaged_on)::numeric,
  'On a transfer manifest', p.lab_testing_state,
  nullif(p.raw->>'SourceHarvestNames','')
from metrc_packages p
where p.source_state = 'intransit';

-- Aging intelligence: what has sat too long, by stage
create or replace view v_inventory_aging as
select category, stage, location, license, item, identifier, quantity, uom, days_here,
  case
    when category = 'Harvest lots' and stage like 'Drying%' and days_here > 14 then 'critical'
    when category = 'Harvest lots' and days_here > 30 then 'elevated'
    when category = 'Packages' and stage = 'Awaiting laboratory' and days_here > 7 then 'elevated'
    when category = 'Packages' and stage = 'FAILED TESTING' then 'critical'
    when category = 'Packages' and days_here > 90 then 'elevated'
    when category = 'Packages' and days_here > 60 then 'watch'
    when stage = 'ON HOLD' then 'critical'
    else null end as severity,
  case
    when category = 'Harvest lots' and stage like 'Drying%' and days_here > 14 then 'Past the 14-day dry limit - move it or record the weights'
    when category = 'Harvest lots' and days_here > 30 then 'Harvest lot open more than 30 days - the room turn is at risk'
    when category = 'Packages' and stage = 'Awaiting laboratory' and days_here > 7 then 'Waiting on a laboratory result more than 7 days - chase the laboratory'
    when category = 'Packages' and stage = 'FAILED TESTING' then 'Failed testing - decide remediation or destruction'
    when category = 'Packages' and days_here > 90 then 'Packaged more than 90 days ago - cash is sitting on the shelf'
    when category = 'Packages' and days_here > 60 then 'Packaged more than 60 days ago - prioritize it for sale'
    when stage = 'ON HOLD' then 'On hold in Metrc - resolve the hold'
    else null end as action
from v_inventory_locator
where days_here is not null;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Inventory', (select category_order from nav_registry where category='Inventory' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Where Is Everything', 1, 'box', 'inventory_locator', 'v_inventory_locator', 'Seed to sale, item by item: every plant, harvest lot, package, and outbound manifest - what it is, exactly where it sits in the facility, what stage it is in, how much, and how long it has been there.'),
  ('Inventory Aging & Action', 2, 'clock', 'inventory_aging', 'v_inventory_aging', 'Everything that has sat too long, with the action to take: past the dry limit, waiting on a laboratory, failed testing, on hold, or cash sitting on the shelf more than 60 and 90 days.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select category, count(*) items, round(sum(quantity)::numeric,0) qty from v_inventory_locator group by 1 order by 1;;
