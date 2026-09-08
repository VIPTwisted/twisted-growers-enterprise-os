-- GROK-WHY: Owner GO 8 Sep 2026 — sidebar is 14 cockpits. Top bar Finance/Tax/HR frozen.
-- Reports stays on the top bar as an index. Thin side pages move to surface=deep so they
-- live inside the department cockpit. view_keys unchanged (hashes still work). Omit nothing.
-- Twisted C&M stays a page (ops_cm / dutchie_cult / dutchie_mfg), not a department.
-- Cycle 56. Ledger not rewritten. Metrc write never.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'side-to-deep',
  (select string_agg(view_key, ',' order by view_key)
     from public.nav_registry
    where enabled
      and coalesce(surface, 'side') = 'side'
      and view_key not in (
        'tower','os_staff','dept_dash_command','dept_dash_cfo',
        'dept_dash_cultivation','dept_dash_mfg','dept_dash_inventory',
        'dept_dash_quality','dept_dash_metrc','dept_dash_preroll','dept_dash_settings'
      )),
  'surface=deep for former side peers. 14 cockpits remain side or are pinned in chrome.',
  'Owner GO: leave top bar alone except Reports. Side menu = 14 department cockpits. Thin pages become deep links. Nothing deleted.',
  'update nav_registry set surface = ''side'' where view_key = any (string_to_array((select old_definition from os_change_log where ticket = ''cockpit-side-14-20260908'' limit 1), '',''));',
  'cockpit-side-14-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'cockpit-side-14-20260908'
);

insert into public.nav_registry (
  category, category_order, label, item_order, icon, view_key, description,
  enabled, color, admin_only, surface, subcategory, page_kind, module, archetype,
  date_policy, default_range, range_kind
)
select
  'Finance', 6, 'Finance Dashboard', 0, 'dollar', 'dept_dash_cfo',
  'Finance cockpit. CFO board. Topnav Finance dropdown is unchanged.',
  true, '#2df26a', false, 'side', 'Dashboard', 'report', 'finance', 'dashboard',
  'auto', 'this_year', 'activity'
where not exists (select 1 from public.nav_registry where view_key = 'dept_dash_cfo');

update public.nav_registry
   set surface = 'deep',
       updated_at = now()
 where enabled
   and coalesce(surface, 'side') = 'side'
   and view_key not in (
     'tower','os_staff','dept_dash_command','dept_dash_cfo',
     'dept_dash_cultivation','dept_dash_mfg','dept_dash_inventory',
     'dept_dash_quality','dept_dash_metrc','dept_dash_preroll','dept_dash_settings'
   );
