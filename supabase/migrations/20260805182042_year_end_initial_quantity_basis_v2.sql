drop view if exists v_year_end_2025_summary;
drop view if exists v_year_end_2025;
drop view if exists v_inventory_valuation;
drop function if exists tg_inventory_as_of(date);
create function tg_inventory_as_of(p_date date)
returns table(
  license text, category text, item text, packages numeric, quantity_estimate numeric, uom text,
  cost_per_unit numeric, value_at_cost numeric, basis text, confidence text
) as $$
declare cpp numeric;
begin
  select cost_per_pound into cpp from cost_model where scope='cultivation' order by effective_from desc limit 1;
  return query
  select p.license,
    coalesce(nullif(p.raw->>'ProductCategoryName',''),'Uncategorised'),
    coalesce(p.item_name,'(unnamed)'),
    count(*)::numeric,
    round(sum(coalesce(nullif((p.raw->>'InitialQuantity')::numeric,0), p.quantity, 0))::numeric,1),
    coalesce(max(p.uom),'ea'),
    case when coalesce(max(p.uom),'') in ('g','Grams') then round((coalesce(cpp,0)/453.592)::numeric,4) end,
    case when coalesce(max(p.uom),'') in ('g','Grams')
      then round((sum(coalesce(nullif((p.raw->>'InitialQuantity')::numeric,0), p.quantity, 0)) / 453.592 * coalesce(cpp,0))::numeric,2) end,
    'Quantity the package was created with, valued at ' || coalesce(cpp,0)::text || ' dollars per pound to grow',
    'ESTIMATE - Metrc does not expose a historical snapshot here. For a filed return, export the Inventory Point-in-Time report from the Metrc Reports Control Panel for this date and import it on the Report Import page; that is the authoritative figure.'
  from metrc_packages p
  where p.packaged_on is not null and p.packaged_on <= p_date
    and (p.raw->>'ArchivedDate' is null or (p.raw->>'ArchivedDate')::date > p_date)
  group by p.license, coalesce(nullif(p.raw->>'ProductCategoryName',''),'Uncategorised'), coalesce(p.item_name,'(unnamed)')
  order by 8 desc nulls last;
end $$ language plpgsql stable;
create view v_year_end_2025 as select * from tg_inventory_as_of('2025-12-31');
create view v_inventory_valuation as select * from tg_inventory_as_of(current_date);
create view v_year_end_2025_summary as
select license, category, count(*)::numeric as line_items, sum(packages) as packages,
  round(sum(quantity_estimate)::numeric,1) as quantity_estimate,
  round(sum(coalesce(value_at_cost,0))::numeric,2) as value_at_cost
from v_year_end_2025 group by rollup (license, category)
order by license nulls last, value_at_cost desc nulls last;
insert into actions_register (title, priority, status, source, needs_owner, note, what_to_do, why_it_matters, how_to_execute, recommendation) values
('2025 year end inventory - authoritative figure needed from Metrc', 'P0', 'open', 'owner_directive', true,
 'The operating system can estimate the 2025 year end position but cannot produce the filed figure: the Metrc interface in use returns current package state, not a historical snapshot.',
 'Export the Inventory Point-in-Time report from the Metrc Reports Control Panel dated 31 December 2025 for both licences and import both files on the Report Import page.',
 'A tax filing needs the authoritative state record, not an estimate. Metrc produces exactly this report and the operating system will then hold it permanently and value it against the cost model.',
 'In Metrc: Reports, Inventory Point-in-Time, set the date to 12/31/2025, export CSV - once for MC281714 and once for MP281909. Then Metrc, Report Import, choose the licence, pick Inventory Point-in-Time, drop the file.',
 'Do this now while the year end is under review, and export it every 31 December going forward.');
select coalesce(license,'ALL LICENSES') lic, coalesce(category,'TOTAL') cat, line_items, packages, quantity_estimate, value_at_cost
from v_year_end_2025_summary where category is null or license is null;;
