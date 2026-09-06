-- Applied prod 20260906023008.
-- Period bus one page: forensic_audit_history.
-- Permanent record of audit runs. Date grain = audit_date (run_at::date).
-- this_month_td in Sep 2026 hid the book (all 5 runs are Aug 2026).
-- Measured (not certified): 5 run-days, audit_date 2026-08-05→2026-08-31.
-- Empty measures — do not total dollars_identified. Dual MATCH not claimed.
-- Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'forensic_audit_history',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: forensic_audit_history is the permanent record of audit runs, not a this-month activity feed. this_month_td hid all 5 Aug 2026 runs. Filter audit_date. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''forensic_audit_history'';',
  'period-bus-forensic-audit-history-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-forensic-audit-history-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Forensic-audit history. 5 run-days measured. audit_date 2026-08-05 → 2026-08-31. this_month_td hid the book. Filter audit_date. Empty measures — do not total dollars_identified. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'forensic_audit_history';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'ops.forensic_audit_history_audit_date',
  'Forensic audit history — filter audit_date, not this-month',
  'Command',
  'v_forensic_audit_history',
  'audit_date',
  '{}'::text[],
  '{}'::jsonb,
  array['audit_date','run_type'],
  'one forensic audit run-day',
  true,
  'Permanent record. Filter audit_date. Empty measures. Do not total dollars_identified. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['run_type']
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
