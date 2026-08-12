-- Agent I (Database COO), 12 Aug 2026. DBI-052 v3 (reviewers V, X, W). URGENT REPAIR.
--
-- MY BREAK, AND THE WORST KIND. v2 did `create or replace view v_stock_packages as select
-- base.* from v_stock_packages base ...` - the view referencing ITSELF. Postgres accepted the
-- definition and every query then died with "infinite recursion detected in rules". The Stock
-- Detail page the owner was reading at that moment went down, and I did it while adding a
-- feature he had just asked for.
--
-- WHY IT HAPPENED: I reached for the append-a-column idiom that has worked all day
-- (select base.*, new_stuff from <source> base) and pasted the view's OWN name as the source
-- instead of its underlying query. The idiom is safe on a base table and fatal on the view
-- itself. Recovered from this morning's committed baseline dump - which is precisely why that
-- gate exists and why regenerating it casually is dangerous.
--
-- NOW REBUILT CORRECTLY: the original SELECT verbatim from the baseline, with the document
-- columns joined onto the BASE QUERY. No self-reference. Verified by querying it after apply.
--
-- THE FEATURE, unchanged - owner hard rule 12 Aug: "every time a user drills down an item it
-- must have these docs... wherever a user is working they can pull it as needed", plus the half
-- nobody had built: "the manifest it gets sold to, when sold". Measured on held TestPassed
-- packages: 132 certificate direct, 231 INHERITED from a parent (already resolvable, never
-- asked for), 17 lab-result-only, 9 with nothing. Every document column comes from
-- mv_tag_evidence, the single resolver - no view re-derives documents.
--
-- UNDO: replay lines 26659-26713 of supabase/migrations/20260812120316_baseline_live_schema.sql.

