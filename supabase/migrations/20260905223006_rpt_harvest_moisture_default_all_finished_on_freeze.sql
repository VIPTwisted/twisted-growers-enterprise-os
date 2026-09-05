-- Applied prod 20260905223006.
-- Period bus one page: rpt-harvest-moisture.
-- Freeze measured (not certified): MC281714 350 finished_on 2024-07-11→2026-08-04 as_of 2026-08-04.
-- MP has no harvest-moisture rows this freeze.
-- this_month_td in Sep 2026 hid the freeze (0 rows).
-- Date grain = finished_on. as_of_date is the freeze stamp.
-- Empty measures — do not total wet_lb/waste_lb/packaged_lb. Dual MATCH not claimed.
-- 258 of 350 measured moisture_pct outside 70–77 owner band — not certified, not a write.
-- Ledger not rewritten. room_cycle_days 56. leftover_grok 0.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-harvest-moisture',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Metrc Harvest Moisture is a custody freeze, not a this-month activity feed. this_month_td hid the book (0 rows in Sep 2026). Filter finished_on. Empty measures. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-harvest-moisture'';',
  'period-bus-harvest-moisture-20260905'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-harvest-moisture-20260905'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Harvest-moisture freeze. MC281714 350 measured rows. finished_on 2024-07-11 → 2026-08-04. as_of 2026-08-04. this_month_td hid the book. Period bus uses finished_on, not as_of_date. Empty measures — do not total wet_lb. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-harvest-moisture';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.harvest_moisture_freeze_finished_on',
  'Harvest moisture freeze — filter finished_on, not as_of',
  'Metrc',
  'metrc_rpt_harvest_moisture',
  'finished_on',
  '{}'::text[],
  '{}'::jsonb,
  array['harvest_batch','licence','finished_on'],
  'one harvest moisture line as of freeze',
  true,
  'Custody freeze. Empty measures. Do not total wet_lb/waste_lb/packaged_lb. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged. Owner moisture band 70–77 is not changed from this page.',
  array['licence','strain','room','lab_testing']
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
