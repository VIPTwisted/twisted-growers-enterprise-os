-- GROK-WHY: Owner 8 Sep 2026 GO — port Grok Users / Permissions / Help into live Settings.
-- Top 12 menus untouched. Add Settings → Users. Wire existing permissions + help to Grok chrome.
-- No Metrc/Apex write. No ledger rewrite. No GRANT to anon.

update public.nav_registry
   set item_order = item_order + 1
 where category = 'Settings'
   and subcategory = 'General'
   and item_order >= 2;

insert into public.nav_registry (
  category, category_order, subcategory, label, item_order, view_key,
  page_kind, enabled, description, default_range, range_kind, date_policy,
  module, surface, icon
) values (
  'Settings', 12, 'General', 'Users', 2, 'os_users',
  'custom', true,
  'Who is on this OS. Live app_users. Owner creates. Do not invent staff.',
  'today', 'as_of', 'as_of',
  'settings', 'side', 'users'
)
on conflict (view_key) do update
  set label = excluded.label,
      enabled = true,
      page_kind = 'custom',
      subcategory = 'General',
      item_order = 2,
      module = 'settings',
      surface = 'side',
      description = excluded.description;

insert into public.nav_role_visibility (view_key, role, visible)
select 'os_users', role, visible
  from public.nav_role_visibility
 where view_key = 'permissions'
on conflict (view_key, role) do nothing;

update public.nav_registry
   set description = 'Grok menu-visibility matrix on live nav_role_visibility. Owner/executive save. Hidden is not missing.'
 where view_key = 'permissions';

update public.nav_registry
   set description = 'Pictured Help desk. Same guides as Command → Help. Nothing writes to Metrc or Apex.'
 where view_key = 'help';
