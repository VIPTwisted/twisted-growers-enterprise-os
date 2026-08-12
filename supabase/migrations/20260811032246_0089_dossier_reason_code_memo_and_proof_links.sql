-- ---------------------------------------------------------------------------
-- 0089 — REASON CODE, MEMO, and PROOF LINKS on every tag.
--
-- Owner 11 Aug 2026: each tag needs a reason code AND a memo explaining its
-- situation in full, individually. And: "FROM OS WE WOULD NEED TO QUICKLY LOGIN TO
-- METRC IF LETS SAY BERT DISPUTED AND SHOW PROOF."
--
-- So three things are added, all APPENDED (CREATE OR REPLACE cannot reorder):
--   reason_code   acquired | lab | ended -- filterable
--   memo          the full narrative, COMPOSED FROM THE FIELD VALUES, never
--                 hand-written, so it cannot drift from the data
--   proof links   the Metrc package screen, the manifest PDF we hold, and the
--                 VERBATIM adjustment row as Metrc recorded it
--
-- The verbatim row is the point: in a dispute the argument is settled by Metrc's
-- own record of who adjusted what, when, and with what note -- not by our summary
-- of it.
-- ---------------------------------------------------------------------------
create or replace view v_material_forensic_dossier as
with pk as (
  select distinct on (upper(btrim(p.raw->>'Label'))) upper(btrim(p.raw->>'Label')) tag, p.raw, p.license
  from metrc_packages p order by 1, (p.raw->>'LastModified') desc nulls last),
inb as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests, min(received_on) received_on,
         string_agg(distinct coalesce(origin_facility, origin_licence), ', ') from_whom,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('INBOUND','INTERNAL') and voided<>'True' group by 1),
outb as (
  select upper(btrim(package_tag)) tag,
         string_agg(distinct manifest_number, ', ') manifests, max(received_on) shipped_on,
         string_agg(distinct coalesce(dest_facility, dest_licence), ', ') to_whom,
         round(sum(pounds)::numeric,3) lb
  from v_transfer_line where direction in ('OUTBOUND','INTERNAL') and voided<>'True' group by 1),
lab as (
  select upper(btrim(package_tag)) tag,
         count(*) tests, count(*) filter (where passed is false) failures,
         min(result_date) first_tested, max(result_date) last_tested,
         string_agg(distinct lab_facility, ', ') labs,
         max(result) filter (where test_name ilike 'Total THC (%%)%%')       total_thc_pct,
         max(result) filter (where test_name ilike 'Moisture Content%%')     moisture_pct,
         max(result) filter (where test_name ilike 'Total Yeast and Mold%%') yeast_mold,
         max(result) filter (where test_name ilike 'Water Activity%%')       water_activity,
         string_agg(distinct test_name, ' | ') filter (where passed is false) failed_tests
  from metrc_lab_results where package_tag is not null group by 1),
adj as (
  select upper(btrim(package_tag)) tag,
         round(sum(f_to_pounds(quantity,uom))::numeric,3) lb,
         string_agg(distinct reason, ', ') reasons,
         string_agg(distinct source_row->>'Note', ' | ') notes,
         string_agg(distinct source_row->>'User', ', ') adjusted_by,
         min(adjusted_on) first_adj, max(adjusted_on) last_adj,
         jsonb_agg(source_row order by adjusted_on) verbatim
  from metrc_rpt_adjustments where quantity is not null and f_is_weight(uom) group by 1),
