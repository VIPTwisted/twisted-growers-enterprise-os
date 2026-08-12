-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-024 (reviewers V, X, W).
-- Owner directive: add In-transit to the Seed-to-Sale flow, fully drill-downable to microscopic
-- audit level with proof - COA and manifest - consistent everywhere the items appear.
-- v2: coa_extract keys on document_id and lab_report_id, not certificate_id. Checked, corrected.
--
-- DATA LAYER ONLY. Tile sizing, the reusable component and the in-place drawer are Agent B's lane,
-- dispatched separately with the owner's design rules cited. This gives B one canonical stage row
-- and one canonical drill population so every page shows the same truth.
--
-- OWNER RULING GOVERNS THE DEFINITION: in-transit material is OURS until the destination accepts
-- (ruled 11 Aug 2026). The stage counts every unfinished package in Metrc's intransit state, ours
-- and third-party alike, split on the face per rule C6.
--
-- STAGE 6 APPENDS; nothing existing is renumbered, re-keyed or re-valued.
--
-- UNDO: restore v_flow_stages from migration flow_stage_in_transit_with_proof_drill's header;
--       drop view v_flow_in_transit. No table is touched.

create or replace view public.v_flow_stages as
 SELECT stage_no, stage, units, unit, pounds, oldest_days, drill, note
   FROM ( SELECT 0 AS stage_no, 'Blocked - failed'::text AS stage,
            ( SELECT sum(packages) FROM v_stock_on_hand WHERE lab_state = 'TestFailed') AS units,
            'packages'::text AS unit,
            ( SELECT round(sum(pounds),1) FROM v_stock_on_hand WHERE lab_state = 'TestFailed') AS pounds,
            ( SELECT max(oldest_days) FROM v_stock_on_hand WHERE lab_state = 'TestFailed') AS oldest_days,
            'failed_testing_by_origin'::text AS drill,
            'Failed testing - remediate or destroy'::text AS note
        UNION ALL
         SELECT 1, 'Growing',
            (( SELECT count(*) FROM metrc_plants
               WHERE source_state = ANY (ARRAY['vegetative','flowering','onhold'])))::numeric,
            'plants', NULL::numeric, NULL::integer, 'room_board',
            'Plants standing in the rooms now. Harvested and destroyed plants are excluded - they are not growing.'
        UNION ALL
         SELECT 2, 'Open harvests',
            (( SELECT count(*) FROM v_harvest_still_in_room))::numeric, 'harvests',
            ( SELECT round(sum(really_left_lb),1) FROM v_harvest_still_in_room),
            ( SELECT max(days_since_last_package) FROM v_harvest_still_in_room),
            'harvest_issues', 'Dry yield still to be packaged off. Dry-equivalent, not wet.'
        UNION ALL
         SELECT 3, 'Awaiting test',
            ( SELECT sum(packages) FROM v_stock_on_hand WHERE lab_state = 'NotSubmitted'), 'packages',
            ( SELECT round(sum(pounds),1) FROM v_stock_on_hand WHERE lab_state = 'NotSubmitted'),
            ( SELECT max(oldest_days) FROM v_stock_on_hand WHERE lab_state = 'NotSubmitted'),
            'lab_results', 'Never sent to the laboratory'
        UNION ALL
         SELECT 4, 'At the laboratory',
            ( SELECT sum(packages) FROM v_stock_on_hand
               WHERE lab_state LIKE '%ubmitted%' AND lab_state <> 'NotSubmitted'), 'packages',
            ( SELECT round(sum(pounds),1) FROM v_stock_on_hand
               WHERE lab_state LIKE '%ubmitted%' AND lab_state <> 'NotSubmitted'),
            ( SELECT max(oldest_days) FROM v_stock_on_hand
               WHERE lab_state LIKE '%ubmitted%' AND lab_state <> 'NotSubmitted'),
            'lab_turnaround', 'Awaiting a result'
        UNION ALL
         SELECT 5, 'Sellable',
            ( SELECT sum(packages) FROM v_stock_on_hand WHERE lab_state = 'TestPassed'), 'packages',
            ( SELECT round(sum(pounds),1) FROM v_stock_on_hand WHERE lab_state = 'TestPassed'),
            ( SELECT max(oldest_days) FROM v_stock_on_hand WHERE lab_state = 'TestPassed'),
            'stock_on_hand', 'Passed and free to move'
        UNION ALL
         SELECT 6, 'In transit',
            (( SELECT count(*) FROM metrc_packages
               WHERE source_state = 'intransit' AND NOT COALESCE(finished, false)))::numeric,
            'packages',
            ( SELECT round(sum(f_to_pounds(quantity, uom)),1) FROM metrc_packages
               WHERE source_state = 'intransit' AND NOT COALESCE(finished, false)),
            ( SELECT max((current_date - (raw->>'PackagedDate')::date))::integer FROM metrc_packages
               WHERE source_state = 'intransit' AND NOT COALESCE(finished, false)
                 AND coalesce(raw->>'PackagedDate','') <> ''),
            'in_transit',
            'On an active transfer the destination has not accepted. OURS until the receiver signs - owner ruling 11 Aug 2026. If rejected, it comes back.'
       ) q
  ORDER BY stage_no;

