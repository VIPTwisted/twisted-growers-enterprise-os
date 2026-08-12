drop view if exists v_failed_provenance cascade;
create view v_failed_provenance as
with p as (
  select
    pk.tag, pk.item_name, pk.quantity, pk.uom, pk.license, pk.location, pk.packaged_on,
    pk.raw#>>'{Item,StrainName}' as strain,
    pk.raw#>>'{Item,ProductCategoryName}' as category,
    nullif(pk.raw->>'ItemFromFacilityName','') as made_by,
    pk.raw->>'ItemFromFacilityLicenseNumber' as made_by_license,
    nullif(pk.raw->>'ReceivedFromFacilityName','') as shipped_by,
    pk.raw->>'ReceivedFromFacilityLicenseNumber' as shipper_license,
    nullif(pk.raw->>'SourceHarvestNames','') as source_harvest,
    nullif(pk.raw->>'ReceivedFromManifestNumber','') as inbound_manifest,
    nullif(pk.raw->>'SourceProductionBatchNumbers','') as production_batch,
    nullif(pk.raw->>'SourcePackageLabels','') as made_from_packages,
    (pk.raw->>'ReceivedDateTime')::date as received_on,
    (pk.raw->>'LabTestingStateDate')::date as submitted_on,
    (pk.raw->>'LabTestingRecordedDate')::date as result_on,
    (pk.raw->>'LabTestResultExpirationDateTime')::date as coa_expires,
    pk.raw->>'ProductRequiresRemediation' as requires_remediation
  from metrc_packages pk
  where pk.raw->>'LabTestingState' = 'TestFailed'
)
select
  p.tag as package_tag, p.item_name, p.strain, p.category,
  round(p.quantity) as quantity, p.uom, round(p.quantity/453.592,2) as pounds,
  coalesce(p.made_by,'not recorded') as made_by, p.made_by_license,
  case when coalesce(p.made_by_license,'') in ('MC281714','MP281909') then 'US - Twisted Growers' else 'THIRD PARTY' end as ours_or_theirs,
  coalesce(p.shipped_by,'not applicable') as shipped_to_us_by, p.shipper_license, p.inbound_manifest,
  p.source_harvest, h.harvest_start as harvest_cut_on,
  (h.raw->>'FinishedDate')::date as harvest_closed_on,
  coalesce(nullif(h.raw->>'DryingLocationName',''),'not recorded') as harvest_room,
  p.packaged_on as package_created_on, p.received_on as received_by_us_on,
  p.production_batch, p.made_from_packages,
  p.submitted_on as submitted_for_testing_on, p.result_on as result_recorded_on,
  (p.result_on - p.submitted_on) as lab_turnaround_days,
  p.coa_expires as coa_expires_on, p.requires_remediation,
  p.license as held_under, p.location,
  (current_date - p.packaged_on) as days_since_created,
  case when h.harvest_start is not null then (p.packaged_on - h.harvest_start) end as days_cut_to_package,
  case when coalesce(p.made_by_license,'') in ('MC281714','MP281909')
    then 'We grew it'
      || coalesce(' from harvest ' || p.source_harvest, '')
      || coalesce(' cut ' || h.harvest_start::text, '')
      || coalesce(' in ' || nullif(h.raw->>'DryingLocationName',''), '')
      || ', packaged ' || p.packaged_on::text
      || coalesce(', submitted for testing ' || p.submitted_on::text, '')
      || coalesce(', failed ' || p.result_on::text, '')
    else 'Made by ' || coalesce(p.made_by, 'licence ' || coalesce(p.made_by_license,'unknown'))
      || coalesce(', shipped to us by ' || p.shipped_by, '')
      || coalesce(' on manifest ' || p.inbound_manifest, '')
      || coalesce(', received ' || p.received_on::text, '')
      || ', packaged ' || p.packaged_on::text
      || coalesce(', failed ' || p.result_on::text, '')
  end as the_chain
from p
left join metrc_harvests h on h.name = split_part(coalesce(p.source_harvest,''), ',', 1)
order by p.quantity desc nulls last;

drop view if exists v_failed_by_maker cascade;
create view v_failed_by_maker as
select made_by, made_by_license, ours_or_theirs,
  count(*) as failed_packages, round(sum(pounds),1) as failed_lb,
  min(package_created_on) as earliest_created, max(package_created_on) as latest_created,
  min(harvest_cut_on) as earliest_harvest, max(harvest_cut_on) as latest_harvest,
  string_agg(distinct strain, ', ') as strains,
  string_agg(distinct category, ', ') as categories,
  round(sum(pounds) * (select value from conversion_factors where key='target_cost_per_lb')) as value_at_cost
from v_failed_provenance group by 1,2,3 order by failed_lb desc;

insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Quality', (select min(category_order) from nav_registry where category='Quality'), 'Testing', v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Failed Product — Full Provenance', 4, 'search', 'failed_provenance', 'v_failed_provenance',
  'Every failed package traced end to end: who made or grew it and under which licence, ours or third party, the source harvest and the date it was cut, the room it dried in, when the package was created, who shipped it and on what manifest, when it was submitted for testing, when the result came back, how long the laboratory took, and when the certificate expires.'),
 ('Failed Product by Maker', 5, 'users', 'failed_by_maker', 'v_failed_by_maker',
  'Failed product grouped by who made it: packages, pounds, value at cost, strains and categories, and the earliest and latest harvest and creation dates.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('failed_provenance'),('failed_by_maker')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

select made_by, ours_or_theirs, failed_packages, failed_lb, earliest_created, latest_created from v_failed_by_maker;;
