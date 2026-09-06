-- Applied prod 20260906013537.
-- Period bus one page: lab_fail_rate_by_origin.
-- SNAPSHOT rollup of v_lab_results by supplier/origin, not a this-month activity feed.
-- this_month_td on most_recent_result_on would hide suppliers whose last result is older.
-- Measured (not certified): 50 supplier-origin rows. Bought-in 34 / Grown-by-us 16.
-- as-of = live query time. Empty measures — do not total fail_rate_pct or pounds.
-- Dual MATCH not claimed. Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'lab_fail_rate_by_origin',
  'default_range=this_month_td range_kind=activity',
  'default_range=all range_kind=snapshot',
  'Period bus one page: lab_fail_rate_by_origin is a snapshot rollup of lab results by supplier, not a this-month activity feed. this_month_td on most_recent_result_on hid older suppliers. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'', range_kind = ''activity'' where view_key = ''lab_fail_rate_by_origin'';',
  'period-bus-lab-fail-rate-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-lab-fail-rate-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'snapshot',
       date_policy = 'as_of',
       description = 'Lab fail-rate snapshot. 50 supplier-origin rows measured as of live lab results. this_month_td hid older suppliers. Snapshot, not activity. Empty measures — do not total fail_rate_pct or pounds. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'lab_fail_rate_by_origin';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.lab_fail_rate_by_origin_snapshot',
  'Lab fail rate by origin — live snapshot, not this-month',
  'Metrc',
  'v_lab_fail_rate_by_origin',
  null,
  '{}'::text[],
  '{}'::jsonb,
  array['supplier','origin'],
  'one supplier-origin of lab results',
  true,
  'Snapshot rollup of v_lab_results. as-of is live query time. Empty measures. Do not total fail_rate_pct or pounds. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['origin','why_no_rate']
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
