-- Applied prod 20260906003611.
-- Period bus one page: plant_loss_by_batch.
-- Freeze measured (not certified): destroyed 966 + plant waste 4,407 (MC281714).
-- happened_on 2024-01-15→2026-08-14. this_month_td in Sep 2026 hid the freeze (0 rows).
-- Date grain = happened_on (destroyed_date_from_source / waste_date).
-- View already reads v_plants_destroyed_truth + v_waste_qty_truth. Do not rewrite.
-- Empty measures — never sum waste_qty / weight_qty. Dual MATCH not claimed.
-- Ledger not rewritten. destroyed_on not rewritten. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'plant_loss_by_batch',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: plant_loss_by_batch is a custody freeze (destroyed + waste by plant batch), not a this-month activity feed. this_month_td hid the book (0 rows in Sep 2026). Filter happened_on. Never sum waste_qty. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''plant_loss_by_batch'';',
  'period-bus-plant-loss-20260906'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-plant-loss-20260906'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Plant loss by batch freeze. MC281714 destroyed 966 + plant waste 4,407 measured rows. happened_on 2024-01-15 → 2026-08-14. this_month_td hid the book. Filter happened_on. Reads v_plants_destroyed_truth + v_waste_qty_truth. Empty measures — never sum waste_qty. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'plant_loss_by_batch';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.plant_loss_by_batch_freeze_happened_on',
  'Plant loss by batch freeze — filter happened_on',
  'Metrc',
  'v_plant_loss_by_batch',
  'happened_on',
  '{}'::text[],
  '{}'::jsonb,
  array['kind','plant_batch','licence','happened_on'],
  'one destroyed-batch-day or one waste event, by plant batch',
  true,
  'Custody freeze. Never sum waste_qty/weight_qty (mixed UOM). Use v_waste_qty_truth waste_g/waste_lb only as classified columns — UNCERTIFIED until dual MATCH. destroyed_on not rewritten. Apex invoice SoR unchanged.',
  array['licence','kind','qty_class']
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