comment on view public.v_flow_stages is
 'The Seed-to-Sale flow strip, one row per stage. Stage 6 In transit added 11 Aug 2026 on owner '
 'direction: packages on an active transfer remain OURS until the destination accepts (owner '
 'ruling on metric third_party_pounds_on_hand). Every stage carries a drill key - rule C1: a tile '
 'without a drill-down is not finished and must not ship.';

create or replace view public.v_flow_in_transit as
select p.tag,
       p.item_name                                             as item,
       round(f_to_pounds(p.quantity, p.uom), 2)                as lb,
       p.quantity, p.uom,
       case when coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') in ('MC281714','MP281909')
            then 'Ours' else 'Third-party' end                 as origin,
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),
                'license ' || coalesce(p.raw->>'ItemFromFacilityLicenseNumber','?')) as made_by,
       p.raw->>'ItemFromFacilityLicenseNumber'                 as made_by_license,
       (p.raw->>'PackagedDate')::date                          as packaged_on,
       (current_date - (p.raw->>'PackagedDate')::date)         as days_since_packaged,
       p.location                                              as last_known_location,
       p.lab_testing_state                                     as lab_state,
       c.lab_report_id                                         as coa_report_id,
       c.total_thc                                             as coa_total_thc,
       c.report_date                                           as coa_report_date,
       d.storage_path                                          as coa_document,
       m.manifest_number                                       as manifest_number,
       md.storage_path                                         as manifest_document,
       p.raw->>'SourcePackageLabels'                           as parent_tags
from metrc_packages p
left join lateral (select ce.lab_report_id, ce.total_thc, ce.report_date from coa_extract ce
                    where ce.package_tag = p.tag order by ce.report_date desc nulls last limit 1) c on true
left join lateral (select dd.storage_path from metrc_documents dd
                    where dd.package_tag = p.tag and dd.doc_type ilike '%coa%' limit 1) d on true
left join lateral (select mm.manifest_number from metrc_transfers mm
                    where mm.raw::text like '%' || p.tag || '%'
                    order by mm.id desc limit 1) m on true
left join lateral (select dm.storage_path from metrc_documents dm
                    where dm.manifest_number = m.manifest_number and dm.doc_type ilike '%manifest%' limit 1) md on true
where p.source_state = 'intransit' and not coalesce(p.finished, false);

comment on view public.v_flow_in_transit is
 'The drill behind the In transit stage: one row per package on an active transfer, with its PROOF '
 'on the row - COA report and document, manifest number and document, parent tags, who made it and '
 'on which license. Rule C3a: every item row carries its certificate and its license. Ours vs '
 'Third-party split on the face per rule C6. Totals reconcile to the stage tile per rule C2 - same '
 'population, no separate filter.';;
