-- ---------------------------------------------------------------------------
-- 0090 — TRUE RECEIPT DATE, AGEING, and LOCATION on every tag.
--
-- THE CORRECTION THAT FORCED THIS: I reported that no manifest existed for the 2023
-- and 2024 third-party material. WRONG. Every tag carries its inbound manifest on the
-- PACKAGE RECORD itself -- raw->>'ReceivedFromManifestNumber' -- a field I never read
-- because I was only joining the transfer report. Coverage: 17/17 in 2023, 45/45 in
-- 2024, 329/363 in 2026.
--
-- AND THE DATE WAS WRONG TOO. PackagedDate is when the SUPPLIER packaged it;
-- ReceivedDateTime is when WE took delivery. Paper City's fresh frozen was packaged
-- 2023-10-09 but RECEIVED 2024-04-25 and written off 2024-06-06 -- held 42 days by us,
-- not the 241 I reported. The material was already six months old on arrival.
--
-- Owner requirement, stated repeatedly: we must know HOW LONG third-party material
-- sits unsold, to avoid sitting on cash. Every tag now carries days_since_received,
-- days_to_process, days_to_sell and days_unsold, plus exactly where it sits.
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
         string_agg(distinct reason,', ') reasons,
         string_agg(distinct source_row->>'Note',' | ') notes,
         string_agg(distinct source_row->>'User',', ') by_whom,
         max(adjusted_on) on_date, jsonb_agg(source_row order by adjusted_on) verbatim
  from metrc_rpt_adjustments where quantity is not null and f_is_weight(uom) group by 1),
lab as (
  select upper(btrim(package_tag)) tag, count(*) tests, count(*) filter (where passed is false) failures,
         min(result_date) first_tested, string_agg(distinct lab_facility,', ') labs,
         max(result) filter (where test_name ilike 'Total THC (%%)%%')   thc,
         max(result) filter (where test_name ilike 'Moisture Content%%') moisture,
         string_agg(distinct test_name,' | ') filter (where passed is false) failed_tests
  from metrc_lab_results where package_tag is not null group by 1)
