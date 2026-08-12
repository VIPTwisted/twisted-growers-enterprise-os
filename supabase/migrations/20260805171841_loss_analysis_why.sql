-- WHY are we losing material: by room, by strain, by month, ranked worst first,
-- with what it cost against the projection.
create or replace view v_loss_analysis as
with h as (
  select coalesce(raw->>'DryingLocationName','(no room)') as room,
    coalesce(raw->>'SourceStrainNames','(not recorded)') as strain,
    to_char(harvest_start,'YYYY-MM') as month,
    (date_trunc('month',harvest_start))::date as month_date,
    name as harvest, harvest_start,
    coalesce((raw->>'TotalWetWeight')::numeric,0) as wet_g,
    coalesce((raw->>'TotalWasteWeight')::numeric,0) as waste_g,
    coalesce((raw->>'TotalPackagedWeight')::numeric,0) as packaged_g,
    coalesce((raw->>'PlantCount')::numeric,0) as plants
  from metrc_harvests where harvest_start is not null
)
select room, strain, month, month_date,
  count(*)::numeric as harvests,
  sum(plants) as plants,
  round((sum(wet_g)/453.592)::numeric,1) as wet_lbs,
  round((sum(waste_g)/453.592)::numeric,1) as waste_lbs,
  round((sum(packaged_g)/453.592)::numeric,1) as packaged_lbs,
  case when sum(wet_g)>0 then round((100.0*sum(waste_g)/sum(wet_g))::numeric,1) end as waste_pct,
  case when sum(wet_g)>0 then round((100.0*sum(packaged_g)/sum(wet_g))::numeric,1) end as yield_pct,
  -- how far off the company average this room/strain runs
  case when sum(wet_g)>0 then round((
    (100.0*sum(waste_g)/sum(wet_g)) -
    (select 100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/nullif(sum(coalesce((raw->>'TotalWetWeight')::numeric,0)),0) from metrc_harvests)
  )::numeric,1) end as waste_pct_vs_company_average,
  case
    when sum(wet_g)=0 then 'No weights recorded - cannot analyse'
    when 100.0*sum(waste_g)/sum(wet_g) > 25 then 'SEVERE - investigate this room and crew immediately'
    when 100.0*sum(waste_g)/sum(wet_g) > 15 then 'HIGH - above the acceptable band'
    when 100.0*sum(waste_g)/sum(wet_g) > 10 then 'ELEVATED - watch it'
    else 'Within normal range' end as loss_verdict,
  -- the money question, once product economics are entered
  (select round((sum(waste_g)/453.592 * 453.592 * max(margin_per_input_gram))::numeric,0) from v_route_margin) as lost_margin_estimate,
  max(harvest_start) as last_harvest
from h
group by room, strain, month, month_date
order by waste_pct desc nulls last;

-- The short answer: which rooms and strains lose the most, all time.
create or replace view v_loss_ranking as
select scope_type, scope, harvests, wet_lbs, waste_lbs, waste_pct, yield_pct, verdict from (
  select 'Room' as scope_type, coalesce(raw->>'DryingLocationName','(no room)') as scope,
    count(*)::numeric as harvests,
    round((sum(coalesce((raw->>'TotalWetWeight')::numeric,0))/453.592)::numeric,1) as wet_lbs,
    round((sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/453.592)::numeric,1) as waste_lbs,
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      then round((100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)))::numeric,1) end as waste_pct,
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      then round((100.0*sum(coalesce((raw->>'TotalPackagedWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)))::numeric,1) end as yield_pct,
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      and 100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)) > 15
      then 'ABOVE ACCEPTABLE' else 'Within range' end as verdict
  from metrc_harvests group by 2
  union all
  select 'Strain', coalesce(raw->>'SourceStrainNames','(not recorded)'),
    count(*)::numeric,
    round((sum(coalesce((raw->>'TotalWetWeight')::numeric,0))/453.592)::numeric,1),
    round((sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/453.592)::numeric,1),
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      then round((100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)))::numeric,1) end,
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      then round((100.0*sum(coalesce((raw->>'TotalPackagedWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)))::numeric,1) end,
    case when sum(coalesce((raw->>'TotalWetWeight')::numeric,0))>0
      and 100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/sum(coalesce((raw->>'TotalWetWeight')::numeric,0)) > 15
      then 'ABOVE ACCEPTABLE' else 'Within range' end
  from metrc_harvests group by 2
) x where wet_lbs > 0 order by waste_pct desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Loss Analysis - the why', 33, 'scale', 'loss_analysis', 'v_loss_analysis', 'Why material is being lost: waste and yield percentages by room, strain and month, how far each runs from the company average, a verdict naming anything severe or high, and the estimated margin lost.'),
  ('Loss Ranking (worst first)', 34, 'shield', 'loss_ranking', 'v_loss_ranking', 'The short answer: which rooms and which strains lose the most material all time, ranked worst first, with pounds wasted and the verdict.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select scope_type, scope, harvests, wet_lbs, waste_lbs, waste_pct, yield_pct, verdict from v_loss_ranking limit 10;;
