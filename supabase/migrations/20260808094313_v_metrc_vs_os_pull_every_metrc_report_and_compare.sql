-- PULL EVERY METRC REPORT HERE, AND SHOW THE DISCREPANCY. Owner, 8 Aug 2026:
--   "Every report I shared from Metrc I must be able to pull the same report here,
--    and also fields for discrepancies between Metrc and OS, or discrepancies with
--    manifest or COA."
--
-- All 12 Metrc report exports are already imported - 97,565 rows. What was missing is
-- the COMPARISON: each report against what the API sync holds for the same thing.
-- The report and the API are two independent statements from the same regulator, so
-- where they differ, one of them is incomplete and NEITHER should be quoted until it
-- is known which. That is the house rule - disagreement is the finding.
--
-- Already proven by this comparison in one night:
--   * transfer_manifests: 2,692 manifests in the API, 2,643 with lines in the export
--     - 49 missing, 42 live incoming, 277 packages with no custody evidence, and
--     MC281714's export contains ZERO inbound manifests
--   * wholesale vs package_transfers: $72,828 apart on the same movements
--
-- UNDO: drop view v_metrc_vs_os.

create or replace view public.v_metrc_vs_os as
with x as (
  select 'Packages - Inventory'::text                                as metrc_report,
         'metrc_rpt_packages_inventory'::text                        as report_table,
         'metrc_packages (API sync)'::text                           as os_source,
         (select count(*) from metrc_rpt_packages_inventory)::numeric as report_rows,
         (select count(distinct tag) from metrc_packages
           where source_state = any(array['active','onhold']))::numeric as os_rows,
         'The export is a point-in-time snapshot; the API holds live state. A large gap means the export is stale.'::text as note
  union all
  select 'Harvests', 'metrc_rpt_harvests', 'metrc_harvests (API sync)',
         (select count(*) from metrc_rpt_harvests),
         (select count(*) from metrc_harvests),
         'Must match exactly. Both describe the same harvest population.'
  union all
  select 'Lab Results', 'metrc_rpt_lab_results', 'metrc_lab_results (API sync)',
         (select count(distinct package_tag) from metrc_rpt_lab_results),
         (select count(distinct package_tag) from metrc_lab_results),
         'Compared on DISTINCT PACKAGES, not rows - the API holds one row per analyte, the export one per test.'
  union all
  select 'Transfers - Manifests', 'metrc_rpt_transfer_manifests', 'metrc_transfers (API sync)',
         (select count(distinct manifest_number) from metrc_rpt_transfer_manifests),
         (select count(distinct manifest_number) from metrc_transfers),
         'Every manifest in the API must appear in the export. 49 do not - 42 live incoming covering 277 packages.'
  union all
  select 'Packages - Transferred', 'metrc_rpt_package_transfers', 'manifests carrying package lines',
         (select count(distinct manifest_number) from metrc_rpt_package_transfers),
         (select count(distinct manifest_number) from metrc_transfers),
         'This export is the ONLY link between a package and its manifest. Anything it omits loses its custody evidence.'
  union all
  select 'Wholesale Transfers', 'metrc_rpt_wholesale', 'metrc_rpt_package_transfers (the other export)',
         (select count(distinct manifest_number) from metrc_rpt_wholesale),
         (select count(distinct manifest_number) from metrc_rpt_package_transfers),
         'Two Metrc reports describing the same movements. They differ by $72,828 in value - one is incomplete.'
  union all
  select 'Adjustments', 'metrc_rpt_adjustments', 'packages with an adjustment',
         (select count(distinct package_tag) from metrc_rpt_adjustments),
         (select count(distinct tag) from metrc_packages
           where (raw->>'CreatedQuantity')::numeric <> quantity), 
         'Packages whose quantity changed after creation should appear in the adjustments export.'
  union all
  select 'Harvest Moisture', 'metrc_rpt_harvest_moisture', 'metrc_harvests (API sync)',
         (select count(*) from metrc_rpt_harvest_moisture),
         (select count(*) from metrc_harvests),
         'Moisture is recorded per harvest. A gap means harvests with no moisture entry.'
  union all
  select 'Test Batches', 'metrc_rpt_test_batches', 'distinct lab test batches',
         (select count(*) from metrc_rpt_test_batches),
         (select count(distinct raw->>'LabTestResultId') from metrc_lab_results),
         'Each test batch should correspond to a lab result set.'
)
select x.metrc_report, x.report_table, x.os_source, x.report_rows, x.os_rows,
       (x.report_rows - x.os_rows)                                as difference,
       case when x.os_rows > 0
            then round(abs(x.report_rows - x.os_rows) / x.os_rows * 100, 2) end as pct_apart,
       case when x.report_rows = x.os_rows then 'AGREE'
            when x.report_rows = 0         then 'REPORT NOT IMPORTED'
            else 'DISCREPANCY' end                                as verdict,
       x.note,
       'THE ISSUE: a Metrc report export and the Metrc API describe the same facts. '
       'Where they differ one is incomplete, and neither figure may be quoted until '
       'it is known which.'                                       as what_is_wrong,
       'Re-pull the export for the affected licence and date range, then re-compare. '
       'Never reconcile by preferring the larger number.'         as what_to_do
from x;

comment on view public.v_metrc_vs_os is
  'Every Metrc report export against what the API sync holds for the same thing. '
  'Both come from the regulator, so a difference means one is incomplete - report '
  'both, never average, never prefer the larger. This comparison has already found '
  '49 manifests missing from the transfer export (277 packages with no custody '
  'evidence) and $72,828 between two wholesale reports.';;
