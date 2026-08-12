-- CCC custody proof: can we account for the location of every tracked item, right now?
create or replace view v_custody_compliance as
select
  category,
  count(*)::numeric as items,
  count(*) filter (where location is null or location in ('(no location)','(no room recorded)','(manifested)'))::numeric as items_without_location,
  count(*) filter (where identifier is null or identifier = '')::numeric as items_without_identifier,
  count(*) filter (where since_date is null)::numeric as items_without_date,
  round(100.0 * count(*) filter (where location is not null and location not in ('(no location)','(no room recorded)'))
    / nullif(count(*),0), 1) as location_known_pct,
  round(sum(quantity) filter (where location is null or location in ('(no location)','(no room recorded)'))::numeric, 1) as quantity_unlocated,
  case when count(*) filter (where location is null or location in ('(no location)','(no room recorded)')) = 0
       then 'Every item accounted for'
       else count(*) filter (where location is null or location in ('(no location)','(no room recorded)'))
            || ' item(s) have no recorded location - resolve in Metrc' end as compliance_status
from v_inventory_locator
group by category
union all
select 'ALL TRACKED INVENTORY',
  count(*)::numeric,
  count(*) filter (where location is null or location in ('(no location)','(no room recorded)','(manifested)'))::numeric,
  count(*) filter (where identifier is null or identifier = '')::numeric,
  count(*) filter (where since_date is null)::numeric,
  round(100.0 * count(*) filter (where location is not null and location not in ('(no location)','(no room recorded)'))
    / nullif(count(*),0), 1),
  round(sum(quantity) filter (where location is null or location in ('(no location)','(no room recorded)'))::numeric, 1),
  case when count(*) filter (where location is null or location in ('(no location)','(no room recorded)')) = 0
       then 'FULL CUSTODY - every tracked item has a known location'
       else 'CUSTODY GAP - ' || count(*) filter (where location is null or location in ('(no location)','(no room recorded)')) || ' item(s) unlocated' end
from v_inventory_locator;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Inventory', (select category_order from nav_registry where category='Inventory' limit 1),
  'Custody & Compliance Check', 3, 'shield', 'custody_compliance', 'v_custody_compliance',
  'The Cannabis Control Commission custody proof: for every category of tracked inventory, how many items have a known location, how many do not, and the quantity at risk. This is the report that proves seed to sale custody.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'custody_compliance');
select category, items, items_without_location, location_known_pct, compliance_status from v_custody_compliance order by items desc;;
