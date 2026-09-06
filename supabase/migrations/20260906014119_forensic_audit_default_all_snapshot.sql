-- Applied prod 20260906014119.
-- Period bus one page: forensic_audit.
-- SNAPSHOT of the latest forensic_audits run (v_forensic_audit_latest), not this-month activity.
-- Latest run_at 2026-08-31 06:00Z. this_month_td in Sep 2026 hid the latest audit.
-- Measured (not certified): 16 metrics, 2 FAIL. as-of = latest run_at.
-- Empty measures — do not total value. Dual MATCH not claimed.
-- Ledger not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'forensic_audit',
  'default_range=this_month_td range_kind=activity',
  'default_range=all range_kind=snapshot',
  'Period bus one page: forensic_audit is the latest audit snapshot, not a this-month activity feed. this_month_td hid the 31 Aug 2026 run. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'', range_kind = ''activity'' where view_key = ''forensic_audit'';',
  'period-bus-forensic-audit-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-forensic-audit-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'snapshot',
       date_policy = 'as_of',
       description = 'Forensic-audit snapshot. 16 metrics measured as of latest run 2026-08-31 06:00Z (2 FAIL). this_month_td hid the latest run. Snapshot, not activity. Empty measures — do not total value. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'forensic_audit';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'ops.forensic_audit_latest_snapshot',
  'Forensic audit latest — snapshot, not this-month',
  'Command',
  'v_forensic_audit_latest',
  null,
  '{}'::text[],
  '{}'::jsonb,
  array['section','metric'],
  'one metric on the latest forensic audit run',
  true,
  'Snapshot of latest forensic_audits run. as-of is run_at. Empty measures. Do not total value. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['section','verdict','responsible']
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