kids as (
  select btrim(pt.tag) tag, count(*) children,
         string_agg(distinct coalesce(c.raw->'Item'->>'ProductCategoryName','?'), ', ') child_categories,
         string_agg(distinct c.raw->'Item'->>'Name', ' | ') child_items,
         min((c.raw->>'PackagedDate')::date) first_run,
         round(sum(f_to_pounds(coalesce((c.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(c.raw->>'UnitOfMeasureName',''),'Grams'))
             / greatest(array_length(string_to_array(c.raw->>'SourcePackageLabels',', '),1),1))::numeric,3) produced_lb
  from metrc_packages c
  join lateral unnest(string_to_array(c.raw->>'SourcePackageLabels', ', ')) pt(tag) on true
  where nullif(c.raw->>'SourcePackageLabels','') is not null group by 1),
mdoc as (
  select manifest_number, min(storage_path) storage_path, min(download_url) download_url
  from metrc_documents where doc_type='manifest' and manifest_number is not null group by 1)
select pk.tag,
       pk.raw->'Item'->>'Name'                                        as item,
       coalesce(pk.raw->'Item'->>'ProductCategoryName','(unknown)')    as category,
       coalesce(nullif(pk.raw->'Item'->>'StrainName',''),
                f_strain_from_item(pk.raw->'Item'->>'Name'))           as strain,
       coalesce(nullif(pk.raw->>'ItemFromFacilityName',''),'(unknown)') as material_from,
       case when f_is_ours(coalesce(nullif(pk.raw->>'ItemFromFacilityLicenseNumber',''),''))
            then 'OURS' else 'THIRD PARTY' end                        as ownership,
       pk.license                                                     as held_under_licence,
       (pk.raw->>'PackagedDate')::date                                as packaged_on,
       inb.received_on, inb.manifests as inbound_manifests, inb.from_whom,
       round(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as acquired_lb,
       case when inb.manifests is null
            then 'NO INBOUND MANIFEST — received before our transfer data begins (2024-01-18)'
            else 'documented on manifest ' || inb.manifests end        as acquisition_evidence,
       lab.first_tested, lab.last_tested, lab.tests as lab_tests, lab.failures as lab_failures,
       lab.total_thc_pct, lab.moisture_pct, lab.yeast_mold, lab.water_activity, lab.labs,
       case when lab.tag is null                then 'NEVER TESTED in our data'
            when lab.failures > 0               then 'FAILED — ' || lab.failures || ' failing result(s)'
            when lab.tests < 20                 then 'PASSED, but a PARTIAL panel only (' || lab.tests || ' tests)'
            else 'PASSED a full panel (' || lab.tests || ' tests)' end  as lab_verdict,
       kids.children, kids.child_categories, kids.child_items, kids.produced_lb,
       case when kids.tag is null then null
            else round((100.0*kids.produced_lb / nullif(f_to_pounds(
                 coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
                 coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams')),0))::numeric,2) end as yield_pct,
       outb.shipped_on, outb.manifests as outbound_manifests, outb.to_whom, outb.lb as shipped_lb,
       adj.lb as adjusted_lb, adj.reasons as adjustment_reasons,
       adj.notes as adjustment_notes, adj.adjusted_by, adj.first_adj, adj.last_adj,
       coalesce((pk.raw->>'IsFinished')::boolean,false)                as finished,
       (pk.raw->>'FinishedDate')::date                                 as finished_on,
       coalesce(nullif(pk.raw->>'LocationName',''),'(no room)')        as room,
       round(f_to_pounds(coalesce((pk.raw->>'Quantity')::numeric,0),
             coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) as on_hand_lb,
       case when (pk.raw->>'PackagedDate')::date is not null and (pk.raw->>'FinishedDate')::date is not null
            then ((pk.raw->>'FinishedDate')::date - (pk.raw->>'PackagedDate')::date) end as days_held,
       case
         when adj.lb <= -1 and coalesce(lab.failures,0) = 0
              then 'DESTROYED WITH NO FAILING LAB RESULT — ' || coalesce(adj.notes,'no note given')
         when adj.lb <= -1 then 'DESTROYED — ' || coalesce(adj.notes,'no note given')
         when kids.tag is not null and outb.tag is not null then 'PROCESSED AND SHIPPED'
         when kids.tag is not null then 'PROCESSED INTO PRODUCT'
         when outb.tag is not null then 'SHIPPED OUT'
         when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 then 'ON HAND'
         else 'CLOSED — no recorded outcome' end                       as outcome,
       -- APPENDED --------------------------------------------------------------
       concat_ws(' | ',
         case when inb.manifests is not null then 'ACQ_MANIFESTED'
              when (pk.raw->>'PackagedDate')::date < date '2024-01-18' then 'ACQ_NO_MANIFEST_PREDATES_DATA'
              else 'ACQ_NO_MANIFEST' end,
         case when lab.tag is null        then 'LAB_NEVER_TESTED'
              when lab.failures > 0       then 'LAB_FAILED'
              when lab.tests < 20         then 'LAB_PASSED_PARTIAL_PANEL'
              else 'LAB_PASSED_FULL_PANEL' end,
         case when adj.lb <= -1 and coalesce(lab.failures,0)=0 then 'END_DESTROYED_NO_FAILING_TEST'
              when adj.lb <= -1           then 'END_DESTROYED_AFTER_FAIL'
              when kids.tag is not null and outb.tag is not null then 'END_PROCESSED_AND_SHIPPED'
              when kids.tag is not null   then 'END_PROCESSED'
              when outb.tag is not null   then 'END_SHIPPED'
              when coalesce((pk.raw->>'Quantity')::numeric,0) > 0 then 'END_ON_HAND'
              else 'END_CLOSED_NO_OUTCOME' end)                        as reason_code,
       concat_ws(' ',
         'Acquired ' || round(f_to_pounds(coalesce((pk.raw->>'CreatedQuantity')::numeric,0),
              coalesce(nullif(pk.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3)
           || ' lb of ' || coalesce(pk.raw->'Item'->>'ProductCategoryName','material')
           || coalesce(' (' || nullif(pk.raw->'Item'->>'StrainName','') || ')','')
           || ' from ' || coalesce(nullif(pk.raw->>'ItemFromFacilityName',''),'an unrecorded source')
           || ', packaged ' || coalesce((pk.raw->>'PackagedDate')::date::text,'date unknown') || '.',
         case when inb.manifests is not null
              then 'Received ' || coalesce(inb.received_on::text,'') || ' on manifest ' || inb.manifests
                   || ' from ' || coalesce(inb.from_whom,'') || '.'
              when (pk.raw->>'PackagedDate')::date < date '2024-01-18'
              then 'NO INBOUND MANIFEST: this predates our transfer data, which begins 2024-01-18, so there is no documented purchase leg in the OS.'
              else 'NO INBOUND MANIFEST on record.' end,
         case when lab.tag is null then 'NEVER TESTED in our data.'
              when lab.failures > 0
                then 'Tested ' || coalesce(lab.first_tested::text,'') || ' by ' || coalesce(lab.labs,'')
                     || ': ' || lab.tests || ' tests, ' || lab.failures || ' FAILED — ' || coalesce(lab.failed_tests,'') || '.'
              when lab.tests < 20
                then 'Tested ' || coalesce(lab.first_tested::text,'') || ' by ' || coalesce(lab.labs,'')
                     || ': ' || lab.tests || ' tests, all passed, but a PARTIAL panel only'
                     || case when lab.total_thc_pct is null then ' — no potency' else '' end
                     || case when lab.moisture_pct is null then ', no moisture' else '' end
                     || case when lab.yeast_mold is null then ', no mould' else '' end || '.'
              else 'Tested ' || coalesce(lab.first_tested::text,'') || ' by ' || coalesce(lab.labs,'')
                     || ': full panel of ' || lab.tests || ' tests, all passed'
                     || coalesce(' — Total THC ' || lab.total_thc_pct || '%','')
                     || coalesce(', moisture ' || lab.moisture_pct || '%','')
                     || coalesce(', yeast and mould ' || lab.yeast_mold || ' CFU/g','') || '.' end,
         case when (pk.raw->>'FinishedDate')::date is not null and (pk.raw->>'PackagedDate')::date is not null
              then 'Held ' || ((pk.raw->>'FinishedDate')::date - (pk.raw->>'PackagedDate')::date)
                   || ' days in ' || coalesce(nullif(pk.raw->>'LocationName',''),'(no room)') || '.'
              else 'Currently in ' || coalesce(nullif(pk.raw->>'LocationName',''),'(no room)') || '.' end,
         case when kids.tag is not null
              then 'Processed from ' || coalesce(kids.first_run::text,'') || ' into ' || kids.children
                   || ' package(s) of ' || kids.child_categories || ' — ' || kids.child_items
                   || ' — yielding ' || kids.produced_lb || ' lb.'
              else 'Never processed into any child package.' end,
         case when outb.tag is not null
              then 'Shipped ' || coalesce(outb.lb::text,'') || ' lb to ' || coalesce(outb.to_whom,'')
                   || ' on manifest ' || coalesce(outb.manifests,'') || ' (' || coalesce(outb.shipped_on::text,'') || ').'
              else 'Never shipped out.' end,
         case when adj.lb <= -1
              then 'DESTROYED ' || abs(adj.lb) || ' lb on ' || coalesce(adj.last_adj::text,'')
                   || ' by ' || coalesce(adj.adjusted_by,'unknown user')
                   || ', reason ' || coalesce(adj.reasons,'') || ', note: "'
                   || coalesce(adj.notes,'none given') || '".'
                   || case when coalesce(lab.failures,0)=0
                           then ' NOTE: there is NO FAILING LAB RESULT on record for this tag.' else '' end
              else '' end,
         case when coalesce((pk.raw->>'Quantity')::numeric,0) > 0
              then 'Currently on hand.'
              when coalesce((pk.raw->>'IsFinished')::boolean,false)
              then 'Closed ' || coalesce((pk.raw->>'FinishedDate')::date::text,'') || ' at zero quantity.'
              else '' end)                                             as memo,
       -- PROOF: go straight to the source
       'https://ma.metrc.com/industry/' || pk.license || '/packages'    as metrc_packages_screen,
       (pk.raw->>'Id')                                                  as metrc_package_id,
       mdoc_in.storage_path                                             as inbound_manifest_document,
       mdoc_out.storage_path                                            as outbound_manifest_document,
       adj.verbatim                                                     as adjustment_rows_verbatim
from pk
left join inb on inb.tag=pk.tag left join outb on outb.tag=pk.tag
left join lab on lab.tag=pk.tag left join adj on adj.tag=pk.tag left join kids on kids.tag=pk.tag
left join mdoc mdoc_in  on mdoc_in.manifest_number  = split_part(inb.manifests, ', ', 1)
left join mdoc mdoc_out on mdoc_out.manifest_number = split_part(outb.manifests,', ', 1);

comment on view v_material_forensic_dossier is
  'Complete per-tag trail with a REASON CODE (acquired | lab | ended), a MEMO composed '
  'from the field values (never hand-written, so it cannot drift), and PROOF LINKS: the '
  'Metrc packages screen for the holding licence, the manifest PDFs we hold, and the '
  'VERBATIM adjustment rows as Metrc recorded them. In a dispute the argument is settled '
  'by Metrc''s own record of who adjusted what and with what note, not by our summary.';

grant select on v_material_forensic_dossier to authenticated;
;
