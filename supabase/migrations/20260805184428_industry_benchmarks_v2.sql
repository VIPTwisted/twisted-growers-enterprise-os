create table if not exists industry_benchmarks (
  id uuid primary key default gen_random_uuid(),
  metric text not null unique,
  poor numeric, average numeric, good numeric, best_in_class numeric,
  unit text, note text, source text, updated_at timestamptz default now()
);
alter table industry_benchmarks enable row level security;
drop policy if exists ib_read on industry_benchmarks;
drop policy if exists ib_write on industry_benchmarks;
create policy ib_read on industry_benchmarks for select to authenticated using (true);
create policy ib_write on industry_benchmarks for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
insert into industry_benchmarks (metric, poor, average, good, best_in_class, unit, note, source) values
('Wet to saleable conversion', 15, 20, 25, 30, 'percent',
 'Fresh wet weight to cured saleable flower. Roughly a fifth to a quarter of wet weight survives drying and trim in a well run indoor room.',
 'Widely used indoor planning figures - owner to confirm against their own operator network'),
('Grams per plant', 80, 130, 180, 250, 'grams',
 'Saleable dried flower per harvested plant indoors at typical density.', 'Owner to confirm'),
('Plants per saleable pound', 6, 3.5, 2.5, 1.8, 'plants',
 'How many plants make one saleable pound. Lower is better.', 'Derived from grams per plant'),
('Grams per square foot per cycle', 30, 45, 60, 80, 'grams',
 'Canopy productivity - the figure most indoor operators compare on.', 'Owner to confirm against their square footage'),
('Cost per saleable pound', 1600, 1200, 900, 650, 'dollars',
 'All-in operating cost for one saleable pound indoors.', 'Owner stated approximately 1,100 dollars per pound here')
on conflict (metric) do nothing;

create or replace view v_yield_versus_industry as
with b as (select metric, poor, average, good, best_in_class from industry_benchmarks),
own as (select max(wet_to_saleable_pct) as own_best from v_true_cost_per_pound)
select t.month, t.harvests, t.plants_harvested, t.wet_lbs, t.saleable_lbs,
  t.wet_to_saleable_pct as our_conversion_pct,
  (select average from b where metric='Wet to saleable conversion') as industry_average_pct,
  (select good from b where metric='Wet to saleable conversion') as industry_good_pct,
  (select best_in_class from b where metric='Wet to saleable conversion') as industry_best_pct,
  (select own_best from own) as our_best_month_pct,
  round((t.wet_to_saleable_pct - (select average from b where metric='Wet to saleable conversion'))::numeric,1) as versus_industry_average,
  t.grams_per_plant as our_grams_per_plant,
  (select average from b where metric='Grams per plant') as industry_average_grams_per_plant,
  t.plants_per_saleable_pound as our_plants_per_pound,
  (select average from b where metric='Plants per saleable pound') as industry_average_plants_per_pound,
  case
    when t.wet_to_saleable_pct >= (select best_in_class from b where metric='Wet to saleable conversion') then 'BEST IN CLASS'
    when t.wet_to_saleable_pct >= (select good from b where metric='Wet to saleable conversion') then 'GOOD'
    when t.wet_to_saleable_pct >= (select average from b where metric='Wet to saleable conversion') then 'AT INDUSTRY AVERAGE'
    when t.wet_to_saleable_pct >= (select poor from b where metric='Wet to saleable conversion') then 'BELOW INDUSTRY AVERAGE'
    else 'FAR BELOW ANY INDUSTRY BAND' end as industry_verdict,
  round((t.wet_lbs * ((select average from b where metric='Wet to saleable conversion') - t.wet_to_saleable_pct)/100.0)::numeric,1) as pounds_short_of_industry_average,
  round((t.wet_lbs * ((select average from b where metric='Wet to saleable conversion') - t.wet_to_saleable_pct)/100.0
    * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_short_of_industry_average,
  'In plain English: from ' || t.plants_harvested || ' plants this month you kept '
    || t.saleable_lbs || ' saleable pounds out of ' || t.wet_lbs || ' wet pounds. That is '
    || t.wet_to_saleable_pct || ' percent, against an indoor industry average around '
    || (select average from b where metric='Wet to saleable conversion') || ' percent and our own best month of '
    || (select own_best from own) || ' percent. Each plant gave ' || t.grams_per_plant
    || ' grams, so it took ' || t.plants_per_saleable_pound || ' plants to make one saleable pound.' as what_this_means
from v_true_cost_per_pound t
order by t.month_date desc;

drop view if exists v_issue_yield_gap;
create view v_issue_yield_gap as
select y.month, y.harvests, y.plants_harvested, y.wet_lbs, y.saleable_lbs,
  y.our_conversion_pct, y.industry_average_pct, y.industry_good_pct, y.our_best_month_pct,
  y.versus_industry_average, y.our_grams_per_plant, y.industry_average_grams_per_plant,
  y.our_plants_per_pound, y.industry_average_plants_per_pound, y.industry_verdict,
  y.pounds_short_of_industry_average, y.dollars_short_of_industry_average,
  round((y.our_best_month_pct - y.our_conversion_pct)::numeric,1) as points_below_our_own_best,
  y.what_this_means,
  'THE ISSUE: ' || y.industry_verdict || ' at ' || y.our_conversion_pct
    || ' percent conversion, against an indoor industry average of ' || y.industry_average_pct
    || ' percent and our own best month of ' || y.our_best_month_pct || ' percent.' as what_is_wrong,
  'Compare drying duration, trim practice and wet weight recording against our best month. Closing to industry average alone is worth '
    || coalesce(y.dollars_short_of_industry_average,0) || ' dollars for this month.' as what_to_do
from v_yield_versus_industry y
where y.our_conversion_pct < y.industry_good_pct
order by y.dollars_short_of_industry_average desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select category_order from nav_registry n2 where n2.category = v.cat limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, v.adm, false
from (values
  ('Cultivation','Yield Versus Industry', 17, 'gauge', 'yield_versus_industry', 'v_yield_versus_industry', 'Our conversion, grams per plant and plants per saleable pound each month measured against state-of-the-art indoor industry bands and our own best month, with a verdict, a plain English explanation, and what the gap is worth in dollars.', false),
  ('Settings','Industry Benchmarks', 7, 'scale', 'industry_benchmarks', 'industry_benchmarks', 'The industry bands every yield and cost figure is measured against - poor, average, good and best in class. Edit these and every comparison in the platform updates.', true)
) v(cat, l, io, ic, vk, tr, d, adm)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select month, our_conversion_pct, industry_average_pct, our_best_month_pct, industry_verdict, dollars_short_of_industry_average from v_yield_versus_industry limit 5;;
