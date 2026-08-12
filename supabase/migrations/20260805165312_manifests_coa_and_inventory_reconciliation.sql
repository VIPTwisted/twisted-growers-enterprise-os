drop view if exists v_metrc_transfer_ledger;
create view v_metrc_transfer_ledger as
select
  t.manifest_number, t.direction, t.created_on,
  (t.raw->>'ReceivedDateTime')::date as received_on,
  t.shipper, t.recipient,
  t.raw->>'RecipientFacilityLicenseNumber' as recipient_license,
  t.raw->>'ShipperFacilityLicenseNumber' as shipper_license,
  coalesce((t.raw->>'PackageCount')::numeric, 0) as packages,
  coalesce((t.raw->>'ReceivedPackageCount')::numeric, 0) as packages_received,
  t.raw->>'TransporterFacilityName' as transporter,
  t.raw->>'DriverName' as driver,
  t.raw->>'VehicleMake' as vehicle_make,
  t.raw->>'VehicleLicensePlateNumber' as vehicle_plate,
  (t.raw->>'EstimatedDepartureDateTime')::timestamptz as departed,
  (t.raw->>'EstimatedArrivalDateTime')::timestamptz as arrival_estimate,
  t.raw->>'ShipmentTypeName' as shipment_type,
  case when t.raw->>'Id' is not null
    then 'https://ma.metrc.com/reports/transfers/' || (t.raw->>'Id') || '/manifest' end as manifest_link,
  t.raw->>'Id' as metrc_transfer_id, t.license
from metrc_transfers t
order by t.created_on desc nulls last;
update nav_registry set description = 'Every manifest as its own record: number, direction, dates, shipper and recipient with licenses, packages sent and received, transporter, driver, vehicle and plate, and a direct link to open the manifest in Metrc.'
where view_key = 'metrc_rpt_transfer_ledger';

alter table metrc_lab_results add column if not exists package_id text;
alter table metrc_lab_results add column if not exists test_name text;
alter table metrc_lab_results add column if not exists units text;
alter table metrc_lab_results add column if not exists notes text;
alter table metrc_lab_results add column if not exists lab_facility text;
alter table metrc_lab_results add column if not exists document_file_id text;
alter table metrc_lab_results add column if not exists coa_link text;
create index if not exists mlr_pkg on metrc_lab_results (package_tag);

create or replace view v_coa_register as
select p.license, p.tag as package_tag, p.item_name, p.quantity, p.uom, p.location,
  p.lab_testing_state, p.packaged_on,
  nullif(p.raw->>'SourceHarvestNames','') as source_harvest,
  (select count(*) from metrc_lab_results r where r.package_tag = p.tag) as tests_recorded,
  (select count(*) from metrc_lab_results r where r.package_tag = p.tag and r.passed is false) as tests_failed,
  (select round(max(r.result)::numeric,2) from metrc_lab_results r
     where r.package_tag = p.tag and coalesce(r.test_name, r.test_type) ilike '%THC%') as thc_result,
  (select round(max(r.result)::numeric,2) from metrc_lab_results r
     where r.package_tag = p.tag and coalesce(r.test_name, r.test_type) ilike '%CBD%') as cbd_result,
  (select max(r.result_date) from metrc_lab_results r where r.package_tag = p.tag) as tested_on,
  (select string_agg(distinct r.lab_facility, ', ') from metrc_lab_results r where r.package_tag = p.tag) as laboratory,
  (select max(r.coa_link) from metrc_lab_results r where r.package_tag = p.tag) as coa_link,
  case when p.lab_testing_state = 'TestPassed' then 'Passed - sellable'
       when p.lab_testing_state = 'TestFailed' then 'FAILED - do not sell'
       when p.lab_testing_state in ('SubmittedForTesting','AwaitingConfirmation','TestingInProgress') then 'Awaiting result'
       when (select count(*) from metrc_lab_results r where r.package_tag = p.tag) = 0 then 'No Certificate of Analysis on file'
       else coalesce(p.lab_testing_state,'Not submitted') end as coa_status,
  p.source_state
from metrc_packages p
where p.source_state in ('active','onhold','intransit')
order by p.packaged_on desc nulls last;

-- IN STOCK versus SOLD versus DESTROYED versus UNACCOUNTED, per item.
create or replace view v_inventory_reconciliation as
with base as (
  select p.license, coalesce(p.item_name,'(unnamed item)') as item,
    p.source_state, p.lab_testing_state, coalesce(p.quantity,0) as qty,
    coalesce((p.raw->>'InitialQuantity')::numeric, coalesce(p.quantity,0)) as initial_qty,
    (p.raw->>'IsOnHold')::boolean as on_hold,
    p.raw->>'ArchivedDate' as archived
  from metrc_packages p
)
select license, item,
  round(sum(initial_qty)::numeric,1) as packaged_originally,
  round(sum(qty) filter (where source_state in ('active') and not coalesce(on_hold,false))::numeric,1) as in_stock_sellable,
  round(sum(qty) filter (where coalesce(on_hold,false) or source_state = 'onhold')::numeric,1) as on_hold,
  round(sum(qty) filter (where source_state = 'intransit')::numeric,1) as in_transit,
  round(sum(initial_qty) filter (where source_state = 'inactive')::numeric,1) as closed_or_sold,
  round(sum(qty) filter (where lab_testing_state = 'TestFailed')::numeric,1) as failed_testing_held,
  round(sum(initial_qty - qty) filter (where source_state in ('active','onhold'))::numeric,1) as reduced_without_reason,
  case
    when sum(initial_qty - qty) filter (where source_state in ('active','onhold')) > 0
      then 'UNACCOUNTED - ' || round(sum(initial_qty - qty) filter (where source_state in ('active','onhold'))::numeric,1)
           || ' reduced with no recorded reason'
    when sum(qty) filter (where lab_testing_state = 'TestFailed') > 0
      then 'FAILED TESTING still on hand - decide destruction or remediation'
    when sum(qty) filter (where coalesce(on_hold,false)) > 0 then 'Quantity on hold in Metrc'
    else 'Reconciled' end as reconciliation_status
from base
group by license, item
order by
  case when sum(initial_qty - qty) filter (where source_state in ('active','onhold')) > 0 then 0 else 1 end,
  sum(qty) filter (where source_state = 'active') desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select category_order from nav_registry n2 where n2.category = v.cat limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Quality','Certificate of Analysis Register', 5, 'flask', 'coa_register', 'v_coa_register', 'Every package with its Certificate of Analysis status: tests recorded, tests failed, potency headline, testing date, laboratory, a link to the Certificate of Analysis document, and whether it is sellable.'),
  ('Quality','Laboratory Results (all tests)', 6, 'flask', 'lab_results', 'metrc_lab_results', 'Every individual laboratory test result from Metrc: test name, value, units, pass or fail, testing date, laboratory, and the Certificate of Analysis document link.'),
  ('Inventory','In Stock vs Sold vs Missing', 6, 'scale', 'inventory_reconciliation', 'v_inventory_reconciliation', 'Per item: how much was packaged originally, how much is in stock and sellable, on hold, in transit, closed or sold, failed testing, and anything reduced with no recorded reason - the unaccounted column.')
) v(cat, l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select item, packaged_originally, in_stock_sellable, in_transit, closed_or_sold, failed_testing_held, reduced_without_reason, reconciliation_status
from v_inventory_reconciliation where reconciliation_status <> 'Reconciled' limit 8;;
