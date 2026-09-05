-- Applied prod 20260905100139.
-- rpt-packages-inventory was table_ref=metrc_rpt_packages_inventory default_range=today
-- which hid the 2026-08-06 freeze (every row as_of 8/6). Totals would mix g/lb/ea.

update public.nav_registry
   set table_ref = 'v_packages_inventory_truth',
       default_range = 'all',
       date_policy = 'auto',
       range_kind = 'snapshot',
       description = 'Metrc Packages Inventory close. As-of freeze (currently 2026-08-06). quantity mixes g/lb/ea — do not total it; use qty_g / qty_lb / qty_ea. NOT today on-hand.'
 where view_key = 'rpt-packages-inventory';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.packages_inventory_truth',
  'Packages Inventory — as-of freeze, UOM split, not on-hand',
  'Metrc',
  'v_packages_inventory_truth',
  'as_of_date',
  '{}'::text[],
  '{}'::jsonb,
  array['licence','package_tag'],
  'one row per licence + package_tag on the freeze',
  true,
  'quantity is mixed g/lb/ea. Totals refused. Not today on-hand.',
  array['licence','uom','qty_class','location','category']
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