select
  -- IDENTITY
  pk.tag,
  pk.raw->'Item'->>'Name'                                            as item,
  coalesce(pk.raw->'Item'->>'ProductCategoryName','(unknown)')        as category,
  coalesce(nullif(pk.raw->'Item'->>'StrainName',''),
           f_strain_from_item(pk.raw->'Item'->>'Name'))               as strain,
  coalesce(nullif(pk.raw->>'ItemFromFacilityName',''),'(unknown)')    as supplier,
  nullif(pk.raw->>'ItemFromFacilityLicenseNumber','')                 as supplier_licence,
  pk.license                                                          as our_licence,
  -- BOUGHT IN
  nullif(pk.raw->>'ReceivedFromManifestNumber','')                    as inbound_manifest,
  nullif(pk.raw->>'ReceivedFromFacilityName','')                      as delivered_by,
  left((pk.raw->>'ReceivedDateTime'),10)::date                        as date_received,
  (pk.raw->>'PackagedDate')::date                                     as date_supplier_packaged,
  round(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
        coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as lb_received,
  case when nullif(pk.raw->>'ReceivedDateTime','') is not null
            and (pk.raw->>'PackagedDate')::date is not null
       then left((pk.raw->>'ReceivedDateTime'),10)::date - (pk.raw->>'PackagedDate')::date
  end                                                                 as age_on_arrival_days,
  -- WHERE IT IS
  coalesce(nullif(pk.raw->>'LocationName',''),'(no room)')            as current_room,
  nullif(pk.raw->>'SublocationName','')                               as current_sublocation,
  round(f_to_pounds(coalesce((pk.raw->>'Quantity')::numeric,0),
        coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as lb_on_hand,
  -- PROCESSED
  kids.first_processed                                                as date_processed,
  kids.children, kids.made_into, kids.made_lb, kids.child_tags,
  -- SOLD
  outb.first_shipped                                                  as date_sold,
  outb.manifests                                                      as outbound_manifest,
  outb.to_whom                                                        as sold_to,
  outb.lb                                                             as lb_sold,
  -- DESTROYED
  adj.lb                                                              as lb_adjusted,
  adj.reasons                                                         as destroy_reason,
  adj.notes                                                           as destroy_note,
  adj.by_whom                                                         as destroyed_by,
  adj.on_date                                                         as date_destroyed,
  -- AGEING — the cash question
  case when left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then coalesce(outb.first_shipped, kids.first_processed, adj.on_date, current_date)
            - left((pk.raw->>'ReceivedDateTime'),10)::date end        as days_held_total,
  case when left((pk.raw->>'ReceivedDateTime'),10) <> '' and kids.first_processed is not null
       then kids.first_processed - left((pk.raw->>'ReceivedDateTime'),10)::date end as days_to_process,
  case when left((pk.raw->>'ReceivedDateTime'),10) <> '' and outb.first_shipped is not null
       then outb.first_shipped - left((pk.raw->>'ReceivedDateTime'),10)::date end   as days_to_sell,
  case when coalesce((pk.raw->>'Quantity')::numeric,0) > 0
            and left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then current_date - left((pk.raw->>'ReceivedDateTime'),10)::date end         as days_unsold_still_here,
  case when coalesce((pk.raw->>'Quantity')::numeric,0) > 0
            and left((pk.raw->>'ReceivedDateTime'),10) <> ''
       then case when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date > 180 then 'OVER 180 DAYS — CASH TIED UP'
                 when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date >  90 then '90-180 days'
                 when current_date - left((pk.raw->>'ReceivedDateTime'),10)::date >  30 then '30-90 days'
                 else 'under 30 days' end
       else null end                                                  as ageing_band,
  -- TESTING
  lab.first_tested as date_tested, lab.tests as lab_tests, lab.failures as lab_failures,
  lab.thc as total_thc_pct, lab.moisture as moisture_pct, lab.labs as lab_name, lab.failed_tests,
  case when lab.tag is null then 'NO LAB RESULT IMPORTED'
       when lab.failures > 0 then 'FAILED'
       when lab.tests < 20 then 'PASSED — partial panel (' || lab.tests || ' tests)'
       else 'PASSED — full panel (' || lab.tests || ' tests)' end      as lab_result,
  -- STATUS
  case
    when adj.lb <= -1 and coalesce(lab.failures,0)=0 and coalesce(adj.notes,'')=''
         then 'DESTROYED — NO REASON GIVEN'
    when adj.lb <= -1 and coalesce(lab.failures,0)=0
         then 'DESTROYED — no failing lab test'
    when adj.lb <= -1 then 'DESTROYED after a failed test'
    when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 then 'ON HAND'
    when outb.tag is not null and kids.tag is not null then 'PROCESSED THEN SOLD'
    when outb.tag is not null then 'SOLD AS-IS'
    when kids.tag is not null then 'PROCESSED INTO PRODUCT'
    else 'UNEXPLAINED — record stops with nothing recorded' end        as status,
  -- PROOF
  'https://ma.metrc.com/industry/' || pk.license || '/packages'        as metrc_link,
  (pk.raw->>'Id')                                                      as metrc_package_id,
  mdoc.storage_path                                                    as manifest_document,
  adj.verbatim                                                         as destroy_rows_verbatim,
  extract(year from left((pk.raw->>'ReceivedDateTime'),10)::date)::int  as year_received
from pk
left join outb on outb.tag=pk.tag
left join kids on kids.tag=pk.tag
left join adj  on adj.tag =pk.tag
left join lab  on lab.tag =pk.tag
left join (select manifest_number, min(storage_path) storage_path
           from metrc_documents where doc_type='manifest' group by 1) mdoc
       on mdoc.manifest_number = nullif(pk.raw->>'ReceivedFromManifestNumber','');

comment on view v_third_party_forensic is
  'THIRD-PARTY MATERIAL, seed to sale, one row per tag. The inbound manifest comes '
  'from the PACKAGE RECORD (ReceivedFromManifestNumber) -- NOT the transfer report, '
  'which only starts 2024-01-18 and made it look as though 2023-24 material had no '
  'paperwork. date_received is when WE took delivery; date_supplier_packaged is when '
  'the SUPPLIER packaged it, and age_on_arrival_days is the gap -- Paper City''s fresh '
  'frozen was 199 days old on arrival. Ageing columns answer the cash question: how '
  'long has this sat unsold.';

grant select on v_third_party_forensic to authenticated;
;
