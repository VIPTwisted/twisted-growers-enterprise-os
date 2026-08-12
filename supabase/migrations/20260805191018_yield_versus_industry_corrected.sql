drop view if exists v_yield_versus_industry cascade;
create view v_yield_versus_industry as
select
  m.month,
  m.harvests_cut, m.harvests_closed, m.still_open,
  m.plants as plants_harvested,
  m.wet_lb as wet_lbs,
  m.packaged_lb as saleable_lbs,
  m.sitting_unfinished_lb,
  m.conversion_pct_closed_only as our_conversion_pct,
  20 as industry_average_pct,
  25 as industry_good_pct,
  (select max(conversion_pct_closed_only) from v_monthly_conversion_truth
     where still_open = 0 and conversion_pct_closed_only <= 30) as our_best_clean_month_pct,
  round(m.packaged_lb*453.592/nullif(m.plants,0),1) as our_grams_per_plant,
  '50 to 75 (density-derived)' as industry_grams_per_plant_range,
  round(m.plants/nullif(m.packaged_lb,0),1) as our_plants_per_pound,
  m.avg_dry_days, m.dried_too_long, m.dried_too_fast,
  case
    when m.still_open > 0 then 'CANNOT BE JUDGED YET — '||m.still_open||' of '||m.harvests_cut||' harvests from this month are still open'
    when m.conversion_pct_closed_only > 30 then 'SUSPECT HIGH — check wet weight recording'
    when m.conversion_pct_closed_only >= 25 then 'GOOD'
    when m.conversion_pct_closed_only >= 20 then 'AT INDUSTRY AVERAGE'
    else 'BELOW INDUSTRY AVERAGE'
  end as industry_verdict,
  m.how_to_read_this_month
from v_monthly_conversion_truth m order by m.month desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select max(category_order) from nav_registry where category='Cultivation'),
 'Yield vs Industry (corrected)', 84, 'bar-chart', 'yield_vs_industry', 'v_yield_versus_industry',
 'Monthly yield against the published commercial benchmarks, measured only on closed harvests, with the dry-time and open-harvest context that explains each month.', true, false, false
where not exists (select 1 from nav_registry where view_key='yield_vs_industry');
insert into nav_role_visibility (view_key, role, visible)
select 'yield_vs_industry', r.role, true from (values ('owner'),('executive'),('manager'),('member')) r(role)
on conflict (view_key, role) do update set visible = true;;
