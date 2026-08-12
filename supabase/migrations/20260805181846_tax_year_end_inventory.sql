-- Point-in-time inventory reconstruction for tax reporting.
-- Honest note: the Metrc mirror holds current state plus packaged and finished dates,
-- so a historical position is reconstructed, not a stored snapshot. Confidence is stated per row.
create or replace function tg_inventory_as_of(p_date date)
returns table(
  license text, category text, item text, packages numeric, quantity numeric, uom text,
  cost_per_unit numeric, value_at_cost numeric, basis text, confidence text
) as $$
declare cpp numeric;
begin
  select cost_per_pound into cpp from cost_model where scope='cultivation' order by effective_from desc limit 1;
  return query
  select p.license,
    coalesce(nullif(p.raw->>'ProductCategoryName',''),'Uncategorised') as category,
    coalesce(p.item_name,'(unnamed)') as item,
    count(*)::numeric as packages,
    round(sum(coalesce(p.quantity,0))::numeric,1) as quantity,
    coalesce(max(p.uom),'ea') as uom,
    case when coalesce(max(p.uom),'') in ('g','Grams') then round((coalesce(cpp,0)/453.592)::numeric,4) end as cost_per_unit,
    case when coalesce(max(p.uom),'') in ('g','Grams')
      then round((sum(coalesce(p.quantity,0)) / 453.592 * coalesce(cpp,0))::numeric,2) end as value_at_cost,
    'Cost to grow at ' || coalesce(cpp,0)::text || ' dollars per pound' as basis,
    case
      when p.raw->>'ArchivedDate' is not null then 'Reconstructed - package archived after the reporting date'
      when p.source_state = 'inactive' then 'Reconstructed - package later closed; quantity is the last known figure'
      else 'Current quantity carried back - Metrc does not store a historical snapshot' end as confidence
  from metrc_packages p
  where p.packaged_on is not null
    and p.packaged_on <= p_date
    and (p.raw->>'ArchivedDate' is null or (p.raw->>'ArchivedDate')::date > p_date)
  group by p.license, coalesce(nullif(p.raw->>'ProductCategoryName',''),'Uncategorised'),
    coalesce(p.item_name,'(unnamed)'),
    case when p.raw->>'ArchivedDate' is not null then 'Reconstructed - package archived after the reporting date'
         when p.source_state = 'inactive' then 'Reconstructed - package later closed; quantity is the last known figure'
         else 'Current quantity carried back - Metrc does not store a historical snapshot' end
  order by value_at_cost desc nulls last;
end $$ language plpgsql stable;

-- 2025 year end, ready to open
create or replace view v_year_end_2025 as select * from tg_inventory_as_of('2025-12-31');

create or replace view v_year_end_2025_summary as
select license, category,
  count(*)::numeric as line_items,
  sum(packages) as packages,
  round(sum(quantity)::numeric,1) as quantity,
  round(sum(coalesce(value_at_cost,0))::numeric,2) as value_at_cost
from v_year_end_2025
group by rollup (license, category)
order by license nulls last, value_at_cost desc nulls last;

-- Current inventory valuation, any time
create or replace view v_inventory_valuation as
select * from tg_inventory_as_of(current_date);

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Sales & Cash', (select category_order from nav_registry where category='Sales & Cash' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Tax: Year End Inventory 2025', 20, 'dollar', 'year_end_2025', 'v_year_end_2025', 'The 2025 year end inventory position for tax purposes: every item held at 31 December 2025 with quantity, cost basis and value at cost, and a confidence note on each line explaining how the historical position was established.'),
  ('Tax: Year End Summary 2025', 21, 'scale', 'year_end_2025_summary', 'v_year_end_2025_summary', 'The 2025 year end totals by licence and product category with subtotals and a grand total at cost - the figure a tax preparer needs.'),
  ('Tax: Current Inventory Valuation', 22, 'gauge', 'inventory_valuation', 'v_inventory_valuation', 'What the inventory on hand is worth today at cost, by item, using the cost model.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_role_visibility (view_key, role, visible)
select vk, r.role, r.role in ('owner','executive')
from (values ('year_end_2025'),('year_end_2025_summary'),('inventory_valuation'),('cost_model')) k(vk)
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do update set visible = excluded.visible;
select license, category, line_items, packages, quantity, value_at_cost from v_year_end_2025_summary where category is null or license is null limit 8;;
