-- Applied prod 20260905135754.
-- rpt-harvests defaulted this_month_td. The file is a freeze: as_of_date
-- 2026-08-06, 380 harvests, finished_date 2024-07-11 → 2026-08-04.
-- In Sep 2026 this_month_td hid the book (as_of is August; 0 finished this month).

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Harvests freeze as_of 2026-08-06 (380 rows). finished_date 2024-07-11 → 2026-08-04. this_month_td in Sep 2026 hid the book (as_of is August; 0 harvests finished this month). Period bus uses finished_date, not as_of_date. Empty measures — freeze, not dual MATCH.'
 where view_key = 'rpt-harvests';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.harvests_freeze_finished_date',
  'Harvests freeze — filter finished_date, not as_of',
  'Metrc',
  'metrc_rpt_harvests',
  'finished_date',
  '{}'::text[],
  '{}'::jsonb,
  array['harvest_name','licence'],
  'one harvest_name per licence as of 2026-08-06',
  true,
  'as_of_date is the freeze (2026-08-06), not the harvest. Do not total wet_lb as certified. Dual MATCH not claimed.',
  array['licence','strain','room','lab_testing']
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
