-- prod stamp 20260904222320. Nav already inserted. Idempotent no-op.
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
