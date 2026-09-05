-- Applied prod with this hour. Command → Assistant → Staff (Grok inbox).
-- Wires Help (os_help already in nav) by leaving that row enabled.
-- No Metrc/Apex write. No ledger rewrite. Help is not a dated book.

insert into public.nav_registry (
  category, category_order, label, item_order, icon, view_key,
  table_ref, description, enabled, admin_only, subcategory, surface,
  page_kind, date_policy, default_range, range_kind, module, archetype
)
select
  'Command Center', 0, 'Staff', 3, 'bot',
  'os_staff', null,
  'Grok-style staff inbox. Top G is OS Chief of Staff. Buddy on Grok is the ultimate boss. Nothing here writes to Metrc or Apex.',
  true, false, 'Assistant', 'side',
  'custom', 'not_applicable', null, 'snapshot', 'command', 'dashboard'
where not exists (select 1 from public.nav_registry where view_key = 'os_staff');

update public.nav_registry
   set default_range = null,
       date_policy = 'not_applicable',
       range_kind = 'snapshot',
       page_kind = 'custom',
       module = coalesce(module, 'command'),
       updated_at = now()
 where view_key = 'os_help';
