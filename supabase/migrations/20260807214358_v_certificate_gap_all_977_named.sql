-- EVERYTHING HAS A TAG FROM SEED TO SALE. Owner, 7 Aug 2026.
-- So a tested package cannot lack a certificate - Metrc issues a document id with
-- every lab result. "No certificate" was never a data gap, it is a FETCH gap, and
-- this view names every package in it so none can hide in a total.
--
-- 977 packages, every one identified, in three buckets:
--   A  182 - the COA document id is ALREADY in metrc_lab_results. Pure download.
--   B  666 - results synced, document id never captured by the lab sync. Re-pull
--            the lab result to obtain it, then download.
--   C  129 - lab_testing_state says tested but NO results synced at all. This is
--            the real anomaly and needs a Metrc re-pull for the package.
-- 22 are still ACTIVE and are the ones that matter for anything shippable.
--
-- UNDO: drop view v_certificate_gap;

create or replace view public.v_certificate_gap as
with p as (
  select distinct on (tag) tag, item_name, license, uom, quantity, packaged_on,
         lab_testing_state, source_state, raw
  from metrc_packages order by tag, license
)
select p.tag                                     as package_tag,
       left(p.item_name, 55)                     as item_name,
       p.license,
       p.lab_testing_state,
       p.source_state,
       case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
       p.packaged_on,
       current_date - p.packaged_on              as days_held,
       p.raw->>'LocationName'                    as location,
       p.raw->>'ItemFromFacilityLicenseNumber'   as platform_license,
       nullif(p.raw->>'ReceivedFromManifestNumber','') as inbound_manifest,
       nullif(p.raw->>'ReceivedFromFacilityName','')   as received_from,
       (select count(*) from metrc_lab_results l where l.package_tag = p.tag) as lab_result_rows,
       (select max(l.document_file_id::text) from metrc_lab_results l
         where l.package_tag = p.tag and l.document_file_id is not null)      as coa_document_id,
       case
         when exists (select 1 from metrc_lab_results l
                       where l.package_tag = p.tag and l.document_file_id is not null)
           then 'A - COA ID HELD'
         when exists (select 1 from metrc_lab_results l where l.package_tag = p.tag)
           then 'B - NO DOCUMENT ID'
         else 'C - NO LAB RESULTS'
       end as bucket,
       case
         when exists (select 1 from metrc_lab_results l
                       where l.package_tag = p.tag and l.document_file_id is not null)
           then 'Download it: GET /labtests/v2/labtestdocument/<coa_document_id>, store in metrc_documents, parse the Client Info block.'
         when exists (select 1 from metrc_lab_results l where l.package_tag = p.tag)
           then 'Re-pull the lab result for this package to capture LabTestResultDocumentFileId, then download.'
         else 'lab_testing_state says tested but no results are synced. Re-pull this package''s lab results from Metrc before anything else.'
       end as what_to_do,
       'THE ISSUE: this package carries a test result but no certificate is linked to it or to anything in its lineage. Ownership and potency cannot be independently confirmed, so nothing may be posted on it.' as what_is_wrong
from p
left join v_certificate_resolved r on r.package_tag = p.tag
where r.package_tag is null
  and p.lab_testing_state not in ('NotSubmitted','NotRequired','SubmittedForTesting','TestingInProgress');

comment on view public.v_certificate_gap is
  'Every package that has been tested but has no certificate anywhere in its lineage. '
  'Named individually - no totals without the rows behind them. bucket says what is '
  'missing and what_to_do says how to close it. Empty is the good state.';;
