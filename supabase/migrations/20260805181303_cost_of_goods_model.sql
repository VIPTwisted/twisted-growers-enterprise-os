-- Owner-set cost model. $1,100 per pound to grow is the starting figure and it
-- fluctuates with payroll, so every component is editable and effective-dated.
create table if not exists cost_model (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null default current_date,
  scope text not null default 'cultivation' check (scope in ('cultivation','manufacturing','company')),
  cost_per_pound numeric,
  labor_per_pound numeric,
  utilities_per_pound numeric,
  nutrients_supplies_per_pound numeric,
  packaging_per_pound numeric,
  overhead_per_pound numeric,
  note text,
  set_by text,
  created_at timestamptz default now()
);
alter table cost_model enable row level security;
drop policy if exists cm_read on cost_model;
drop policy if exists cm_write on cost_model;
create policy cm_read on cost_model for select to authenticated using (true);
create policy cm_write on cost_model for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));
insert into cost_model (effective_from, scope, cost_per_pound, note, set_by)
select current_date, 'cultivation', 1100,
  'Owner-stated starting figure: approximately 1,100 dollars per pound to grow. Fluctuates with payroll and other factors - break it into labour, utilities, nutrients and supplies, packaging and overhead as those numbers are confirmed.',
  'owner'
where not exists (select 1 from cost_model where scope = 'cultivation');

-- What every pound of waste actually costs, by room and strain.
create or replace view v_cost_of_loss as
select l.scope_type, l.scope, l.harvests, l.wet_lbs, l.waste_lbs, l.waste_pct, l.yield_pct, l.verdict,
  (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1) as cost_per_pound,
  round((l.waste_lbs * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric, 0) as cost_of_waste,
  round(((l.waste_pct - (select round((100.0*sum(coalesce((raw->>'TotalWasteWeight')::numeric,0))/nullif(sum(coalesce((raw->>'TotalWetWeight')::numeric,0)),0))::numeric,1) from metrc_harvests))
        / 100.0 * l.wet_lbs * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric, 0) as excess_cost_vs_company_average
from v_loss_ranking l
where l.wet_lbs > 0
order by cost_of_waste desc nulls last;

-- Bottom line per harvest: what it cost to grow versus what came out.
create or replace view v_harvest_economics as
select m.harvest, m.strains as strain, m.room, m.harvest_start,
  m.plants, round(coalesce(m.wet_weight,0)/453.592, 1) as wet_lbs,
  round(coalesce(m.packaged_weight,0)/453.592, 1) as packaged_lbs,
  round(coalesce(m.waste_weight,0)/453.592, 1) as waste_lbs,
  m.waste_pct, m.yield_pct,
  (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1) as cost_per_pound,
  round((coalesce(m.wet_weight,0)/453.592 * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric, 0) as cost_to_grow,
  round((coalesce(m.waste_weight,0)/453.592 * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric, 0) as cost_lost_to_waste,
  case when coalesce(m.packaged_weight,0) > 0
    then round(((coalesce(m.wet_weight,0)/453.592 * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))
                / (coalesce(m.packaged_weight,0)/453.592))::numeric, 0) end as true_cost_per_saleable_pound,
  m.stage
from v_harvest_stage_map m
where coalesce(m.wet_weight,0) > 0
order by m.harvest_start desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Sales & Cash', (select category_order from nav_registry where category='Sales & Cash' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, v.adm, false
from (values
  ('Cost Model (per pound)', 5, 'dollar', 'cost_model', 'cost_model', 'The cost to grow a pound, effective dated: total per pound plus the labour, utilities, nutrients and supplies, packaging and overhead components. Change it here and every cost and loss figure in the operating system updates.', true),
  ('Cost of Loss', 6, 'scale', 'cost_of_loss', 'v_cost_of_loss', 'What waste actually costs in dollars by room and strain, and how much of that is excess above the company average - the real price of the worst performing rooms.', false),
  ('Harvest Economics', 7, 'gauge', 'harvest_economics', 'v_harvest_economics', 'Per harvest: what it cost to grow, what was lost to waste in dollars, and the true cost per saleable pound after waste and yield are taken into account.', false)
) v(l, io, ic, vk, tr, d, adm)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select scope_type, scope, waste_lbs, waste_pct, cost_of_waste, excess_cost_vs_company_average from v_cost_of_loss limit 6;;
