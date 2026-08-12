drop view if exists v_issue_aging;
create view v_issue_aging as
select
  l.category, l.item, l.identifier, l.location, l.stage, l.license,
  l.quantity, l.uom,
  round((case when lower(coalesce(l.uom,'')) in ('g','grams') then l.quantity/453.592 end)::numeric,2) as pounds,
  l.since_date as harvested_or_packaged_on,
  l.days_here as days_sitting,
  round((case when lower(coalesce(l.uom,'')) in ('g','grams')
    then l.quantity/453.592 * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1)
    end)::numeric,0) as value_at_cost,
  l.lab_state as laboratory_state,
  l.source_lineage as came_from,
  l.detail as extra_detail,
  a.severity,
  'THE ISSUE: ' || a.action as what_is_wrong,
  case when a.severity = 'critical' then 'Act today - this is past every threshold'
       when l.days_here > 90 then 'Decide this week: sell, discount, or write off'
       else 'Prioritise for sale ahead of newer stock' end as what_to_do
from v_inventory_locator l
join v_inventory_aging a on a.identifier = l.identifier and a.location = l.location
where a.severity is not null
order by l.days_here desc nulls last;

create or replace view v_issue_real_loss as
select r.loss_type, r.scope, r.location, r.units, r.unit_label, r.pounds,
  round((coalesce(r.pounds,0) * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_at_cost,
  r.why_it_is_a_loss as what_is_wrong, r.what_to_check as what_to_do,
  (select m.harvest_start from v_harvest_stage_map m where m.strains = r.scope or m.harvest = r.scope limit 1) as harvest_date,
  (select m.room from v_harvest_stage_map m where m.strains = r.scope or m.harvest = r.scope limit 1) as room,
  (select m.days_since_takedown from v_harvest_stage_map m where m.strains = r.scope or m.harvest = r.scope limit 1) as days_since_takedown
from v_real_loss r order by dollars_at_cost desc nulls last;

create or replace view v_issue_yield_by_harvest as
with avgc as (
  select avg(coalesce((raw->>'TotalPackagedWeight')::numeric,0)/nullif((raw->>'TotalWetWeight')::numeric,0)) as company_avg
  from metrc_harvests where coalesce((raw->>'TotalWetWeight')::numeric,0) > 0
)
select h.name as harvest, coalesce(h.raw->>'SourceStrainNames','not recorded') as strain,
  coalesce(h.raw->>'DryingLocationName','(no room)') as room,
  h.harvest_start as harvest_date, (h.raw->>'FinishedDate')::date as finished_date,
  case when h.raw->>'FinishedDate' is not null then ((h.raw->>'FinishedDate')::date - h.harvest_start) end as dry_days,
  (current_date - h.harvest_start) as days_since_harvest,
  coalesce((h.raw->>'PlantCount')::numeric,0) as plants,
  round((coalesce((h.raw->>'TotalWetWeight')::numeric,0)/453.592)::numeric,1) as wet_lbs,
  round((coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/453.592)::numeric,1) as saleable_lbs,
  round((coalesce((h.raw->>'TotalWasteWeight')::numeric,0)/453.592)::numeric,1) as waste_lbs,
  round((100.0*coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h.raw->>'TotalWetWeight')::numeric,0))::numeric,1) as conversion_pct,
  round((100.0*(select company_avg from avgc))::numeric,1) as company_average_pct,
  (select average from industry_benchmarks where metric='Wet to saleable conversion') as industry_average_pct,
  round((coalesce((h.raw->>'TotalWetWeight')::numeric,0)/453.592
    * ((select company_avg from avgc) - coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h.raw->>'TotalWetWeight')::numeric,0)))::numeric,1) as pounds_short_of_company_average,
  round((coalesce((h.raw->>'TotalWetWeight')::numeric,0)/453.592
    * ((select company_avg from avgc) - coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h.raw->>'TotalWetWeight')::numeric,0))
    * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_short,
  h.raw->>'LabTestingState' as laboratory_state, h.license,
  'THE ISSUE: this harvest converted ' ||
    round((100.0*coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h.raw->>'TotalWetWeight')::numeric,0))::numeric,1)
    || ' percent against a company average of ' || round((100.0*(select company_avg from avgc))::numeric,1) || ' percent.' as what_is_wrong,
  'Check dry days and trim practice for this harvest against a high performing one in the same room.' as what_to_do
from metrc_harvests h, avgc
where coalesce((h.raw->>'TotalWetWeight')::numeric,0) > 0
  and coalesce((h.raw->>'TotalPackagedWeight')::numeric,0) > 0
  and (coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/(h.raw->>'TotalWetWeight')::numeric) < 0.75 * avgc.company_avg
order by dollars_short desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select category_order from nav_registry n2 where n2.category = v.cat limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Cultivation','ISSUES: Underperforming Harvests', 14, 'shield', 'issue_yield_by_harvest', 'v_issue_yield_by_harvest', 'Every harvest that converted below par with its harvest date, finish date, dry days, days since harvest, plants, wet saleable and waste pounds, conversion against company and industry averages, and what the shortfall cost.'),
  ('Sales & Cash','ISSUES: Every Loss Item', 12, 'scale', 'issue_real_loss', 'v_issue_real_loss', 'Every genuine loss item on its own line with harvest date, room, days since takedown, pounds, dollars at cost, what is wrong and what to check.')
) v(cat, l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select (select count(*) from v_issue_aging) aging, (select count(*) from v_issue_yield_by_harvest) underperf, (select count(*) from v_issue_real_loss) loss;;
