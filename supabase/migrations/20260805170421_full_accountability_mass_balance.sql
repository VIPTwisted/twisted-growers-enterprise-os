-- FULL ACCOUNTABILITY: everything grown, everything made, everything sold,
-- everything lost - and whether it balances.
create or replace view v_full_accountability as
with harvested as (
  select to_char(harvest_start,'YYYY-MM') as month, (date_trunc('month',harvest_start))::date as month_date,
    license,
    sum(coalesce((raw->>'TotalWetWeight')::numeric,0)) as wet_g,
    sum(coalesce((raw->>'TotalWasteWeight')::numeric,0)) as waste_g,
    sum(coalesce((raw->>'TotalPackagedWeight')::numeric,0)) as packaged_g,
    sum(coalesce((raw->>'PlantCount')::numeric,0)) as plants,
    count(*) as harvests
  from metrc_harvests where harvest_start is not null group by 1,2,3
),
made as (
  select to_char(packaged_on,'YYYY-MM') as month, license,
    count(*) as packages_made,
    count(*) filter (where coalesce(raw->>'ProductCategoryName','') ilike '%flower%') as flower_pkgs,
    count(*) filter (where coalesce(raw->>'ProductCategoryName','') ilike '%concentrate%'
                        or coalesce(item_name,'') ilike '%rosin%' or coalesce(item_name,'') ilike '%hash%'
                        or coalesce(item_name,'') ilike '%distillate%' or coalesce(item_name,'') ilike '%crude%') as concentrate_pkgs,
    count(*) filter (where coalesce(raw->>'ProductCategoryName','') ilike '%vape%'
                        or coalesce(item_name,'') ilike '%cart%' or coalesce(item_name,'') ilike '%vape%') as vape_pkgs,
    count(*) filter (where coalesce(raw->>'ProductCategoryName','') ilike '%pre-roll%'
                        or coalesce(raw->>'ProductCategoryName','') ilike '%preroll%'
                        or coalesce(item_name,'') ilike '%preroll%' or coalesce(item_name,'') ilike '%pre-roll%') as preroll_pkgs,
    sum(coalesce((raw->>'InitialQuantity')::numeric,0)) as produced_qty,
    sum(coalesce(quantity,0)) filter (where source_state in ('active','onhold')) as still_on_hand,
    sum(coalesce(quantity,0)) filter (where source_state = 'intransit') as in_transit_qty,
    sum(coalesce((raw->>'InitialQuantity')::numeric,0)) filter (where source_state = 'inactive') as closed_or_sold_qty,
    sum(coalesce(quantity,0)) filter (where lab_testing_state = 'TestFailed') as failed_qty,
    sum(greatest(coalesce((raw->>'InitialQuantity')::numeric,0) - coalesce(quantity,0), 0))
      filter (where source_state in ('active','onhold')) as unexplained_reduction
  from metrc_packages where packaged_on is not null group by 1,2
),
sold as (
  select to_char(created_on,'YYYY-MM') as month, license,
    count(*) as manifests_out,
    sum(coalesce((raw->>'PackageCount')::numeric,0)) as packages_shipped,
    count(*) filter (where raw->>'ReceivedDateTime' is null) as manifests_unconfirmed
  from metrc_transfers where direction='outgoing' and created_on is not null group by 1,2
)
select
  coalesce(h.month, m.month, s.month) as month,
  coalesce(h.license, m.license, s.license) as license,
  h.harvests, h.plants as plants_harvested,
  round((h.wet_g/453.592)::numeric,1) as harvested_wet_lbs,
  round((h.waste_g/453.592)::numeric,1) as waste_lbs,
  case when h.wet_g > 0 then round((100.0*h.waste_g/h.wet_g)::numeric,1) end as waste_pct,
  round((h.packaged_g/453.592)::numeric,1) as packaged_from_harvest_lbs,
  m.packages_made, m.flower_pkgs as flower, m.concentrate_pkgs as concentrates,
  m.vape_pkgs as vapes, m.preroll_pkgs as prerolls,
  round(m.produced_qty::numeric,1) as produced_qty,
  round(m.still_on_hand::numeric,1) as in_stock_qty,
  round(m.in_transit_qty::numeric,1) as in_transit_qty,
  round(m.closed_or_sold_qty::numeric,1) as sold_or_closed_qty,
  round(m.failed_qty::numeric,1) as failed_testing_qty,
  round(coalesce(m.unexplained_reduction,0)::numeric,1) as unaccounted_qty,
  s.manifests_out, s.packages_shipped, s.manifests_unconfirmed,
  case
    when coalesce(m.unexplained_reduction,0) > 0 then 'DISCREPANCY - ' || round(m.unexplained_reduction::numeric,1) || ' reduced with no recorded reason'
    when coalesce(s.manifests_unconfirmed,0) > 0 then 'SHIPMENTS UNCONFIRMED - ' || s.manifests_unconfirmed || ' manifest(s) not confirmed received'
    when coalesce(m.failed_qty,0) > 0 then 'FAILED TESTING on hand - decide destruction or remediation'
    when h.wet_g > 0 and coalesce(h.waste_g,0)/nullif(h.wet_g,0) > 0.15 then 'HIGH WASTE - above 15 percent of wet weight'
    else 'Accounted for' end as accountability_status
from harvested h
full outer join made m on m.month = h.month and m.license = h.license
full outer join sold s on s.month = coalesce(h.month, m.month) and s.license = coalesce(h.license, m.license)
where coalesce(h.month, m.month, s.month) is not null
order by 1 desc, 2;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Reports', (select category_order from nav_registry where category='Reports' limit 1),
  'Full Accountability (month by month)', 1, 'scale', 'full_accountability', 'v_full_accountability',
  'The whole flow in one report, month by month: harvests and plants, wet weight, waste and waste percentage, packaged weight, what was produced split into flower, concentrates, vapes and pre-rolls, quantity in stock, in transit, sold or closed, failed testing, anything unaccounted for, manifests shipped and unconfirmed, and a plain verdict on whether it all balances.',
  true, false, false
where not exists (select 1 from nav_registry where view_key = 'full_accountability');
select month, license, harvests, harvested_wet_lbs, waste_pct, packages_made, flower, concentrates, vapes, prerolls, in_stock_qty, sold_or_closed_qty, unaccounted_qty, accountability_status
from v_full_accountability order by month desc limit 6;;
