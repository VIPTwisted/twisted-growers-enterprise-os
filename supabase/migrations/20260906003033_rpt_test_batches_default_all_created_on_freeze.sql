-- Applied prod 20260906003033.
-- Period bus one page: rpt-test-batches.
-- Freeze measured (not certified): MC281714 739 created_on 2024-05-15→2026-07-24 as_of 2026-08-06.
-- MP has no test-batch rows this freeze.
-- this_month_td in Sep 2026 hid the freeze (0 rows).
-- Date grain = created_on (complete; test_date is NULL on 17 untested lines).
-- as_of_date is the freeze stamp. Empty measures. Dual MATCH not claimed.
-- Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-test-batches',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Metrc Test Batches is a custody freeze, not a this-month activity feed. this_month_td hid the book (0 rows in Sep 2026). Filter created_on (test_date NULL on 17 untested lines). Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-test-batches'';',
  'period-bus-test-batches-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-test-batches-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Test-batches freeze. MC281714 739 measured rows. created_on 2024-05-15 → 2026-07-24. as_of 2026-08-06. this_month_td hid the book. Period bus uses created_on, not as_of_date (test_date NULL on 17 untested lines). Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-test-batches';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.test_batches_freeze_created_on',
  'Test batches freeze — filter created_on, not as_of',
  'Metrc',
  'metrc_rpt_test_batches',
  'created_on',
  '{}'::text[],
  '{}'::jsonb,
  array['package_tag','test_batch_name','licence','line_no'],
  'one test-batch line as of freeze',
  true,
  'Custody freeze. Filter created_on so 17 untested lines (NULL test_date) stay visible. Empty measures. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['licence','category','lab_testing','test_passed']
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
