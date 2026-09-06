-- Applied prod 20260906023551.
-- Period bus one page: forensic-audits (source table).
-- Date grain = run_at. this_month_td in Sep 2026 hid the book (all 5 runs are Aug 2026).
-- Measured (not certified): 78 metric-rows / 5 runs, run_at 2026-08-05→2026-08-31.
-- Empty measures — do not total value. Dual MATCH not claimed.
-- Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'forensic-audits',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: forensic-audits is the source table of every audit metric line, not a this-month activity feed. this_month_td hid all 5 Aug 2026 runs. Filter run_at. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''forensic-audits'';',
  'period-bus-forensic-audits-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-forensic-audits-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Forensic-audits source. 78 metric-rows / 5 runs measured. run_at 2026-08-05 → 2026-08-31. this_month_td hid the book. Filter run_at. Empty measures — do not total value. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'forensic-audits';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'ops.forensic_audits_run_at',
  'Forensic audits source — filter run_at, not this-month',
  'Command',
  'forensic_audits',
  'run_at',
  '{}'::text[],
  '{}'::jsonb,
  array['id'],
  'one metric line on one forensic audit run',
  true,
  'Source table. Filter run_at. Empty measures. Do not total value. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['run_type','section','verdict','responsible']
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
