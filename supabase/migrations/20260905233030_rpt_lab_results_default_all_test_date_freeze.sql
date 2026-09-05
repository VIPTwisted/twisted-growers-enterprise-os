-- Applied prod 20260905233030.
-- Period bus one page: rpt-lab-results.
-- Freeze measured (not certified): MC281714 16,081 analyte lines / 659 tags, test_date 2025-01-15→2026-08-03 as_of 2026-08-03;
-- MP281909 23,450 analyte lines / 357 tags, test_date 2025-01-10→2026-08-06 as_of 2026-08-06.
-- this_month_td in Sep 2026 hid the freeze (0 rows).
-- Date grain = test_date. as_of_date is the freeze stamp.
-- Empty measures — one row is one analyte. Do not total result. Dual MATCH not claimed.
-- Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-lab-results',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Metrc Lab Results is a custody freeze, not a this-month activity feed. this_month_td hid the book (0 rows in Sep 2026). Filter test_date. One row is one analyte. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-lab-results'';',
  'period-bus-lab-results-20260905'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-lab-results-20260905'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Lab-results freeze. MC281714 16,081 + MP281909 23,450 measured analyte lines. test_date 2025-01-10 → 2026-08-06. as_of 2026-08-03/06. this_month_td hid the book. Period bus uses test_date, not as_of_date. Empty measures — do not total result. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-lab-results';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.lab_results_freeze_test_date',
  'Lab results freeze — filter test_date, not as_of',
  'Metrc',
  'metrc_rpt_lab_results',
  'test_date',
  '{}'::text[],
  '{}'::jsonb,
  array['package_tag','test_name','licence','line_no'],
  'one analyte line as of freeze',
  true,
  'Custody freeze. One row is one analyte. Empty measures. Do not total result. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['licence','test_name','overall_passed','category']
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
