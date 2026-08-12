-- THE DOSSIER, FULL FIELD SET. Owner: "those are just a few fields."
-- 56 -> 100. Everything Metrc holds on a package, everything the certificate holds,
-- everything the manifest holds, plus the harvest it came from and the money.
-- Columns are APPENDED - create or replace cannot reorder or rename.

create or replace view public.v_package_dossier as
with p as (
  select distinct on (tag) tag, item_name, license, uom, quantity, source_state,
         lab_testing_state, packaged_on, raw
  from metrc_packages order by tag, license
),
cert_doc as (
  select l.package_tag, min(d.metrc_id::text) coa_number, min(d.storage_path) coa_file,
         min(d.byte_size) coa_bytes, min(d.fetched_at)::date coa_fetched
  from v_document_package_link l join metrc_documents d on d.id=l.document_id
  where l.doc_type='coa' group by l.package_tag
),
man_doc as (
  select l.package_tag,
         string_agg(distinct l.manifest_number, ', ' order by l.manifest_number) manifest_numbers,
         min(d.storage_path) manifest_file, count(distinct l.manifest_number) manifest_count
  from v_document_package_link l join metrc_documents d on d.id=l.document_id
  where l.doc_type='manifest' group by l.package_tag
),
labs as (
  select package_tag, count(*) tests_run, count(*) filter (where passed is false) tests_failed,
         string_agg(distinct test_name,'; ') filter (where passed is false) failed_analytes,
         max(lab_facility) laboratory, max(result_date) tested_on,
         max((raw->>'ExpirationDateTime')::date) coa_valid_until,
         min(result_date) first_tested_on, max(raw->>'LabFacilityLicenseNumber') lab_licence
  from metrc_lab_results group by package_tag
),
harv as (
  select h.name, min(h.raw->>'HarvestType') harvest_type,
         min((h.raw->>'HarvestStartDate')::date) cut_on,
         min(h.raw->>'DryingRoomName') drying_room,
         sum((h.raw->>'TotalWetWeight')::numeric) wet_g,
         sum((h.raw->>'TotalWasteWeight')::numeric) waste_g,
         sum((h.raw->>'TotalPackagedWeight')::numeric) packaged_g,
         sum((h.raw->>'PlantCount')::numeric) plants
  from metrc_harvests h group by h.name
),
ship as (
  select t.package_tag,
         string_agg(distinct c.delivered_to, ', ') shipped_to,
         string_agg(distinct c.destination_kind, ', ') destination_kind,
         string_agg(distinct c.carried_by, ', ') transporter,
         max(c.date_created) last_shipped_on,
         max(nullif(t.source_row->>'Shipper Wholesale Price','')::numeric) declared_price
  from metrc_rpt_package_transfers t
  join v_manifest_custody c on c.manifest_number = t.manifest_number
  group by t.package_tag
)
select
  p.tag as package_tag, p.item_name, p.raw#>>'{Item,StrainName}' as strain,
  p.raw#>>'{Item,ProductCategoryName}' as category, p.raw#>>'{Item,ProductCategoryType}' as category_type,
  case when p.license='MC281714' then 'Cultivation' else 'Manufacturing' end as department,
  p.license as licence, f_quantity_text(p.quantity,p.uom) as quantity, p.source_state as status,
  p.raw->>'LocationName' as room,
  e.client_name as cultivator_on_certificate, e.client_license as cultivator_licence,
  e.client_address as cultivator_address, p.raw->>'ItemFromFacilityName' as item_defined_by,
  oc.custody_says as custody_origin_licences, oc.custody_verdict as ownership_verdict,
  cd.coa_number, e.lab_report_id as lab_report_number, cd.coa_file as coa_storage_path,
  cr.certificate_link as certificate_basis, cr.certificate_on_package as certificate_sampled_package,
  l.laboratory, l.tested_on, l.coa_valid_until, (l.coa_valid_until < current_date) as certificate_expired,
  md.manifest_numbers, md.manifest_file as manifest_storage_path,
  nullif(p.raw->>'ReceivedFromManifestNumber','') as arrived_on_manifest,
  nullif(p.raw->>'ReceivedFromFacilityName','') as received_from,
  e.metrc_batch_id as batch_on_certificate, nullif(p.raw->>'ProductionBatchNumber','') as production_batch,
  nullif(p.raw->>'SourceHarvestNames','') as source_harvest, h.cut_on as harvest_date,
  h.harvest_type, h.drying_room, p.packaged_on, current_date - p.packaged_on as days_held,
  (p.raw->>'SourcePackageCount')::int as made_from_n_packages,
  left(nullif(p.raw->>'SourcePackageLabels',''),160) as made_from_packages,
  p.lab_testing_state as lab_state, l.tests_run, l.tests_failed, l.failed_analytes,
  e.total_thc, e.total_cbd, e.total_terpenes, e.total_cannabinoids,
  e.microbiology, e.mycotoxins, e.heavy_metals, e.pesticides, e.solvents, e.pathogens, e.water_activity,
  case when cd.coa_number is not null and md.manifest_numbers is not null then 'COMPLETE - certificate and manifest both held'
       when cd.coa_number is not null then 'certificate only - no manifest'
       when md.manifest_numbers is not null then 'manifest only - no certificate'
       else 'NEITHER - no legal document held for this package' end as proof_status,
  'Open either document with supabase.storage.from(''metrc-documents'').createSignedUrl(path, ttl) at click time. The file is permanent; never store the URL.' as how_to_open,
  -- ===== APPENDED: the rest of the field set =====
  -- WEIGHTS AND COUNTS
  case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity,p.uom),3) end as pounds,
  case when not f_is_weight(p.uom) then p.quantity end as units,
  p.uom as unit_of_measure,
  p.quantity as quantity_raw,
  (p.raw->>'CreatedQuantity')::numeric as created_quantity,
  (p.raw->>'OriginalPackageQuantity')::numeric as original_quantity,
  (p.raw->>'ReceivedQuantity')::numeric as received_quantity,
  round(coalesce((p.raw->>'CreatedQuantity')::numeric,0) - coalesce(p.quantity,0),3) as consumed_since_creation,
  case when f_is_weight(p.uom) and p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%' then 'wet'
       when f_is_weight(p.uom) then 'dry' end as weight_basis,
  -- ITEM DETAIL
  (p.raw#>>'{Item,Id}') as item_id,
  p.raw#>>'{Item,UnitWeight}' as unit_weight,
  p.raw#>>'{Item,UnitWeightUnitOfMeasureName}' as unit_weight_uom,
  p.raw#>>'{Item,UnitThcPercent}' as unit_thc_percent,
  p.raw#>>'{Item,ServingSize}' as serving_size,
  p.raw#>>'{Item,ItemBrandName}' as brand,
  p.raw#>>'{Item,AdministrationMethod}' as administration_method,
  p.raw#>>'{Item,QuantityType}' as quantity_type,
  -- ALL THE DATES
  (p.raw->>'ReceivedDateTime')::date as received_on,
  (p.raw->>'LabTestingStateDate')::date as lab_state_dated,
  (p.raw->>'LabTestingRecordedDate')::date as lab_result_recorded_on,
  (p.raw->>'ExpirationDate')::date as expiration_date,
  (p.raw->>'SellByDate')::date as sell_by_date,
  (p.raw->>'UseByDate')::date as use_by_date,
  (p.raw->>'FinishedDate')::date as finished_date,
  (p.raw->>'ArchivedDate')::date as archived_date,
  (p.raw->>'LastModified')::date as last_modified,
  (p.raw->>'RemediationDate')::date as remediation_date,
  (p.raw->>'DecontaminationDate')::date as decontamination_date,
  -- FLAGS
  (p.raw->>'IsOnHold')::boolean as on_hold,
  (p.raw->>'IsFinished')::boolean as finished,
  (p.raw->>'IsOnRecall')::boolean as on_recall,
  (p.raw->>'IsTradeSample')::boolean as trade_sample,
  (p.raw->>'IsDonation')::boolean as donation,
  (p.raw->>'IsTestingSample')::boolean as testing_sample,
  (p.raw->>'IsProductionBatch')::boolean as production_batch_flag,
  (p.raw->>'ContainsRemediatedProduct')::boolean as contains_remediated,
  (p.raw->>'ProductRequiresRemediation')::boolean as requires_remediation,
  (p.raw->>'IsOnInvestigation')::boolean as on_investigation,
  nullif(p.raw->>'SublocationName','') as sublocation,
  p.raw->>'LocationTypeName' as room_type,
  ((p.raw->>'SourcePackageCount')::int = 0) as is_primary_production,
  -- HARVEST DETAIL
  round(h.wet_g/453.59237,1) as harvest_wet_lb,
  round(h.waste_g/453.59237,1) as harvest_waste_lb,
  round(h.packaged_g/453.59237,1) as harvest_packaged_lb,
  h.plants as harvest_plants,
  case when h.wet_g > 0 then round((1 - h.packaged_g/h.wet_g)*100,1) end as harvest_moisture_loss_pct,
  p.packaged_on - h.cut_on as days_cut_to_package,
  -- CUSTODY OUT
  s.shipped_to, s.destination_kind, s.transporter, s.last_shipped_on,
  md.manifest_count as manifests_held,
  -- MONEY
  s.declared_price as declared_transfer_price,
  case when f_is_weight(p.uom) and f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
       then round(f_to_pounds(p.quantity,p.uom) *
            (select cm.cost_per_pound from cost_model cm where cm.scope='cultivation'
              order by cm.effective_from desc limit 1),0) end as value_at_our_cost,
  case when not f_is_weight(p.uom) then 'countable - no cost per pound'
       when not f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
       then 'bought in - material_purchases is EMPTY, what was paid exists nowhere'
       else 'our cultivation cost per pound' end as cost_basis,
  -- SUPPLIER
  sup.supplier_name, sup.bought_as, sup.typical_discount_pct,
  -- LAB AND DOCUMENT DETAIL
  l.lab_licence, l.first_tested_on, cd.coa_bytes, cd.coa_fetched, e.report_date as coa_report_date,
  e.metrc_sample_id as coa_sample_id, e.metrc_source_id as coa_source_package
from p
left join cert_doc cd on cd.package_tag=p.tag
left join man_doc  md on md.package_tag=p.tag
left join labs     l  on l.package_tag=p.tag
left join v_certificate_resolved cr on cr.package_tag=p.tag
left join coa_extract e on e.document_id=cd.coa_number
left join v_ownership_by_custody oc on oc.package_tag=p.tag
left join harv h on h.name = split_part(nullif(p.raw->>'SourceHarvestNames',''), ',', 1)
left join ship s on s.package_tag=p.tag
left join suppliers sup on sup.origin_license = p.raw->>'ItemFromFacilityLicenseNumber';;
