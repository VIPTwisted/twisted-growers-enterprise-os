-- ═══ 1. FRESH FROZEN IN DRY-EQUIVALENT ═══════════════════════════════
drop view if exists v_fresh_frozen_equiv cascade;
create view v_fresh_frozen_equiv as
with f as (select value r from conversion_factors where key='fresh_frozen_wet_to_dry')
select
  s.origin, s.supplier, s.license, s.location, s.lab_state,
  s.packages, s.pounds as frozen_lb,
  round(s.pounds / (select r from f), 1) as dry_equivalent_lb,
  (select r from f) as ratio_used,
  s.oldest_days, s.oldest_packaged, s.strains,
  round(s.pounds,1)||' lb frozen / '||(select r from f)||' = '||round(s.pounds/(select r from f),1)||' lb dry-equivalent' as the_arithmetic,
  'Fresh frozen still contains its water. Only the dry-equivalent figure may be compared with, or added to, dried flower.' as why
from v_stock_on_hand s
where s.stream = 'Fresh frozen'
order by s.pounds desc;

drop view if exists v_production_true_position cascade;
create view v_production_true_position as
with f as (select value r from conversion_factors where key='fresh_frozen_wet_to_dry'),
o as (
  select origin, stream, sum(pounds) lb from v_stock_on_hand group by 1,2
)
select
  origin,
  stream,
  round(lb,1) as as_recorded_lb,
  case when stream='Fresh frozen' then round(lb/(select r from f),1) else round(lb,1) end as dry_equivalent_lb,
  case when stream='Fresh frozen'
       then 'Divided by '||(select r from f)||' - frozen material still holds its water'
       else 'Already dry - no conversion needed' end as adjustment,
  round(100 * (case when stream='Fresh frozen' then lb/(select r from f) else lb end)
        / sum(case when stream='Fresh frozen' then lb/(select r from f) else lb end) over (), 1) as pct_of_true_production
from o order by dry_equivalent_lb desc;

-- ═══ 2. REAL LOSS — auditable, every pound explained ═════════════════
drop view if exists v_real_loss_v2 cascade;
create view v_real_loss_v2 as
with f as (
  select
    (select value from conversion_factors where key='target_cost_per_lb') cost,
    (select value from conversion_factors where key='dry_window_min_days') dmin,
    (select value from conversion_factors where key='dry_window_max_days') dmax
),
-- benchmark: what dried flower converts at when it dries inside the window
bench as (
  select round(avg(conversion_pct),1) as good_conv
  from v_harvest_forensic
  where harvest_state='Finished' and conversion_pct between 10 and 35
    and dry_days_to_first_package between (select dmin from f) and (select dmax from f)
    and harvest_name not ilike '%FF%'
),
failed as (
  select
    'Failed laboratory testing' as loss_type,
    'CERTAIN' as confidence,
    count(*) as occurrences,
    round(sum(pounds),1) as pounds,
    round(sum(pounds) * (select cost from f)) as dollars,
    'Product that was packaged, tested, and failed. It exists, it is on the shelf, and it cannot legally be sold.' as why_it_is_a_loss,
    'sum of packaged pounds in TestFailed state x cost per pound' as the_arithmetic,
    'issue_failed_testing' as drill
  from v_stock_on_hand where lab_state = 'TestFailed'
),
drytime as (
  select
    'Weight lost to over-drying' as loss_type,
    'ESTIMATE' as confidence,
    count(*) as occurrences,
    round(sum(greatest(0, wet_lb * ((select good_conv from bench) - conversion_pct)/100)),1) as pounds,
    round(sum(greatest(0, wet_lb * ((select good_conv from bench) - conversion_pct)/100)) * (select cost from f)) as dollars,
    'Harvests dried beyond the '||(select dmax from f)||' day window converted below harvests that dried inside it. The gap is weight that evaporated instead of being sold.' as why_it_is_a_loss,
    'for each harvest over the window: wet lb x (benchmark conversion '||(select good_conv from bench)||'% minus its own conversion) x cost per pound' as the_arithmetic,
    'harvest_issues' as drill
  from v_harvest_forensic
  where harvest_state='Finished' and harvest_name not ilike '%FF%'
    and dry_days_to_first_package > (select dmax from f)
    and conversion_pct is not null and conversion_pct < (select good_conv from bench)
),
zeropkg as (
  select
    'Closed with nothing packaged' as loss_type,
    'NEEDS INVESTIGATION' as confidence,
    count(*) as occurrences,
    round(sum(wet_lb * (select good_conv from bench)/100),1) as pounds,
    round(sum(wet_lb * (select good_conv from bench)/100) * (select cost from f)) as dollars,
    'Harvests marked finished with no package ever taken off. Either the weight went unrecorded or the harvest was closed prematurely. Valued at what it should have produced.' as why_it_is_a_loss,
    'wet lb x benchmark conversion x cost per pound' as the_arithmetic,
    'harvest_issues' as drill
  from v_harvest_forensic
  where harvest_state='Finished' and coalesce(packaged_lb,0)=0 and wet_lb>0 and harvest_name not ilike '%FF%'
)
select * from failed
union all select * from drytime
union all select * from zeropkg
order by dollars desc nulls last;

drop view if exists v_real_loss_summary_v2 cascade;
create view v_real_loss_summary_v2 as
select
  round(sum(dollars) filter (where confidence='CERTAIN')) as certain_dollars,
  round(sum(dollars) filter (where confidence<>'CERTAIN')) as estimated_dollars,
  round(sum(dollars)) as total_dollars,
  round(sum(pounds),1) as total_pounds,
  'Evaporated moisture is excluded - it was never sellable. Routine stem and leaf waste is excluded - it is already inside cost per pound. Variance against the company average is excluded - that measures spread, not loss.' as what_is_deliberately_excluded,
  'The withdrawn $2,251,040 yield underperformance line scored every harvest against the company average, so half were guaranteed to show a shortfall by definition, and that average blended fresh frozen with dried flower.' as what_was_withdrawn
from v_real_loss_v2;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Fresh Frozen in Dry-Equivalent', 13, 'thermometer', 'fresh_frozen_equiv', 'v_fresh_frozen_equiv',
  'Every fresh frozen package converted to the dried-flower pounds it actually represents, with the arithmetic shown on each row. Fresh frozen holds its water; only the dry-equivalent may be compared with dried flower.'),
 ('True Production Position', 14, 'pie-chart', 'production_true_position', 'v_production_true_position',
  'Every stream in like-for-like dry-equivalent pounds, split by grown versus bought in, so nothing is double counted and nothing is overstated.'),
 ('Real Loss', 15, 'trending-down', 'real_loss_v2', 'v_real_loss_v2',
  'Only losses that are genuinely losses, each with its confidence, the arithmetic used, and a drill into the records. Evaporated moisture, routine trim waste and variance against the company average are all deliberately excluded and the reason is stated.'),
 ('Conversion Factors', 16, 'settings', 'conversion_factors', 'conversion_factors',
  'Every factor the platform calculates with - the fresh frozen wet-to-dry ratio, the dry window, cost per pound, expected moisture range. Editable rows. Change one and every figure that depends on it recalculates.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from
 (values ('fresh_frozen_equiv'),('production_true_position'),('real_loss_v2')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;
insert into nav_role_visibility (view_key, role, visible)
select 'conversion_factors', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',false),('dept_head',false),('staff',false),('readonly',false)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
