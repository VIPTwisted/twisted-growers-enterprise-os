-- Applied prod 20260905125815.
-- rpt-point-in-time defaulted to this_month_td. PIT as_of_date values are
-- discrete closes (2023-12-31 … 2026-08-29). In Sep 2026 that hid the book.
-- PIT certifies tags, not pounds.

update public.nav_registry
   set default_range = 'all',
       range_kind = 'snapshot',
       date_policy = 'auto',
       description = 'Inventory Point in Time is a tag freeze on as_of_date. No quantity on the file. this_month_td in Sep 2026 hid every close (latest as_of 2026-08-29). Default all. Do not invent pounds.'
 where view_key = 'rpt-point-in-time';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.point_in_time_tags',
  'Inventory Point in Time — tags, no quantity',
  'Metrc',
  'metrc_rpt_point_in_time',
  'as_of_date',
  '{}'::text[],
  '{}'::jsonb,
  array['as_of_date','licence_number','tag'],
  'one row per as_of_date + licence + tag',
  true,
  'PIT certifies which tags were held. It cannot certify how much. Do not total pounds.',
  array['as_of_date','licence_number','record_type','status_current']
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
