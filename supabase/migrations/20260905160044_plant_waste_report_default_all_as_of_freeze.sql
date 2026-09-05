-- Applied prod 20260905160044. Period bus, one page.
-- Metrc Plant Waste is v_waste_qty_truth (mixed UOM). this_month_td hid the close.
-- Totals still refused. Ledger not rewritten.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'nav',
  'nav_registry',
  'rpt-plant-waste',
  'default_range=this_month_td',
  'default_range=all',
  'Period bus one page: Metrc Plant Waste is wired to v_waste_qty_truth (mixed UOM freeze), not a this-month activity feed. this_month_td hid the close. Snapshot/as-of pages declare all + as-of chip. Ledger not rewritten. Totals still refused.',
  'update nav_registry set default_range = ''this_month_td'' where view_key = ''rpt-plant-waste'';',
  'period-bus-waste-20260905'
where not exists (
  select 1 from public.os_change_log where ticket = 'period-bus-waste-20260905'
);

update public.nav_registry
   set default_range = 'all',
       updated_at = now()
 where view_key = 'rpt-plant-waste'
   and default_range is distinct from 'all';
