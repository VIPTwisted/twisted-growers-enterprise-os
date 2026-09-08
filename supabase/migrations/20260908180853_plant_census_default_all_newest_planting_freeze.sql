-- GROK-WHY: Period bus one page. metrc_rpt_plants (Plant Census) is a live as-of of rooms now, not a this-month activity feed.
-- Measured (not certified): 5 room-phase rows. 4,410 plants (F1 1140, F3 1140, F2 1050, F4 1050, Mother 30 veg). oldest_planting 2026-06-17 → newest 2026-09-03.
-- this_month_td on oldest_planting hid the book (0 of 5). On newest_planting hid 4 of 5 (only F1 has a Sep plant).
-- Empty measures — do not total plants as certified. Dual MATCH not claimed.
-- Reads v_metrc_plant_census (live Metrc plants vegetative/flowering/onhold). Ledger not rewritten. Never sum waste_qty. destroyed_on not rewritten.
-- leftover_grok 0. room_cycle_days 56. Apex invoice SoR unchanged. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'metrc_rpt_plants',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Plant Census is a live as-of of rooms now, not a this-month activity feed. this_month_td hid 4 of 5 rooms (only F1 has a Sep planting). Filter newest_planting. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''metrc_rpt_plants'';',
  'period-bus-plant-census-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-plant-census-20260908'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Plant-census freeze. Live as-of. 5 room-phase rows. 4,410 plants (F1/F3 1140, F2/F4 1050, Mother 30 veg). oldest_planting 2026-06-17 → newest_planting 2026-09-03. this_month_td hid 4 of 5 rooms. Period bus uses newest_planting. Empty measures — do not total plants. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'metrc_rpt_plants';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.plant_census_freeze_newest_planting',
  'Plant census freeze — filter newest_planting, not this-month',
  'Metrc',
  'v_metrc_plant_census',
  'newest_planting',
  '{}'::text[],
  '{}'::jsonb,
  array['license','room','phase'],
  'one room-phase as of live Metrc plants',
  true,
  'Live as-of census. Empty measures. Do not total plants. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged. Never sum waste_qty. destroyed_on not rewritten. room_cycle_days 56.',
  array['license','room','phase']
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
