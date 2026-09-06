-- Applied prod 20260906013040.
-- Period bus one page: failed_testing_by_origin.
-- SNAPSHOT of currently TestFailed stock (v_stock_on_hand), not a dated freeze.
-- this_month_td as activity hid the live book. No date column on the view.
-- Measured (not certified): 7 origin-rows, 18 packages. as-of = live query time.
-- Empty measures — do not total pounds or value_at_our_cost (modelled via conversion_factors).
-- Dual MATCH not claimed. Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'failed_testing_by_origin',
  'default_range=this_month_td range_kind=activity',
  'default_range=all range_kind=snapshot',
  'Period bus one page: failed_testing_by_origin is a snapshot of currently TestFailed stock, not a this-month activity feed. No date column. this_month_td hid the live book. Empty measures — do not total pounds or value_at_our_cost. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'', range_kind = ''activity'' where view_key = ''failed_testing_by_origin'';',
  'period-bus-failed-testing-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-failed-testing-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'snapshot',
       date_policy = 'as_of',
       description = 'Failed-testing snapshot. 7 origin-rows / 18 packages measured as of live stock. this_month_td hid the book (no date column). Snapshot, not activity. Empty measures — do not total pounds or value_at_our_cost. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'failed_testing_by_origin';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.failed_testing_by_origin_snapshot',
  'Failed testing by origin — live snapshot, not this-month',
  'Metrc',
  'v_failed_testing_by_origin',
  null,
  '{}'::text[],
  '{}'::jsonb,
  array['origin','origin_license','location'],
  'one origin-location of currently TestFailed stock',
  true,
  'Snapshot of v_stock_on_hand where lab_state=TestFailed. No date column. as-of is live query time. Empty measures. Do not total pounds or value_at_our_cost. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['origin','whose_problem','bought_as']
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
