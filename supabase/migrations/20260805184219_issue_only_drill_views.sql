-- ISSUE-ONLY views: opening these shows the problems and nothing else,
-- each row stating what is wrong and what to do.
create or replace view v_issue_yield_gap as
with best as (select max(wet_to_saleable_pct) as best_pct from v_true_cost_per_pound)
select t.month, t.harvests, t.plants_harvested, t.wet_lbs, t.saleable_lbs,
  t.wet_to_saleable_pct as conversion_pct,
  (select best_pct from best) as best_month_pct,
  round(((select best_pct from best) - t.wet_to_saleable_pct)::numeric,1) as points_below_best,
  round((t.wet_lbs * ((select best_pct from best) - t.wet_to_saleable_pct) / 100.0)::numeric,1) as pounds_lost_versus_best,
  round((t.wet_lbs * ((select best_pct from best) - t.wet_to_saleable_pct) / 100.0
    * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_lost_versus_best,
  t.grams_per_plant, t.plants_per_saleable_pound,
  'THE ISSUE: this month converted ' || round(((select best_pct from best) - t.wet_to_saleable_pct)::numeric,1)
    || ' points below your own best month on record' as what_is_wrong,
  'Compare drying duration, trim practice and wet weight recording against the best month in this room' as what_to_do
from v_true_cost_per_pound t
where t.wet_to_saleable_pct < (select best_pct from best) * 0.85
order by dollars_lost_versus_best desc nulls last;

create or replace view v_issue_late as
select event_type, room, detail, scheduled_date, actual_date, days_off_schedule, rule_verdict,
  'THE ISSUE: ' || rule_verdict || '. Late is never acceptable under the standing rule.' as what_is_wrong,
  'Weekend crew or a second shift - never a slipped date. Review with the cultivation lead.' as what_to_do
from v_late_violations where rule_verdict like 'VIOLATION%'
order by days_off_schedule desc nulls last;

create or replace view v_issue_aging as
select category, stage, location, item, identifier, quantity, uom, days_here, severity,
  'THE ISSUE: ' || action as what_is_wrong,
  case when severity = 'critical' then 'Act today' else 'Schedule it this week' end as what_to_do
from v_inventory_aging where severity is not null
order by case severity when 'critical' then 0 when 'elevated' then 1 else 2 end, days_here desc;

create or replace view v_issue_failed_testing as
select p.license, p.tag as package_tag, p.item_name, p.quantity, p.uom, p.location,
  p.packaged_on, (current_date - p.packaged_on) as days_held,
  nullif(p.raw->>'SourceHarvestNames','') as source_harvest,
  round((coalesce(p.quantity,0)/453.592 * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as value_at_cost,
  'THE ISSUE: this package failed laboratory testing and is still sitting in active inventory. It cannot legally be sold.' as what_is_wrong,
  'Decide remediation or destruction and record the disposition in Metrc.' as what_to_do
from metrc_packages p
where p.lab_testing_state = 'TestFailed' and p.source_state in ('active','onhold')
order by value_at_cost desc nulls last;

create or replace view v_issue_unconfirmed_manifests as
select t.manifest_number, t.created_on as shipped_on, (current_date - t.created_on) as days_unconfirmed,
  t.recipient as customer, coalesce((t.raw->>'PackageCount')::numeric,0) as packages,
  t.raw->>'TransporterFacilityName' as transporter,
  case when t.raw->>'Id' is not null then 'https://ma.metrc.com/reports/transfers/'||(t.raw->>'Id')||'/manifest' end as manifest_link,
  'THE ISSUE: this outbound manifest was never confirmed received. The chain of custody is open on the state record.' as what_is_wrong,
  'Contact the receiving facility and have them confirm receipt in Metrc, or void and reissue.' as what_to_do,
  t.license
from metrc_transfers t
where t.direction = 'outgoing' and t.raw->>'ReceivedDateTime' is null and t.created_on < current_date - 3
order by days_unconfirmed desc;

create or replace view v_issue_no_allocation as
select material_class, origin, item, strain, identifier, quantity, uom, location, stage,
  days_in_system, vendor, approval_state,
  'THE ISSUE: ' || approval_state || '. Material is in the facility with no approved destination.' as what_is_wrong,
  'Raise an allocation request, or approve the pending one, before this material moves.' as what_to_do
from v_awaiting_allocation
order by days_in_system desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select category_order from nav_registry n2 where n2.category = v.cat limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Cultivation','ISSUES: Yield Gap', 19, 'shield', 'issue_yield_gap', 'v_issue_yield_gap', 'Only the months that converted below your own best: how many points below, pounds lost against that benchmark, what it cost, what is wrong and what to do.'),
  ('Cultivation','ISSUES: Late Pulls & Dries', 18, 'bell', 'issue_late', 'v_issue_late', 'Only the schedule violations: what ran late, by how many days, what is wrong and what to do about it.'),
  ('Inventory','ISSUES: Aging Stock', 11, 'clock', 'issue_aging', 'v_issue_aging', 'Only the stock that has aged past policy, worst first, with what is wrong and when to act.'),
  ('Quality','ISSUES: Failed Testing On Hand', 3, 'flask', 'issue_failed_testing', 'v_issue_failed_testing', 'Only the packages that failed laboratory testing and are still in inventory, with their value at cost and the disposition decision required.'),
  ('Sales & Cash','ISSUES: Manifests Never Confirmed', 11, 'truck', 'issue_unconfirmed_manifests', 'v_issue_unconfirmed_manifests', 'Only the outbound manifests the receiver never confirmed, oldest first, each with a link to the manifest and what to do.'),
  ('Inventory','ISSUES: No Approved Allocation', 12, 'shield', 'issue_no_allocation', 'v_issue_no_allocation', 'Only the material sitting with no approved allocation, longest first, with what is wrong and what to do.')
) v(cat, l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select (select count(*) from v_issue_yield_gap) yield_gap, (select count(*) from v_issue_late) late,
  (select count(*) from v_issue_failed_testing) failed, (select count(*) from v_issue_unconfirmed_manifests) manifests,
  (select count(*) from v_issue_aging) aging, (select count(*) from v_issue_no_allocation) no_alloc;;
