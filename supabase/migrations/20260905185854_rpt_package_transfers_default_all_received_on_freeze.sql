-- Applied prod 20260905185854.
-- Period bus one page: rpt-package-transfers.
-- Freeze measured (not certified): MC281714 4,920 received_on 2024-05-30→2026-08-06 as_of 2026-08-06/07;
-- MP281909 14,336 received_on 2024-01-18→2026-08-06 as_of 2026-08-06/07.
-- this_month_td in Sep 2026 hid the custody freeze.
-- Date grain = received_on. as_of_date is the freeze stamp.
-- Empty measures — do not total shipped_qty (mixed UOM). Dual MATCH not claimed.
-- Ledger not rewritten. Apex invoice SoR unchanged. leftover_grok 0. room_cycle_days 56.

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Packages-transferred freeze. MC281714 4,920 + MP281909 14,336 measured rows. received_on 2024-01-18 → 2026-08-06. as_of 2026-08-06/07. this_month_td hid the book. Period bus uses received_on, not as_of_date. Empty measures — do not total shipped_qty (mixed UOM). Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-package-transfers';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.package_transfers_freeze_received_on',
  'Packages transferred freeze — filter received_on, not as_of',
  'Metrc',
  'metrc_rpt_package_transfers',
  'received_on',
  '{}'::text[],
  '{}'::jsonb,
  array['manifest_number','package_tag','licence'],
  'one transferred package line as of freeze',
  true,
  'Custody freeze. Do not total shipped_qty (mixed UOM). Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['licence','destination_licence','category','status']
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
