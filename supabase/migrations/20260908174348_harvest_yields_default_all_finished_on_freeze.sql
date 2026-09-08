-- GROK-WHY: Period bus one page. metrc_rpt_yields (Harvest Yields) is a custody freeze of every harvest since day one, not a this-month activity feed.
-- Measured (not certified): 389 rows. finished_on 2024-07-11→2026-08-28. takedown_date 2024-05-15→2026-08-31. as_of live matview.
-- this_month_td in Sep 2026 hid the book (0 rows). Filter finished_on.
-- Empty measures — do not total actual_wet_lbs / actual_packaged_lbs / waste_lbs / projected_lbs. Dual MATCH not claimed.
-- Reads mv_harvest_yields. Ledger not rewritten. Never sum waste_qty. destroyed_on not rewritten.
-- leftover_grok 0. room_cycle_days 56. Apex invoice SoR unchanged. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'metrc_rpt_yields',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Harvest Yields is a custody freeze of every harvest since day one, not a this-month activity feed. this_month_td hid the book (0 of 389 rows in Sep 2026). Filter finished_on. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''metrc_rpt_yields'';',
  'period-bus-harvest-yields-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-harvest-yields-20260908'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Harvest-yields freeze. 389 measured rows. finished_on 2024-07-11 → 2026-08-28. takedown_date 2024-05-15 → 2026-08-31. this_month_td hid the book (0 rows in Sep 2026). Period bus uses finished_on. Empty measures — do not total actual_wet_lbs / actual_packaged_lbs / waste_lbs. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'metrc_rpt_yields';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.harvest_yields_freeze_finished_on',
  'Harvest yields freeze — filter finished_on, not this-month',
  'Metrc',
  'mv_harvest_yields',
  'finished_on',
  '{}'::text[],
  '{}'::jsonb,
  array['harvest_name','license','finished_on'],
  'one harvest yield line as of freeze',
  true,
  'Custody freeze. Empty measures. Do not total actual_wet_lbs / actual_packaged_lbs / waste_lbs / projected_lbs. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged. Never sum waste_qty. destroyed_on not rewritten. room_cycle_days 56.',
  array['license','strain','room','current_stage']
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
