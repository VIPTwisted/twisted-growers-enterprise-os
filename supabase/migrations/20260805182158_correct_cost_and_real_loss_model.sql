-- CORRECTED COSTING.
-- Cost per pound is period operating cost divided by SALEABLE pounds produced.
-- Normal harvest waste (stems, stalk, fan leaves) is already inside that number -
-- pricing it again as a loss double counts. Real loss is capacity that produced nothing.
create or replace view v_true_cost_per_pound as
select
  to_char(h.harvest_start,'YYYY-MM') as month,
  (date_trunc('month', h.harvest_start))::date as month_date,
  count(*)::numeric as harvests,
  sum(coalesce((h.raw->>'PlantCount')::numeric,0)) as plants_harvested,
  round((sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0))/453.592)::numeric,1) as wet_lbs,
  round((sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0))/453.592)::numeric,1) as saleable_lbs,
  case when sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)) > 0
    then round((100.0*sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0))/sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)))::numeric,1) end as wet_to_saleable_pct,
  (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1) as target_cost_per_pound,
  round((sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0))/453.592
         * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as period_cost_at_target,
  case when sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)) > 0
    then round((sum(coalesce((h.raw->>'PlantCount')::numeric,0)) / (sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0))/453.592))::numeric,1) end as plants_per_saleable_pound,
  case when sum(coalesce((h.raw->>'PlantCount')::numeric,0)) > 0
    then round((sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0))/453.592 / sum(coalesce((h.raw->>'PlantCount')::numeric,0)) * 453.592)::numeric,1) end as grams_per_plant
from metrc_harvests h
where h.harvest_start is not null
group by to_char(h.harvest_start,'YYYY-MM'), date_trunc('month', h.harvest_start)
order by month_date desc;

-- REAL LOSS: capacity that produced nothing, or product actually destroyed.
-- Normal trim waste is deliberately excluded - it is not a loss.
create or replace view v_real_loss as
-- 1. Planted but never harvested: plants that went inactive with no harvest weight
select 'Plant attrition' as loss_type,
  coalesce(p.strain,'not recorded') as scope,
  p.room as location,
  count(*)::numeric as units,
  'plants' as unit_label,
  null::numeric as pounds,
  'Plants retired without producing a harvest. This is capacity that cost money and returned nothing.' as why_it_is_a_loss,
  'Compare to plants harvested for the same strain. A high count means culls, disease or death.' as what_to_check
from metrc_plants p
where p.source_state = 'inactive'
  and not exists (
    select 1 from metrc_harvests h
    where coalesce(h.raw->>'SourceStrainNames','') ilike '%'||coalesce(p.strain,'~')||'%'
      and h.harvest_start between p.planted_on and p.planted_on + 200)
group by coalesce(p.strain,'not recorded'), p.room
having count(*) > 5
union all
-- 2. Yield below the room's own average: the real underperformance
select 'Yield underperformance',
  coalesce(h.raw->>'SourceStrainNames','not recorded'),
  coalesce(h.raw->>'DryingLocationName','(no room)'),
  1::numeric, 'harvest',
  round(((select avg(coalesce((h2.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h2.raw->>'TotalWetWeight')::numeric,0))
          from metrc_harvests h2 where coalesce((h2.raw->>'TotalWetWeight')::numeric,0) > 0)
         * coalesce((h.raw->>'TotalWetWeight')::numeric,0) / 453.592
         - coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/453.592)::numeric, 1),
  'This harvest produced fewer saleable pounds than the company average conversion would predict from its wet weight.',
  'Check drying and trim practice for this room, and whether the wet weight was recorded accurately.'
from metrc_harvests h
where coalesce((h.raw->>'TotalPackagedWeight')::numeric,0) > 0
  and coalesce((h.raw->>'TotalWetWeight')::numeric,0) > 0
  and (coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)/(h.raw->>'TotalWetWeight')::numeric)
      < 0.75 * (select avg(coalesce((h2.raw->>'TotalPackagedWeight')::numeric,0)/nullif((h2.raw->>'TotalWetWeight')::numeric,0))
                from metrc_harvests h2 where coalesce((h2.raw->>'TotalWetWeight')::numeric,0) > 0)
union all
-- 3. Finished product that failed testing - a true dollar loss
select 'Failed testing',
  coalesce(p.item_name,'(unnamed)'), coalesce(p.location,'(no location)'),
  1::numeric, 'package',
  round((coalesce(p.quantity,0)/453.592)::numeric,2),
  'Packaged product that failed laboratory testing. This is finished goods that cannot be sold - a real loss at full cost.',
  'Decide remediation or destruction and record it.'
from metrc_packages p
where p.lab_testing_state = 'TestFailed' and p.source_state in ('active','onhold')
union all
-- 4. Planned pulls that never happened - room time that produced nothing
select 'Missed pull',
  coalesce(pl.cultivars,'not recorded'), pl.flower_room,
  1::numeric, 'scheduled pull',
  round(coalesce(pl.proj_harvest_weight_lbs,0)::numeric,1),
  'A pull was scheduled and never recorded. If nothing else was planted in its place, that is a full cycle of room capacity earning nothing.',
  'Confirm whether the room was replanted. If it sat empty, that is the most expensive loss in cultivation.'
from harvest_pulls pl
where pl.harvest_date < current_date - 14
  and not exists (select 1 from metrc_harvests h where h.harvest_start between pl.harvest_date - 5 and pl.harvest_date + 21);

create or replace view v_real_loss_summary as
select loss_type, count(*)::numeric as occurrences,
  round(sum(coalesce(units,0))::numeric,0) as units,
  round(sum(coalesce(pounds,0))::numeric,1) as pounds_affected,
  round((sum(coalesce(pounds,0)) * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_at_target_cost,
  max(why_it_is_a_loss) as why_it_is_a_loss
from v_real_loss group by loss_type order by dollars_at_target_cost desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Sales & Cash', (select category_order from nav_registry where category='Sales & Cash' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('True Cost Per Pound', 8, 'dollar', 'true_cost_per_pound', 'v_true_cost_per_pound', 'How cost per pound is actually calculated: month by month, plants harvested, wet pounds, saleable pounds, the wet to saleable conversion, plants per saleable pound and grams per plant. Normal trim waste is already inside the cost per pound figure and is deliberately not charged again.'),
  ('Real Loss (not trim waste)', 9, 'shield', 'real_loss', 'v_real_loss', 'What is genuinely lost: plants retired without producing a harvest, harvests that converted far below the company average, packaged product that failed testing, and scheduled pulls that never happened. Routine stem and fan leaf waste is excluded because it is already inside the cost per pound.'),
  ('Real Loss Summary', 10, 'scale', 'real_loss_summary', 'v_real_loss_summary', 'Each kind of genuine loss with how often it happened, the pounds affected and what that represents at target cost - the number that actually belongs on a profit and loss discussion.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select loss_type, occurrences, units, pounds_affected, dollars_at_target_cost from v_real_loss_summary;;