create or replace view public.v_stock_packages as
 SELECT p.tag AS package_tag,
    p.item_name,
    p.raw #>> '{Item,StrainName}'::text[] AS strain,
        CASE
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%fresh frozen%'::text THEN 'Fresh frozen'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%bud%'::text THEN 'Dried flower'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%shake%'::text OR (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%trim%'::text THEN 'Shake and trim'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%concentrate%'::text THEN 'Concentrate'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%roll%'::text THEN 'Pre-rolls'::text
            WHEN (p.raw #>> '{Item,ProductCategoryName}'::text[]) ~~* '%vape%'::text THEN 'Vape'::text
            ELSE COALESCE(p.raw #>> '{Item,ProductCategoryName}'::text[], '(uncategorised)'::text)
        END AS stream,
        CASE
            WHEN f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber'::text) THEN 'Grown by us'::text
            ELSE 'Bought in'::text
        END AS origin,
    COALESCE(NULLIF(p.raw ->> 'ItemFromFacilityName'::text, ''::text), 'not recorded'::text) AS made_by,
    COALESCE(NULLIF(p.raw ->> 'ReceivedFromFacilityName'::text, ''::text), '—'::text) AS shipped_to_us_by,
    NULLIF(p.raw ->> 'ReceivedFromManifestNumber'::text, ''::text) AS inbound_manifest,
    p.license,
    p.location,
    p.raw ->> 'LabTestingState'::text AS lab_state,
    round(p.quantity) AS quantity,
    p.uom,
    round(f_to_pounds(p.quantity, p.uom), 3) AS pounds,
    p.packaged_on,
    CURRENT_DATE - p.packaged_on AS days_here,
    NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) AS source_harvest,
    NULLIF(p.raw ->> 'SourcePackageLabels'::text, ''::text) AS made_from_packages,
    NULLIF(p.raw ->> 'SourceProductionBatchNumbers'::text, ''::text) AS production_batch,
    (p.raw ->> 'LabTestingStateDate'::text)::date AS submitted_on,
    (p.raw ->> 'LabTestingRecordedDate'::text)::date AS result_on,
    (p.raw ->> 'LabTestResultExpirationDateTime'::text)::date AS coa_expires,
    h.harvest_start AS harvest_cut_on,
    COALESCE(NULLIF(h.raw ->> 'DryingLocationName'::text, ''::text), '—'::text) AS dried_in,
    (h.raw ->> 'FinishedDate'::text)::date AS harvest_closed_on,
        CASE
            WHEN NULLIF(p.raw ->> 'SourceHarvestNames'::text, ''::text) IS NOT NULL THEN 'Traceable to harvest '::text || (p.raw ->> 'SourceHarvestNames'::text)
            WHEN NULLIF(p.raw ->> 'SourcePackageLabels'::text, ''::text) IS NOT NULL THEN 'Made from package '::text || (p.raw ->> 'SourcePackageLabels'::text)
            WHEN NOT f_is_ours(p.raw ->> 'ItemFromFacilityLicenseNumber'::text) THEN (('BOUGHT IN — no harvest of ours to trace to. Its history sits with '::text || COALESCE(NULLIF(p.raw ->> 'ItemFromFacilityName'::text, ''::text), 'the supplier'::text)) || COALESCE(', arrived on manifest '::text || NULLIF(p.raw ->> 'ReceivedFromManifestNumber'::text, ''::text), ''::text)) || '. Ask them for the certificate and cultivation record.'::text
            ELSE 'NO SOURCE RECORDED in Metrc — neither a harvest nor a parent package. This is a lineage gap and should be corrected.'::text
        END AS traceability,
    f_is_weight(p.uom) AS sold_by_weight,
        CASE
            WHEN NOT f_is_weight(p.uom) THEN round(p.quantity)
            ELSE NULL::numeric
        END AS units,
        CASE
            WHEN f_is_weight(p.uom) THEN round(f_to_pounds(p.quantity, p.uom), 3)::text || ' lb'::text
            ELSE (round(p.quantity)::text || ' '::text) || COALESCE(p.uom, 'units'::text)
        END AS quantity_shown,
    -- ── documents, appended; every one from mv_tag_evidence, the single resolver ──
    ev.evidence_source,
    ev.certificate_id,
    ev.certificate_date,
    ev.certificate_document,
    ev.certificate_inherited_from,
    ev.lab_result_date,
    ev.lab_name,
    ev.manifest_document AS inbound_manifest_document,
    ev.why_no_certificate,
    ev.why_no_manifest,
    out.outbound_manifest,
    out.sold_to,
    out.shipped_on,
    out.outbound_manifest_document,
    CASE WHEN out.outbound_manifest IS NULL THEN
      'Still held — no outbound manifest because this package has not left. When it ships, the manifest number and the receiving licensee appear here.'
    END AS why_no_outbound_manifest
   FROM metrc_packages p
     LEFT JOIN metrc_harvests h ON h.name = split_part(COALESCE(p.raw ->> 'SourceHarvestNames'::text, ''::text), ','::text, 1)
     LEFT JOIN mv_tag_evidence ev ON ev.tag = p.tag
     LEFT JOIN LATERAL (
        SELECT t.manifest_number AS outbound_manifest,
               COALESCE(NULLIF(t.source_row->>'Dest. Facility',''), NULLIF(t.source_row->>'Dest. Lic.','')) AS sold_to,
               t.as_of_date AS shipped_on,
               (SELECT d.storage_path FROM metrc_documents d
                 WHERE d.manifest_number = t.manifest_number AND d.doc_type ILIKE '%manifest%' LIMIT 1) AS outbound_manifest_document
          FROM metrc_rpt_package_transfers t
         WHERE t.package_tag = p.tag
           AND NOT f_is_ours(COALESCE(NULLIF(t.source_row->>'Dest. Lic.',''), t.destination_licence))
         ORDER BY t.as_of_date DESC NULLS LAST
         LIMIT 1
     ) out ON true
  WHERE COALESCE(p.quantity, 0::numeric) > 0::numeric AND COALESCE((p.raw ->> 'IsFinished'::text)::boolean, false) = false;

comment on view public.v_stock_packages is
 'Every package on hand, one row per Metrc tag, CARRYING ITS DOCUMENTS - owner hard rule 12 Aug '
 '2026: every item a user drills into must have its papers, pullable wherever they are working. '
 'Certificate (direct or INHERITED from a parent, which resolves 231 held TestPassed tags that '
 'previously showed nothing), lab result and lab name, inbound manifest, and the OUTBOUND '
 'manifest with the receiving licensee once the package ships. Absence is explained in a '
 'sentence, never left blank (A3). All document columns come from mv_tag_evidence, the single '
 'resolver. NOTE: v2 of this view referenced ITSELF and took the Stock Detail page down with '
 'infinite recursion - append columns onto the BASE QUERY, never onto the view being replaced.';;
