-- ---------------------------------------------------------------------------
-- 0093 — Add the fields that were missing from the third-party record.
--
-- THE OWNER'S CORRECTION: "WE PROCESS FAILED AND REMEDIATED IT." A failed test does
-- NOT mean material was sold failed or destroyed. The PARENT tag keeps TestFailed
-- forever -- that is the record of the original test -- while the remediated material
-- moves into a CHILD tag which is retested and sold. Reading only the parent produces
-- a false alarm, which is exactly what I did.
--
-- Two things follow, both built here:
--   1. The remediation and lab-state fields are carried on every row.
--   2. The EXIT is traced through metrc_rpt_package_transfers.source_package, because
--      the child tag is frequently NOT in metrc_packages -- it exists only in the
--      transfer report. That is why the record looked as though it stopped dead.
--
-- All columns APPENDED (CREATE OR REPLACE cannot reorder).
-- ---------------------------------------------------------------------------
create or replace view v_third_party_forensic as
with pk as (
  select distinct on (upper(btrim(p.raw->>'Label'))) upper(btrim(p.raw->>'Label')) tag, p.raw, p.license
  from metrc_packages p
  where not f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),''))
    and nullif(p.raw->>'ItemFromFacilityLicenseNumber','') is not null
  order by 1, (p.raw->>'LastModified') desc nulls last),
outb as (
  select upper(btrim(package_tag)) tag, min(received_on) first_shipped, max(received_on) last_shipped,
         string_agg(distinct manifest_number,', ') manifests,
         string_agg(distinct coalesce(dest_facility,dest_licence),', ') to_whom,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction='OUTBOUND' and voided<>'True' group by 1),
-- THE EXIT TRACE: our tag named as the SOURCE of a package that was shipped
exit_trace as (
  select upper(btrim(t.source_package)) parent_tag,
         string_agg(distinct t.package_tag, ', ')      child_tags,
         string_agg(distinct t.manifest_number, ', ')  child_manifests,
         string_agg(distinct t.destination_facility, ', ') child_sold_to,
         min(t.received_on)                            child_shipped_on,
         round(sum(coalesce(case when (t.source_row->>'Weight Ship''d') ~ '^[0-9.]+$'
                   then (t.source_row->>'Weight Ship''d')::numeric end, t.shipped_lb))::numeric,3) child_lb,
         round(sum(nullif(t.source_row->>'Receiver Wholesale Price','')::numeric)::numeric,2) child_sold_usd,
         string_agg(distinct t.item, ' | ')            child_sold_as
  from metrc_rpt_package_transfers t
  where nullif(btrim(t.source_package),'') is not null
    and coalesce(t.source_row->>'Voided','False') <> 'True'
  group by 1),
kids as (
  select btrim(pt.tag) tag, count(*) children, min((c.raw->>'PackagedDate')::date) first_processed,
         string_agg(distinct coalesce(c.raw->'Item'->>'ProductCategoryName','?'),', ') made_into,
         string_agg(distinct upper(btrim(c.raw->>'Label')),', ') child_tags,
         round(sum(f_to_pounds(coalesce((c.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(c.raw->>'UnitOfMeasureName',''),'Grams'))
             / greatest(array_length(string_to_array(c.raw->>'SourcePackageLabels',', '),1),1))::numeric,3) made_lb
  from metrc_packages c
  join lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) pt(tag) on true
  where nullif(c.raw->>'SourcePackageLabels','') is not null group by 1),
adj as (
  select upper(btrim(package_tag)) tag, round(sum(f_to_pounds(quantity,uom))::numeric,3) lb,
         string_agg(distinct reason,', ') reasons, string_agg(distinct source_row->>'Note',' | ') notes,
         string_agg(distinct source_row->>'User',', ') by_whom, max(adjusted_on) on_date,
         jsonb_agg(source_row order by adjusted_on) verbatim
  from metrc_rpt_adjustments where quantity is not null and f_is_weight(uom) group by 1),
