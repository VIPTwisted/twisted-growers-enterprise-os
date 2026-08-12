-- Every manifest sent to a customer, with the manifest document and the
-- Certificate of Analysis for each package that travelled on it.
create or replace view v_customer_manifests as
select
  t.created_on as shipped_on,
  t.manifest_number,
  t.recipient as customer,
  t.raw->>'RecipientFacilityLicenseNumber' as customer_license,
  coalesce((t.raw->>'PackageCount')::numeric,0) as packages,
  coalesce((t.raw->>'ReceivedPackageCount')::numeric,0) as packages_received,
  (t.raw->>'ReceivedDateTime')::date as received_on,
  case when (t.raw->>'ReceivedDateTime') is not null then 'Delivered and confirmed'
       when t.created_on < current_date - 3 then 'NOT CONFIRMED RECEIVED'
       else 'In transit' end as delivery_status,
  t.raw->>'TransporterFacilityName' as transporter,
  t.raw->>'DriverName' as driver,
  t.raw->>'VehicleLicensePlateNumber' as vehicle_plate,
  case when t.raw->>'Id' is not null
    then 'https://ma.metrc.com/reports/transfers/'||(t.raw->>'Id')||'/manifest' end as manifest_download,
  (select count(*) from metrc_packages p
     where t.raw::text like '%'||p.tag||'%') as packages_matched,
  (select string_agg(distinct p.item_name, ' · ') from metrc_packages p
     where t.raw::text like '%'||p.tag||'%') as products_on_manifest,
  (select string_agg(distinct r.coa_link, ' | ') from metrc_lab_results r
     where exists (select 1 from metrc_packages p2 where p2.tag = r.package_tag and t.raw::text like '%'||p2.tag||'%')
       and r.coa_link is not null) as certificate_of_analysis_links,
  (select count(distinct r.package_tag) from metrc_lab_results r
     where exists (select 1 from metrc_packages p3 where p3.tag = r.package_tag and t.raw::text like '%'||p3.tag||'%')) as packages_with_certificate,
  t.license
from metrc_transfers t
where t.direction = 'outgoing'
order by t.created_on desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Sales & Cash', (select category_order from nav_registry where category='Sales & Cash' limit 1),
  'Customer Manifests & Documents', 4, 'truck', 'customer_manifests', 'v_customer_manifests',
  'Every manifest sent to a customer with both documents attached: the manifest download link from Metrc and the Certificate of Analysis links for the packages that travelled on it, plus transporter, driver, vehicle, products shipped, and whether the customer confirmed receipt.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'customer_manifests');
select shipped_on, manifest_number, customer, packages, delivery_status, driver, manifest_download is not null as has_manifest_link
from v_customer_manifests limit 5;;
