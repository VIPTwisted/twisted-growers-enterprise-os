-- GROK-WHY: Period bus one page. rpt-plants-vegetative default_range was NULL.
-- Measured (not certified): 2,289 tags ever in veg. source_state vegetative 30 · inactive 2,259.
-- 30 is the live veg canopy. Do not total 2,289 as plants standing in veg.
-- Empty measures. Dual MATCH not claimed. Ledger not rewritten. Never sum waste_qty. destroyed_on not rewritten.
-- leftover_grok 0. room_cycle_days 56. Apex invoice SoR unchanged. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-plants-vegetative',
  'default_range=NULL',
  'default_range=all',
  'Period bus one page: Plants Vegetative. 2,289 tags ever in veg; 30 live (source_state=vegetative); 2,259 inactive. NULL default_range hid or mislabelled the book. Empty measures. Dual MATCH not claimed.',
  'update nav_registry set default_range = null where view_key = ''rpt-plants-vegetative'';',
  'period-bus-plants-vegetative-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-plants-vegetative-20260908'
);

update public.nav_registry
   set default_range = 'all',
       range_kind = 'activity',
       date_policy = 'auto',
       description = 'Metrc Plants → Vegetative. Live canopy is source_state=vegetative (30). 2,259 are inactive. Dual MATCH to a vaulted Vegetative grid is the only CERTIFIED. Empty measures. Ledger not rewritten.',
       updated_at = now()
 where view_key = 'rpt-plants-vegetative';
