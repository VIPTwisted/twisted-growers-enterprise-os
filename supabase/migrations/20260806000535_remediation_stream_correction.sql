-- Twisted Growers buys failed material deliberately, remediates it and processes it.
-- Purchased failed material is INPUT, not loss. Only our own failures are losses.
create table if not exists purchase_intent (
  origin_license text primary key,
  supplier text,
  bought_as text not null default 'unknown'
    check (bought_as in ('unknown','sound material','failed for remediation','biomass for extraction')),
  note text,
  set_by text,
  updated_at timestamptz not null default now()
);
alter table purchase_intent enable row level security;
drop policy if exists pi_read on purchase_intent;
create policy pi_read on purchase_intent for select to authenticated using (true);
drop policy if exists pi_write on purchase_intent;
create policy pi_write on purchase_intent for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role in ('owner','executive')));

insert into purchase_intent (origin_license, supplier, bought_as, note, set_by)
select distinct origin_license, supplier, 'unknown',
  'Set what this supplier sends us: sound material, failed material bought for remediation, or biomass for extraction. Until this is set the platform cannot tell a supplier problem from a deliberate purchase.',
  'awaiting Vincent'
from v_stock_on_hand where origin = 'Bought in' and origin_license is not null
on conflict (origin_license) do nothing;

drop view if exists v_failed_testing_by_origin cascade;
create view v_failed_testing_by_origin as
select
  s.origin, s.supplier, s.origin_license, s.stream, s.license as held_under,
  s.location, s.packages, s.pounds, s.oldest_days, s.strains,
  coalesce(i.bought_as,'unknown') as bought_as,
  round(s.pounds * (select value from conversion_factors where key='target_cost_per_lb')) as value_at_our_cost,
  case
    when s.origin = 'Grown by us'
      then 'OUR FAILURE - a genuine loss. We grew it, packaged it and it failed. Root cause is ours to find.'
    when coalesce(i.bought_as,'unknown') = 'failed for remediation'
      then 'BOUGHT FAILED ON PURPOSE - this is raw material, not a loss. It was purchased to remediate and process. Track the remediation yield, not the failure.'
    when coalesce(i.bought_as,'unknown') = 'biomass for extraction'
      then 'BIOMASS FOR EXTRACTION - bought to be processed, so a fail on flower testing may be irrelevant. Confirm the intended route.'
    when coalesce(i.bought_as,'unknown') = 'sound material'
      then 'SUPPLIER PROBLEM - we bought this as sound material and it failed. Raise it with '||s.supplier||'.'
    else 'INTENT NOT RECORDED - we cannot tell whether this was bought sound and failed, or bought failed on purpose to remediate. Set it on the Purchase Intent page before treating it as a loss.'
  end as whose_problem,
  case
    when s.origin = 'Grown by us' then 'Find the root cause, then decide remediate or destroy and record it in Metrc.'
    when coalesce(i.bought_as,'unknown') = 'failed for remediation' then 'Move it into remediation and record what comes out the other side.'
    when coalesce(i.bought_as,'unknown') = 'sound material' then 'Raise it with the supplier with the package tags and the certificate.'
    else 'Set the purchase intent for '||coalesce(s.supplier,'this supplier')||' so this stops being ambiguous.'
  end as what_to_do
from v_stock_on_hand s
left join purchase_intent i on i.origin_license = s.origin_license
where s.lab_state = 'TestFailed'
order by s.pounds desc;

-- Real loss: purchased-for-remediation material is INPUT and never counted as loss
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
failed_ours as (
  select 'Failed testing - our own material' loss_type, 'OURS - genuine loss' whose, 'CERTAIN' confidence,
    sum(packages) occurrences, round(sum(pounds),1) pounds,
    round(sum(pounds)*(select cost from f)) dollars,
    'We grew it, packaged it, and it failed. It cannot be sold as flower.' why_it_is_a_loss,
    'our failed pounds x cost per pound' the_arithmetic, 'failed_testing_by_origin' drill
  from v_stock_on_hand where lab_state='TestFailed' and origin='Grown by us'
  having sum(packages) > 0
),
failed_supplier as (
  select 'Failed testing - bought as sound material' loss_type,
    'SUPPLIER - raise it with them' whose, 'CERTAIN' confidence,
    sum(s.packages) occurrences, round(sum(s.pounds),1) pounds,
    round(sum(s.pounds)*(select cost from f)) dollars,
    'Purchased as sound material and failed. Recoverable from the supplier.' why_it_is_a_loss,
    'failed pounds bought as sound x cost per pound' the_arithmetic, 'failed_testing_by_origin' drill
  from v_stock_on_hand s join purchase_intent i on i.origin_license = s.origin_license
  where s.lab_state='TestFailed' and i.bought_as = 'sound material'
  having sum(s.packages) > 0
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
select * from failed_ours
union all select * from failed_supplier
union all select * from drytime
union all select * from zeropkg
order by dollars desc nulls last;

-- Remediation: what went in, what came out
drop view if exists v_remediation_yield cascade;
create view v_remediation_yield as
select
  src.supplier, src.source_tag, src.source_item, src.strain,
  src.received_qty as material_in,
  src.source_uom,
  count(*) as products_made,
  round(sum(child.made_qty)) as output_qty,
  string_agg(distinct child.made_into_category, ', ') as became,
  round(100.0*sum(child.made_qty)/nullif(src.received_qty,0),1) as recovery_pct,
  count(*) filter (where child.made_lab_state='TestPassed') as output_passed,
  count(*) filter (where child.made_lab_state='TestFailed') as output_failed
from v_third_party_downstream src
join v_third_party_downstream child
  on child.source_tag = src.source_tag
group by 1,2,3,4,5,6
order by src.received_qty desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Purchase Intent by Supplier', 24, 'clipboard', 'purchase_intent', 'purchase_intent',
  'What each supplier sends us: sound material, failed material bought deliberately for remediation, or biomass for extraction. Until this is set the platform cannot tell a supplier problem from a deliberate purchase, and will not call either one a loss.'),
 ('Remediation Yield', 25, 'refresh-cw', 'remediation_yield', 'v_remediation_yield',
  'Material bought for remediation traced through to what came out: how much went in, what it became, the recovery percentage, and whether the output passed testing.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('purchase_intent'),('remediation_yield')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
