-- Live harvest stage map: where every harvest sits, room, weights, losses, and what came out of it
create or replace view v_harvest_stage_map as
select
  h.license,
  h.name as harvest,
  h.raw->>'HarvestType' as harvest_type,
  (h.raw->>'DryingLocationName') as room,
  (h.raw->>'DryingSublocationName') as sub_room,
  h.raw->>'SourceStrainNames' as strains,
  (h.raw->>'PlantCount')::numeric as plants,
  h.harvest_start,
  (h.raw->>'FinishedDate')::date as finished_on,
  case
    when h.raw->>'ArchivedDate' is not null then 'Archived'
    when (h.raw->>'IsOnHold')::boolean then 'ON HOLD'
    when (h.raw->>'IsOnInvestigation')::boolean then 'UNDER INVESTIGATION'
    when h.raw->>'FinishedDate' is not null then 'Finished'
    when coalesce((h.raw->>'TotalPackagedWeight')::numeric,0) > 0 then 'Packaging'
    when h.harvest_start is not null and h.harvest_start > current_date - 10 then 'Drying (day '
      || (current_date - h.harvest_start)::text || ' of 10-14)'
    when h.harvest_start is not null then 'Curing / Trim'
    else 'Recorded'
  end as stage,
  case when h.harvest_start is not null then current_date - h.harvest_start end as days_since_takedown,
  (h.raw->>'TotalWetWeight')::numeric as wet_weight,
  (h.raw->>'CurrentWeight')::numeric as current_weight,
  (h.raw->>'TotalWasteWeight')::numeric as waste_weight,
  (h.raw->>'TotalPackagedWeight')::numeric as packaged_weight,
  (h.raw->>'TotalRestoredWeight')::numeric as restored_weight,
  case when coalesce((h.raw->>'TotalWetWeight')::numeric,0) > 0
    then round(100.0 * coalesce((h.raw->>'TotalWasteWeight')::numeric,0) / (h.raw->>'TotalWetWeight')::numeric, 1) end as waste_pct,
  case when coalesce((h.raw->>'TotalWetWeight')::numeric,0) > 0
    then round(100.0 * coalesce((h.raw->>'TotalPackagedWeight')::numeric,0) / (h.raw->>'TotalWetWeight')::numeric, 1) end as yield_pct,
  h.raw->>'UnitOfWeightName' as uom,
  (h.raw->>'PackageCount')::numeric as packages_created,
  h.raw->>'LabTestingState' as lab_state,
  (select count(*) from metrc_packages p
     where p.license = h.license and p.raw->>'SourceHarvestNames' like '%' || h.name || '%') as packages_traced,
  h.source_state
from metrc_harvests h;

-- Full chain: harvest -> package -> lab state -> transfer/sale
create or replace view v_seed_to_sale_chain as
select
  p.license,
  coalesce(nullif(p.raw->>'SourceHarvestNames',''), '(no source harvest)') as harvest,
  p.tag as package_tag,
  p.item_name,
  p.quantity, p.uom,
  p.location as current_location,
  p.packaged_on,
  p.lab_testing_state,
  p.raw->>'ProductCategoryName' as category,
  (p.raw->>'IsOnHold')::boolean as on_hold,
  (p.raw->>'IsFinished')::boolean as finished,
  case
    when (p.raw->>'IsOnHold')::boolean then 'ON HOLD'
    when p.source_state = 'intransit' then 'In transit to customer'
    when p.source_state = 'inactive' then 'Closed / consumed'
    when p.lab_testing_state = 'TestFailed' then 'FAILED TESTING'
    when p.lab_testing_state = 'TestPassed' then 'Passed testing - sellable'
    when p.lab_testing_state in ('SubmittedForTesting','AwaitingConfirmation') then 'Awaiting laboratory result'
    else 'In inventory'
  end as stage,
  t.manifest_number, t.direction, t.recipient, t.created_on as transfer_date,
  p.source_state
from metrc_packages p
left join lateral (
  select t.manifest_number, t.direction, t.recipient, t.created_on
  from metrc_transfers t
  where t.license = p.license and t.raw::text like '%' || p.tag || '%'
  order by t.created_on desc limit 1
) t on true;

-- Loss and destruction ledger with reason codes, wherever Metrc records them
create or replace view v_loss_ledger as
select h.license, 'Harvest waste' as loss_type, h.name as record, h.harvest_start as occurred_on,
  (h.raw->>'DryingLocationName') as room,
  (h.raw->>'TotalWasteWeight')::numeric as amount, h.raw->>'UnitOfWeightName' as uom,
  coalesce(h.raw->>'HarvestType','Harvest waste') as reason_code,
  h.raw->>'SourceStrainNames' as detail
from metrc_harvests h where coalesce((h.raw->>'TotalWasteWeight')::numeric,0) > 0
union all
select p.license, 'Package adjustment', p.tag, p.packaged_on, p.location,
  abs(coalesce((p.raw->>'InitialQuantity')::numeric,0) - coalesce(p.quantity,0)),
  p.uom, coalesce(p.raw->>'ArchivedDate','Quantity change'), p.item_name
from metrc_packages p
where coalesce((p.raw->>'InitialQuantity')::numeric,0) > coalesce(p.quantity,0)
union all
select p.license, 'Failed testing', p.tag, p.packaged_on, p.location,
  p.quantity, p.uom, 'Laboratory test failed', p.item_name
from metrc_packages p where p.lab_testing_state = 'TestFailed';

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Harvest Stage Map', 25, 'leafline', 'harvest_stage_map', 'v_harvest_stage_map', 'Every harvest and exactly where it stands right now: room, days since takedown, drying or curing or packaging, wet and waste and packaged weights, waste percentage, yield percentage, laboratory state, and packages produced.'),
  ('Seed to Sale Chain', 26, 'truck', 'seed_to_sale_chain', 'v_seed_to_sale_chain', 'Harvest through package through laboratory result through transfer to the customer - the whole chain on one line per package.'),
  ('Loss & Destruction Ledger', 27, 'shield', 'loss_ledger', 'v_loss_ledger', 'Every recorded loss with its reason: harvest waste, package adjustments, and failed laboratory tests, with room, date, and amount.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
