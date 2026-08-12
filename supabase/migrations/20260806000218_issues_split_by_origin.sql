-- Every problem, attributed: is it ours, or did we buy it in?
drop view if exists v_failed_testing_by_origin cascade;
create view v_failed_testing_by_origin as
select
  s.origin, s.supplier, s.origin_license, s.stream, s.license as held_under,
  s.location, s.packages, s.pounds, s.oldest_days, s.strains,
  round(s.pounds * (select value from conversion_factors where key='target_cost_per_lb')) as value_at_cost,
  case
    when s.origin = 'Grown by us'
      then 'OUR FAILURE. We grew it, packaged it and it failed. This is a genuine loss and a cultivation or handling problem to investigate.'
    else 'SUPPLIER FAILURE - '||s.supplier||'. We paid for material that failed testing. This is a chargeback, a return or a credit, not our loss. Do not write it off until the supplier has been approached.'
  end as whose_problem,
  case
    when s.origin = 'Grown by us' then 'Find the root cause: room, dry time, handling. Then decide remediate or destroy and record it in Metrc.'
    else 'Raise it with '||s.supplier||' with the package tags and the certificate. Recover the money or the material before recording any disposition.'
  end as what_to_do
from v_stock_on_hand s
where s.lab_state = 'TestFailed'
order by s.pounds desc;

drop view if exists v_issue_attribution cascade;
create view v_issue_attribution as
with failed as (
  select 'Failed testing' as issue, origin, supplier, stream,
         packages as items, pounds,
         round(pounds * (select value from conversion_factors where key='target_cost_per_lb')) as dollars
  from v_stock_on_hand where lab_state='TestFailed'
),
aged as (
  select 'Sitting over 180 days' as issue, origin, supplier, stream,
         packages, pounds,
         round(pounds * (select value from conversion_factors where key='target_cost_per_lb')) as dollars
  from v_stock_on_hand where oldest_days > 180
),
untested as (
  select 'Never submitted for testing' as issue, origin, supplier, stream,
         packages, pounds,
         round(pounds * (select value from conversion_factors where key='target_cost_per_lb')) as dollars
  from v_stock_on_hand where lab_state='NotSubmitted'
),
nosupplier as (
  select 'Bought in with no supplier recorded' as issue, origin, supplier, stream,
         packages, pounds, null::numeric as dollars
  from v_stock_on_hand where origin='Bought in' and supplier='(supplier not recorded)'
)
select issue, origin, supplier, stream, items, pounds, dollars,
  case when origin='Grown by us' then 'Ours to fix' else 'Raise with '||supplier end as accountable
from (
  select * from failed union all select * from aged
  union all select * from untested union all select * from nosupplier
) x
order by dollars desc nulls last, pounds desc;

drop view if exists v_issue_attribution_summary cascade;
create view v_issue_attribution_summary as
select issue,
  round(coalesce(sum(pounds) filter (where origin='Grown by us'),0),1) ours_lb,
  round(coalesce(sum(dollars) filter (where origin='Grown by us'),0)) ours_dollars,
  round(coalesce(sum(pounds) filter (where origin<>'Grown by us'),0),1) bought_in_lb,
  round(coalesce(sum(dollars) filter (where origin<>'Grown by us'),0)) recoverable_dollars,
  string_agg(distinct supplier, ', ') filter (where origin<>'Grown by us') as suppliers_involved,
  'Money against bought-in material is potentially recoverable from the supplier. Money against our own material is a genuine loss.' as note
from v_issue_attribution group by 1 order by 2 desc;

-- Real loss must also say whose it is
drop view if exists v_real_loss_v2 cascade;
create view v_real_loss_v2 as
with f as (
  select
    (select value from conversion_factors where key='target_cost_per_lb') cost,
    (select value from conversion_factors where key='dry_window_max_days') dmax,
    (select value from conversion_factors where key='dry_window_min_days') dmin
),
bench as (
  select round(avg(conversion_pct),1) good_conv from v_harvest_forensic
  where harvest_state='Finished' and conversion_pct between 10 and 35
    and dry_days_to_first_package between (select dmin from f) and (select dmax from f)
    and harvest_name not ilike '%FF%'
),
failed as (
  select 'Failed laboratory testing' loss_type,
    case when origin='Grown by us' then 'OURS - genuine loss' else 'BOUGHT IN - recoverable from '||supplier end as whose,
    'CERTAIN' confidence, sum(packages) occurrences, round(sum(pounds),1) pounds,
    round(sum(pounds)*(select cost from f)) dollars,
    'Packaged, tested, failed. Cannot legally be sold.' why_it_is_a_loss,
    'failed pounds x cost per pound' the_arithmetic, 'failed_testing_by_origin' drill
  from v_stock_on_hand where lab_state='TestFailed' group by origin, supplier
),
drytime as (
  select 'Weight lost to over-drying' loss_type, 'OURS - genuine loss' whose, 'ESTIMATE' confidence,
    count(*) occurrences,
    round(sum(greatest(0, wet_lb*((select good_conv from bench)-conversion_pct)/100)),1) pounds,
    round(sum(greatest(0, wet_lb*((select good_conv from bench)-conversion_pct)/100))*(select cost from f)) dollars,
    'Harvests dried past the '||(select dmax from f)||' day window converted below those that dried inside it.' why_it_is_a_loss,
    'wet lb x (benchmark '||(select good_conv from bench)||'% minus own conversion) x cost per pound' the_arithmetic,
    'harvest_issues' drill
  from v_harvest_forensic
  where harvest_state='Finished' and harvest_name not ilike '%FF%'
    and dry_days_to_first_package > (select dmax from f)
    and conversion_pct is not null and conversion_pct < (select good_conv from bench)
),
zeropkg as (
  select 'Closed with nothing packaged' loss_type, 'OURS - needs investigation' whose, 'NEEDS INVESTIGATION' confidence,
    count(*) occurrences, round(sum(wet_lb*(select good_conv from bench)/100),1) pounds,
    round(sum(wet_lb*(select good_conv from bench)/100)*(select cost from f)) dollars,
    'Marked finished with no package ever taken off.' why_it_is_a_loss,
    'wet lb x benchmark conversion x cost per pound' the_arithmetic, 'harvest_issues' drill
  from v_harvest_forensic
  where harvest_state='Finished' and coalesce(packaged_lb,0)=0 and wet_lb>0 and harvest_name not ilike '%FF%'
)
select * from failed union all select * from drytime union all select * from zeropkg
order by dollars desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Failed Testing — Ours or Theirs', 17, 'alert-octagon', 'failed_testing_by_origin', 'v_failed_testing_by_origin',
  'Every failed package attributed. Material we grew is our loss and a process problem. Material we bought in is a supplier chargeback and must not be written off until the supplier has been approached.'),
 ('Issue Attribution', 18, 'users', 'issue_attribution_summary', 'v_issue_attribution_summary',
  'Every category of problem split between what we grew and what we bought in, with the dollars that are potentially recoverable from suppliers named separately from what is genuinely our loss.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('failed_testing_by_origin'),('issue_attribution_summary')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