lab as (
  select upper(btrim(package_tag)) tag, count(*) tests, count(*) filter (where passed is false) failures,
         min(result_date) first_tested, string_agg(distinct lab_facility,', ') labs,
         max(result) filter (where test_name ilike 'Total THC (%%)%%')   thc,
         max(result) filter (where test_name ilike 'Moisture Content%%') moisture,
         string_agg(distinct test_name,' | ') filter (where passed is false) failed_tests,
         max(result_date) filter (where passed is false) last_fail_date
  from metrc_lab_results where package_tag is not null group by 1),
loc as (
  select upper(btrim(tag)) tag,
         string_agg(as_of_date::text || ' @ ' || coalesce(location,'?')
                    || coalesce(' / ' || sublocation,''), '  →  ' order by as_of_date) history
  from metrc_rpt_point_in_time where record_type='Package' group by 1)
select
  pk.tag,
  pk.raw->'Item'->>'Name' as item,
  coalesce(pk.raw->'Item'->>'ProductCategoryName','(unknown)') as category,
  coalesce(nullif(pk.raw->'Item'->>'StrainName',''), f_strain_from_item(pk.raw->'Item'->>'Name')) as strain,
  coalesce(nullif(pk.raw->>'ItemFromFacilityName',''),'(unknown)') as supplier,
  nullif(pk.raw->>'ItemFromFacilityLicenseNumber','') as supplier_licence,
  pk.license as our_licence,
  nullif(pk.raw->>'ReceivedFromManifestNumber','') as inbound_manifest,
  nullif(pk.raw->>'ReceivedFromFacilityName','') as delivered_by,
  left((pk.raw->>'ReceivedDateTime'),10)::date as date_received,
  (pk.raw->>'PackagedDate')::date as date_supplier_packaged,
  round(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
        coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as lb_received,
  case when nullif(pk.raw->>'ReceivedDateTime','') is not null and (pk.raw->>'PackagedDate')::date is not null
       then left((pk.raw->>'ReceivedDateTime'),10)::date - (pk.raw->>'PackagedDate')::date end as age_on_arrival_days,
  coalesce(nullif(pk.raw->>'LocationName',''),'(no room)') as current_room,
  nullif(pk.raw->>'SublocationName','') as current_sublocation,
  round(f_to_pounds(coalesce((pk.raw->>'Quantity')::numeric,0),
        coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as lb_on_hand,
  kids.first_processed as date_processed,
  kids.children, kids.made_into, kids.made_lb, kids.child_tags,
  outb.first_shipped as date_sold, outb.manifests as outbound_manifest,
  outb.to_whom as sold_to, outb.lb as lb_sold,
  adj.lb as lb_adjusted, adj.reasons as destroy_reason, adj.notes as destroy_note,
  adj.by_whom as destroyed_by, adj.on_date as date_destroyed,
  case when left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then coalesce(outb.first_shipped, kids.first_processed, adj.on_date, current_date)
            - left((pk.raw->>'ReceivedDateTime'),10)::date end as days_held_total,
  case when left((pk.raw->>'ReceivedDateTime'),10) <> '' and kids.first_processed is not null
       then kids.first_processed - left((pk.raw->>'ReceivedDateTime'),10)::date end as days_to_process,
  case when left((pk.raw->>'ReceivedDateTime'),10) <> '' and outb.first_shipped is not null
       then outb.first_shipped - left((pk.raw->>'ReceivedDateTime'),10)::date end as days_to_sell,
  case when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 and left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then current_date - left((pk.raw->>'ReceivedDateTime'),10)::date end as days_unsold_still_here,
  case when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 and left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then case when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date > 180 then 'OVER 180 DAYS — CASH TIED UP'
                 when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date >  90 then '90-180 days'
                 when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date >  30 then '30-90 days'
                 else 'under 30 days' end end as ageing_band,
  lab.first_tested as date_tested, lab.tests as lab_tests, lab.failures as lab_failures,
  lab.thc as total_thc_pct, lab.moisture as moisture_pct, lab.labs as lab_name, lab.failed_tests,
  case when lab.tag is null then 'NO LAB RESULT IMPORTED'
       when lab.failures > 0 then 'FAILED'
       when lab.tests < 20 then 'PASSED — partial panel (' || lab.tests || ' tests)'
       else 'PASSED — full panel (' || lab.tests || ' tests)' end as lab_result,
  case
    when adj.lb <= -1 and coalesce(lab.failures,0)=0 and coalesce(adj.notes,'')='' then 'DESTROYED — NO REASON GIVEN'
    when adj.lb <= -1 and coalesce(lab.failures,0)=0 then 'DESTROYED — no failing lab test'
    when adj.lb <= -1 then 'DESTROYED after a failed test'
    when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 then 'ON HAND'
    when outb.tag is not null and kids.tag is not null then 'PROCESSED THEN SOLD'
    when outb.tag is not null then 'SOLD AS-IS'
    when ex.parent_tag is not null then 'PROCESSED THEN SOLD — via child tag'
    when kids.tag is not null then 'PROCESSED INTO PRODUCT'
    else 'UNEXPLAINED — record stops with nothing recorded' end as status,
  'https://ma.metrc.com/industry/' || pk.license || '/packages' as metrc_link,
  (pk.raw->>'Id') as metrc_package_id,
  mdoc.storage_path as manifest_document,
  adj.verbatim as destroy_rows_verbatim,
  extract(year from left((pk.raw->>'ReceivedDateTime'),10)::date)::int as year_received,
  -- APPENDED ----------------------------------------------------------------
  pk.raw->>'LabTestingState'               as lab_state,
  pk.raw->>'InitialLabTestingState'        as initial_lab_state,
  nullif(pk.raw->>'LabTestingStateDate','')::date as lab_state_date,
  (pk.raw->>'ContainsRemediatedProduct')::boolean as contains_remediated,
  nullif(pk.raw->>'RemediationDate','')     as remediation_date,
  (pk.raw->>'ContainsDecontaminatedProduct')::boolean as contains_decontaminated,
  nullif(pk.raw->>'DecontaminationDate','') as decontamination_date,
  lab.last_fail_date                        as date_failed,
  ex.child_tags                             as exit_child_tags,
  ex.child_manifests                        as exit_manifest,
  ex.child_sold_to                          as exit_sold_to,
  ex.child_shipped_on                       as exit_shipped_on,
  ex.child_lb                               as exit_lb,
  ex.child_sold_usd                         as exit_sold_usd,
  ex.child_sold_as                          as exit_sold_as,
  loc.history                               as location_history
from pk
left join outb on outb.tag=pk.tag
left join kids on kids.tag=pk.tag
left join adj  on adj.tag =pk.tag
left join lab  on lab.tag =pk.tag
left join exit_trace ex on ex.parent_tag = pk.tag
left join loc on loc.tag = pk.tag
left join (select manifest_number, min(storage_path) storage_path
           from metrc_documents where doc_type='manifest' group by 1) mdoc
       on mdoc.manifest_number = nullif(pk.raw->>'ReceivedFromManifestNumber','');

comment on view v_third_party_forensic is
  'THIRD-PARTY MATERIAL, seed to sale, one row per tag. Carries remediation and '
  'lab-state fields because FAILED MATERIAL IS REMEDIATED AND PROCESSED ON -- the '
  'parent keeps TestFailed forever while the remediated material moves to a child that '
  'is retested and sold. The EXIT is traced through the transfer report''s '
  'source_package, because the child is frequently not in metrc_packages at all; '
  'without that trace the record appears to stop dead when it did not.';

grant select on v_third_party_forensic to authenticated;
;
