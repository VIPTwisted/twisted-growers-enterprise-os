-- GROK-WHY: Owner 8 Sep 2026 — Dutchie was live but invisible.
-- ops_cm / ops_spine sat in category 'Command', which is not a top menu.
-- Rail filters on Command Center / Cultivation / Manufacturing, so the page never appeared.
-- Move them onto real menus. Add Cultivation + Manufacturing aliases. Label Dutchie C&M.
-- Top 12 menus untouched. No Metrc/Apex write. No ledger rewrite. No GRANT to anon.
-- Cycle 56 locked. CERTIFIED not implied.

update public.nav_registry
   set category = 'Command Center',
       category_order = 0,
       subcategory = 'Overview',
       label = 'Dutchie C&M',
       item_order = 0,
       page_kind = 'custom',
       module = 'command',
       surface = 'side',
       icon = 'box',
       description = 'Cultivation & Manufacturing overlay. Metrc custody SoR. Apex invoice SoR. Phase 1 read. Grok chrome.'
 where view_key = 'ops_cm';

update public.nav_registry
   set category = 'Command Center',
       category_order = 0,
       subcategory = 'Overview',
       label = 'Harvest spine',
       item_order = 0,
       page_kind = 'custom',
       module = 'command',
       surface = 'side',
       description = 'Harvest close / allocation spine. Metrc write never. Cycle 56 locked.'
 where view_key = 'ops_spine';

update public.nav_registry
   set label = 'Bots'
 where view_key = 'os_staff'
   and label = 'Staff';

insert into public.nav_registry (
  category, category_order, subcategory, label, item_order, view_key,
  page_kind, enabled, description, default_range, range_kind, date_policy,
  module, surface, icon
) values
(
  'Cultivation', 4, 'Dashboard', 'Dutchie C&M', -1, 'dutchie_cult',
  'custom', true,
  'Same Dutchie overlay as Command Center. Metrc custody SoR. Read only.',
  'today', 'snapshot', 'as_of',
  'cultivation', 'side', 'box'
),
(
  'Manufacturing', 3, 'Dashboard', 'Dutchie C&M', -1, 'dutchie_mfg',
  'custom', true,
  'Same Dutchie overlay as Command Center. Metrc custody SoR. Read only.',
  'today', 'snapshot', 'as_of',
  'manufacturing', 'side', 'box'
)
on conflict (view_key) do update
  set label = excluded.label,
      enabled = true,
      category = excluded.category,
      subcategory = excluded.subcategory,
      item_order = excluded.item_order,
      page_kind = 'custom',
      module = excluded.module,
      surface = 'side',
      description = excluded.description;

insert into public.nav_role_visibility (view_key, role, visible)
select v.view_key, r.role, r.visible
  from (values ('dutchie_cult'), ('dutchie_mfg'), ('ops_cm'), ('ops_spine')) as v(view_key)
  cross join (
    select role, visible from public.nav_role_visibility where view_key = 'permissions'
  ) r
on conflict (view_key, role) do nothing;
