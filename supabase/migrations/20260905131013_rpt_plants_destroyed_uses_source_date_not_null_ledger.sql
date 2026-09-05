-- Applied prod 20260905131013.
-- rpt-plants-destroyed pointed at metrc_rpt_plants_destroyed and defaulted
-- this_month_td. destroyed_on is NULL on every row, so the period bus dropped
-- the book. Date lives on source_row 'Destroyed Date' (Excel serial) via
-- v_plants_destroyed_truth.destroyed_date_from_source. Ledger not rewritten.

update public.nav_registry
   set table_ref = 'v_plants_destroyed_truth',
       default_range = 'this_month_td',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Destroyed Date from source_row Excel serial. Ledger destroyed_on is NULL — do not rewrite. Period bus filters destroyed_date_from_source, not destroyed_on. 3,772 dated; 1 row is plant_tag=Destroyed Note (header ingested as data).'
 where view_key = 'rpt-plants-destroyed';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.plants_destroyed_source_date',
  'Plants Destroyed — date from source_row, ledger not rewritten',
  'Metrc',
  'v_plants_destroyed_truth',
  'destroyed_date_from_source',
  '{}'::text[],
  '{}'::jsonb,
  array['plant_tag','licence'],
  'one plant_tag per licence (destroyed_on stays NULL)',
  true,
  'Do not filter destroyed_on. Do not rewrite the ledger. Empty measures — this is a count of plants, not pounds.',
  array['licence','strain','location','phase']
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
