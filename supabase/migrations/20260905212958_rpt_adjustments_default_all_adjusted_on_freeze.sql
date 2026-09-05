-- Applied prod 20260905212958.
-- Period bus one page: rpt-adjustments.
-- Freeze measured (not certified): MC281714 749 adjusted_on 2024-08-15→2026-08-06 as_of 2026-08-06;
-- MP281909 3,665 adjusted_on 2024-03-19→2026-08-06 as_of 2026-08-06.
-- this_month_td in Sep 2026 hid the freeze (0 rows).
-- Mixed UOM g+lb. Empty measures — do not total quantity.
-- Date grain = adjusted_on. as_of_date is the freeze stamp.
-- Ledger not rewritten. Apex invoice SoR unchanged. leftover_grok 0. room_cycle_days 56.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-adjustments',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Metrc Adjustments is a custody freeze, not a this-month activity feed. this_month_td hid the book (0 rows in Sep 2026). Filter adjusted_on. Mixed UOM g+lb — do not total quantity. Dual MATCH not claimed. Ledger not rewritten.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-adjustments'';',
  'period-bus-adjustments-20260905'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-adjustments-20260905'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Adjustments freeze. MC281714 749 + MP281909 3,665 measured rows. adjusted_on 2024-03-19 → 2026-08-06. as_of 2026-08-06. this_month_td hid the book. Period bus uses adjusted_on, not as_of_date. Empty measures — mixed UOM g+lb, do not total quantity. Dual MATCH not claimed. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-adjustments';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions
) values (
  'metrc.adjustments_freeze_adjusted_on',
  'Adjustments freeze — filter adjusted_on, not as_of',
  'Metrc',
  'metrc_rpt_adjustments',
  'adjusted_on',
  '{}'::text[],
  '{}'::jsonb,
  array['package_tag','licence','adjusted_on','line_no'],
  'one adjustment line as of freeze',
  true,
  'Custody freeze. Mixed UOM g+lb. Do not total quantity. Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged.',
  array['licence','item_category','reason','uom']
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
