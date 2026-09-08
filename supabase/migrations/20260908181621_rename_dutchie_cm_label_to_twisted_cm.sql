-- GROK-WHY: Owner 8 Sep 2026 — Do not call it Dutchie. Call it Twisted C&M.
-- Visible labels only. view_key ops_cm / dutchie_cult / dutchie_mfg unchanged so routes do not break.
-- No new department. Top menus untouched. Cycle 56. Ledger not rewritten. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'ops_cm',
  'label=Dutchie C&M',
  'label=Twisted C&M',
  'Owner: do not call it Dutchie. Call it Twisted C&M. Labels only. view_keys unchanged.',
  'update nav_registry set label = ''Dutchie C&M'' where view_key in (''ops_cm'',''dutchie_cult'',''dutchie_mfg'');',
  'rename-twisted-cm-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'rename-twisted-cm-20260908'
);

update public.nav_registry
   set label = 'Twisted C&M',
       description = 'Twisted C&M. Cultivation & Manufacturing overlay. Metrc custody SoR. Apex invoice SoR. Phase 1 read. Grok chrome.',
       updated_at = now()
 where view_key = 'ops_cm';

update public.nav_registry
   set label = 'Twisted C&M',
       description = 'Same Twisted C&M overlay as Command Center. Metrc custody SoR. Read only.',
       updated_at = now()
 where view_key in ('dutchie_cult', 'dutchie_mfg');
