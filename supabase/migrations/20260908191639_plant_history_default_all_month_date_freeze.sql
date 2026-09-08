-- GROK-WHY: Period bus one page. plant_history (Planting History) is a month grain of plantings, not a this-month activity feed.
-- Measured (not certified): 34 month rows. month_date 2023-12-01 → 2026-09-01. this_month_td on month_date hid 33 of 34 (only Sep 2026 visible).
-- Empty measures — do not total plants_planted / still_alive. Dual MATCH not claimed.
-- Reads v_plant_history. Ledger not rewritten. Never sum waste_qty. destroyed_on not rewritten.
-- leftover_grok 0. room_cycle_days 56. Apex invoice SoR unchanged. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'plant_history',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Planting History is a month grain since day one. this_month_td hid 33 of 34 months. Filter month_date. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''plant_history'';',
  'period-bus-plant-history-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-plant-history-20260908'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Planting-history freeze. Month grain. 34 month rows. month_date 2023-12-01 → 2026-09-01. this_month_td hid 33 of 34. Period bus uses month_date. Empty measures — do not total plants. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'plant_history';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.plant_history_freeze_month_date',
  'Planting history freeze — filter month_date, not this-month',
  'Metrc',
  'v_plant_history',
  'month_date',
  '{}'::text[],
  '{}'::jsonb,
  array['license','month_date'],
  'one licence-month of plantings as recorded in v_plant_history',
  true,
  'Month grain. Empty measures. Do not total plants_planted. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged. Never sum waste_qty. destroyed_on not rewritten. room_cycle_days 56.',
  array['license','month']
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
