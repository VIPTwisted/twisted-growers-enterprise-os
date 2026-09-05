-- Applied prod 20260905175943.
-- Period bus one page: rpt-transfer-manifests.
-- Freeze: MC281714 978 created_on 2024-07-18→2026-08-06 as_of 2026-08-07;
-- MP281909 4302 created_on 2024-01-10→2026-08-07 as_of 2026-08-06/07.
-- this_month_td in Sep 2026 hid the custody freeze.
-- Date grain = created_on. as_of_date is the freeze stamp. Do not rewrite ledger. Do not total shipped_weight / received_weight.

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Transfer-manifest freeze. MC281714 978 + MP281909 4302. created_on 2024-01-10 → 2026-08-07. as_of 2026-08-06/07. this_month_td hid the book. Period bus uses created_on, not as_of_date. Empty measures — do not total shipped_weight. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-transfer-manifests';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.transfer_manifests_freeze_created_on',
  'Transfer manifests freeze — filter created_on, not as_of',
  'Metrc',
  'metrc_rpt_transfer_manifests',
  'created_on',
  '{}'::text[],
  '{}'::jsonb,
  array['manifest_number','invoice_number','licence'],
  'one manifest line as of freeze',
  true,
  'Custody freeze. Do not total shipped_weight/received_weight. Apex is invoice SoR. Dual MATCH not claimed. Ledger not rewritten.',
  array['licence','origin_licence','destination_licence','direction','transfer_type']
)
on conflict (report_key) do update set
  fact_view = excluded.fact_view,
  date_column = excluded.date_column,
  measures = excluded.measures,
  grain_keys = excluded.grain_keys,
  row_grain = excluded.row_grain,
  description = excluded.description,
  dimensions = excluded.dimensions,
  updated_at = now();
