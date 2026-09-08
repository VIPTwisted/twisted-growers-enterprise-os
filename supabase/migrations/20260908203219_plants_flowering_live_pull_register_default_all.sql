-- GROK-WHY: Period bus one page. rpt-plants-flowering is a live Metrc plants pull, not this-month activity.
-- Measured (not certified): 56,557 rows. source_state flowering 4,380 · inactive 52,177.
-- 4,380 is the live canopy. 52,177 already left flower. Do not total 56,557 as plants in the rooms.
-- Empty measures. Dual MATCH not claimed. default_range was NULL so the chip said This Month while every date loaded.
-- Reads v_rpt_plants_flowering. Ledger not rewritten. Never sum waste_qty. destroyed_on not rewritten.
-- leftover_grok 0. room_cycle_days 56. Apex invoice SoR unchanged. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-plants-flowering',
  'default_range=NULL',
  'default_range=all',
  'Period bus one page: Plants Flowering live pull. 56,557 tags ever in flower; 4,380 live (source_state=flowering); 52,177 inactive. NULL default_range left the chip saying This Month while every planted_on loaded. Empty measures. Dual MATCH not claimed.',
  'update nav_registry set default_range = null where view_key = ''rpt-plants-flowering'';',
  'period-bus-plants-flowering-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-plants-flowering-20260908'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Metrc Plants → Flowering live pull. 56,557 tags ever in flower (not certified). Live canopy is source_state=flowering (4,380). 52,177 are inactive. Dual MATCH to a vaulted Flowering grid is the only CERTIFIED. Empty measures. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-plants-flowering';

insert into public.report_registry (
  report_key, title, category, fact_view, date_column,
  measures, measure_contracts, grain_keys, row_grain, enabled, description, dimensions, owner_note
) values (
  'metrc.plants_flowering_live_pull',
  'Plants Flowering (live pull) — filter planted_on, do not total as canopy',
  'Metrc',
  'v_rpt_plants_flowering',
  'planted_on',
  '{}'::text[],
  '{}'::jsonb,
  array['tag'],
  'one Metrc plant tag whose phase matched flower, including inactive history',
  true,
  'Empty measures. Do not total 56,557 as plants in the rooms. Live flowering is source_state=flowering (4,380 measured). Dual MATCH not claimed. Ledger not rewritten. Apex invoice SoR unchanged. Never sum waste_qty. destroyed_on not rewritten. room_cycle_days 56.',
  array['licence','strain','phase','room','source_state'],
  '56,557 is every tag that ever matched phase flower. 4,380 are live (source_state=flowering). 52,177 are inactive. Click a row: plant forensic, not package dossier. CERTIFIED 0 until a vaulted Flowering grid dual-MATCHes.'
)
on conflict (report_key) do update set
  fact_view = excluded.fact_view,
  date_column = excluded.date_column,
  measures = excluded.measures,
  grain_keys = excluded.grain_keys,
  row_grain = excluded.row_grain,
  description = excluded.description,
  dimensions = excluded.dimensions,
  owner_note = excluded.owner_note,
  updated_at = now();
