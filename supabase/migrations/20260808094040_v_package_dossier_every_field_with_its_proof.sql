-- THE DOSSIER. Owner, 8 Aug 2026: "Where is proof — these manifests and COA with the
-- actual company's name. Who was the cultivator, what is the COA and manifest number,
-- batch number, strain name, date of harvest, all the fields one might want, test
-- scores, department, category."
--
-- One row per package carrying the complete evidence chain: who grew it, who tested
-- it, who shipped it, who received it, what it scored, and the storage path of both
-- legal documents so the PDF can be opened, printed or emailed.
--
-- The cultivator comes from the CERTIFICATE - the laboratory's own statement, the
-- only source independent of Metrc. The custody comes from the MANIFEST. Both are
-- required by law and they answer different questions; neither substitutes for the
-- other.
--
-- Certificates resolve through the lineage AND the laboratory's own package pairing,
-- so an inherited certificate is shown as inherited and never passed off as direct.
-- UNDO: drop view v_package_dossier.

create or replace view public.v_package_dossier as
with p as (
  select distinct on (tag) tag, item_name, license, uom, quantity, source_state,
         lab_testing_state, packaged_on, raw
  from metrc_packages order by tag, license
),
cert_doc as (
  select l.package_tag, min(d.metrc_id::text) as coa_number, min(d.storage_path) as coa_file
  from v_document_package_link l join metrc_documents d on d.id = l.document_id
  where l.doc_type = 'coa' group by l.package_tag
),
man_doc as (
  select l.package_tag,
         string_agg(distinct l.manifest_number, ', ' order by l.manifest_number) as manifest_numbers,
         min(d.storage_path) as manifest_file
  from v_document_package_link l join metrc_documents d on d.id = l.document_id
  where l.doc_type = 'manifest' group by l.package_tag
),
labs as (
  select package_tag,
         count(*) tests_run,
         count(*) filter (where passed is false) tests_failed,
         string_agg(distinct test_name, '; ') filter (where passed is false) as failed_analytes,
         max(lab_facility) laboratory,
         max(result_date) tested_on,
         max((raw->>'ExpirationDateTime')::date) coa_valid_until
  from metrc_lab_results group by package_tag
),
harv as (
  select h.name, min(h.raw->>'HarvestType') harvest_type,
         min((h.raw->>'HarvestStartDate')::date) cut_on,
         min(h.raw->>'DryingRoomName') drying_room
  from metrc_harvests h group by h.name
)
select
  -- IDENTITY
  p.tag                                              as package_tag,
  p.item_name,
  p.raw#>>'{Item,StrainName}'                        as strain,
  p.raw#>>'{Item,ProductCategoryName}'               as category,
  p.raw#>>'{Item,ProductCategoryType}'               as category_type,
  case when p.license = 'MC281714' then 'Cultivation' else 'Manufacturing' end as department,
  p.license                                          as licence,
  f_quantity_text(p.quantity, p.uom)                 as quantity,
  p.source_state                                     as status,
  p.raw->>'LocationName'                             as room,
  -- WHO GREW OR MADE IT — from the CERTIFICATE, the independent source
  e.client_name                                      as cultivator_on_certificate,
  e.client_license                                   as cultivator_licence,
  e.client_address                                   as cultivator_address,
  p.raw->>'ItemFromFacilityName'                     as item_defined_by,
  oc.custody_says                                    as custody_origin_licences,
  oc.custody_verdict                                 as ownership_verdict,
  -- THE CERTIFICATE
  cd.coa_number,
  e.lab_report_id                                    as lab_report_number,
  cd.coa_file                                        as coa_storage_path,
  cr.certificate_link                                as certificate_basis,
  cr.certificate_on_package                          as certificate_sampled_package,
  l.laboratory,
  l.tested_on,
  l.coa_valid_until,
  (l.coa_valid_until < current_date)                 as certificate_expired,
  -- THE MANIFEST
  md.manifest_numbers,
  md.manifest_file                                   as manifest_storage_path,
  nullif(p.raw->>'ReceivedFromManifestNumber','')    as arrived_on_manifest,
  nullif(p.raw->>'ReceivedFromFacilityName','')      as received_from,
  -- BATCH AND SEED TO SALE
  e.metrc_batch_id                                   as batch_on_certificate,
  nullif(p.raw->>'ProductionBatchNumber','')         as production_batch,
  nullif(p.raw->>'SourceHarvestNames','')            as source_harvest,
  h.cut_on                                           as harvest_date,
  h.harvest_type,
  h.drying_room,
  p.packaged_on,
  current_date - p.packaged_on                       as days_held,
  (p.raw->>'SourcePackageCount')::int                as made_from_n_packages,
  left(nullif(p.raw->>'SourcePackageLabels',''),160) as made_from_packages,
  -- TEST SCORES
  p.lab_testing_state                                as lab_state,
  l.tests_run,
  l.tests_failed,
  l.failed_analytes,
  e.total_thc,
  e.total_cbd,
  e.total_terpenes,
  e.total_cannabinoids,
  e.microbiology,
  e.mycotoxins,
  e.heavy_metals,
  e.pesticides,
  e.solvents,
  e.pathogens,
  e.water_activity,
  -- PROOF STATUS
  case
    when cd.coa_number is not null and md.manifest_numbers is not null
      then 'COMPLETE - certificate and manifest both held'
    when cd.coa_number is not null   then 'certificate only - no manifest'
    when md.manifest_numbers is not null then 'manifest only - no certificate'
    else 'NEITHER - no legal document held for this package'
  end                                                as proof_status,
  'Open either document with supabase.storage.from(''metrc-documents'').createSignedUrl(path, ttl) at click time. The file is permanent; never store the URL.' as how_to_open
from p
left join cert_doc cd on cd.package_tag = p.tag
left join man_doc  md on md.package_tag = p.tag
left join labs     l  on l.package_tag  = p.tag
left join v_certificate_resolved cr on cr.package_tag = p.tag
left join coa_extract e on e.document_id = cd.coa_number
left join v_ownership_by_custody oc on oc.package_tag = p.tag
left join harv h on h.name = split_part(nullif(p.raw->>'SourceHarvestNames',''), ',', 1);

comment on view public.v_package_dossier is
  'THE evidence row. Per package: cultivator from the CERTIFICATE (the laboratory''s '
  'own statement, independent of Metrc), custody from the MANIFEST, COA number and '
  'file path, manifest numbers and file path, batch, strain, harvest date and room, '
  'full test scores, department and category. Both documents are required by law and '
  'answer DIFFERENT questions - the COA is testing, the manifest is shipping. '
  'certificate_basis says whether the COA is direct or inherited; never present an '
  'inherited certificate as the package''s own.';;
