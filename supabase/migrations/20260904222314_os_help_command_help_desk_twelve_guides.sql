-- Nav row already live (execute_sql 2026-09-04 22:22Z). Idempotent.
insert into public.nav_registry (
  category, category_order, label, item_order, icon, view_key,
  table_ref, description, enabled, admin_only, subcategory, surface,
  page_kind, date_policy, default_range, range_kind, module, archetype
)
select
  'Command Center', 0, 'Help', 2, 'book',
  'os_help', null,
  'Pictured walkthroughs for every signed-in role. Nothing here writes to Metrc or Apex.',
  true, false, 'Overview', 'side',
  'custom', 'not_applicable', 'today', 'snapshot', 'command', null
where not exists (select 1 from public.nav_registry where view_key = 'os_help');

insert into public.nav_role_visibility (view_key, role, visible)
select 'os_help', v.role, v.visible
from public.nav_role_visibility v
where v.view_key = 'report-catalogue'
  and not exists (
    select 1 from public.nav_role_visibility x
    where x.view_key = 'os_help' and x.role = v.role
  );
