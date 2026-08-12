-- Agent I, 12 Aug 2026. Filed under DBI-024. v2: metrc_rpt_package_transfers orders by
-- as_of_date, not id - checked the columns this time instead of assuming them.
--
-- Fixing MY OWN defect, reported by Agent B: v_flow_in_transit took 30.7s per 50 rows and its
-- manifest join matched 0 OF 429 - I LIKE-scanned metrc_transfers.raw, the wrong table and an
-- unindexable scan. The real tag-to-manifest link is metrc_rpt_package_transfers. B caught it
-- by measuring instead of trusting. Drill rows already come from v_stock_proof; this remains
-- the stage-6 aggregate only.
--
-- UNDO: restore from migration flow_stage_in_transit_with_proof_drill_v2.

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
left join lateral (select t.manifest_number
                     from metrc_rpt_package_transfers t
                    where t.package_tag = p.tag
                    order by t.as_of_date desc nulls last limit 1) m on true
left join lateral (select dm.storage_path from metrc_documents dm
                    where dm.manifest_number = m.manifest_number and dm.doc_type ilike '%manifest%' limit 1) md on true
where p.source_state = 'intransit' and not coalesce(p.finished, false);

comment on view public.v_flow_in_transit is
 'Stage-6 aggregate for the In transit flow stage. DRILL ROWS COME FROM v_stock_proof, not here. '
 'Manifest resolved via metrc_rpt_package_transfers (the real tag-to-manifest link) after the '
 'original LIKE-scan against metrc_transfers.raw matched 0 of 429 and took 30.7s per 50 rows - '
 'my defect, caught by Agent B measuring instead of trusting, fixed 12 Aug 2026.';;
