-- Applied prod 20260905141014.
-- rpt-wholesale defaulted this_month_td. File is a freeze: 465 as_of 2026-08-06
-- + 11,817 as_of NULL. created_on 2024-06-22 → 2026-08-07. In Sep 2026 that hid the book.

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Wholesale freeze. 465 rows as_of 2026-08-06 + 11,817 with as_of NULL. created_on 2024-06-22 → 2026-08-07. this_month_td in Sep 2026 hid the book (0 created this month). Period bus uses created_on, not as_of_date. Empty measures — Metrc amount is not Apex invoice SoR. Dual MATCH not claimed.'
 where view_key = 'rpt-wholesale';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.wholesale_freeze_created_on',
  'Wholesale freeze — filter created_on, not as_of',
  'Metrc',
  'metrc_rpt_wholesale',
  'created_on',
  '{}'::text[],
  '{}'::jsonb,
  array['manifest_number','invoice_number','item','licence'],
  'one item line per manifest/invoice as of freeze',
  true,
  'Do not total amount as certified sales. Apex is invoice SoR. shipped_qty mixed UOM. Dual MATCH not claimed.',
  array['licence','origin_licence','destination_licence','item_category']
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
