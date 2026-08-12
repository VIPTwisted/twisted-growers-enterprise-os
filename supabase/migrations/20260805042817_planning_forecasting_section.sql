-- 0014: Planning & Forecasting top-level section
-- Live views computed from loaded data + planning tables for demand/SKU/hiring

create or replace view v_production_forecast with (security_invoker = true) as
select
  to_char(date_trunc('month', projected_availability), 'YYYY-MM') as month,
  count(*) as harvest_events,
  count(distinct harvest_date) as harvests,
  count(distinct flower_room) as rooms,
  sum(plants) as plants,
  round(sum(projected_weight_lbs)::numeric, 1) as projected_lbs,
  round(sum(fresh_frozen_lbs)::numeric, 1) as fresh_frozen_lbs,
  round(sum(flower_after_ff_lbs)::numeric, 1) as flower_lbs_after_ff
from harvest_schedule
where projected_availability is not null
group by 1
order by 1;

-- Forward payroll cost from ACTUAL effective-dated per-employee rates x planned hours,
-- mirroring v_payroll_week's exact OT + burden math (>40h at ot_multiplier, x(1+burden_pct))
create or replace view v_payroll_forecast with (security_invoker = true) as
select
  e.employee_code,
  e.full_name,
  d.name as department,
  e.tier,
  r.basis,
  r.rate,
  coalesce(e.weekly_target_hours, 40) as planned_hours,
  round(b.base::numeric, 2) as base_weekly_cost,
  round((b.base * (1 + r.burden_pct))::numeric, 2) as loaded_weekly_cost,
  round((b.base * (1 + r.burden_pct) * 52)::numeric, 0) as annualized_loaded_cost
from employees e
join lateral (
  select * from employee_rates r
  where r.employee_id = e.id
    and r.effective_from <= current_date
    and (r.effective_to is null or r.effective_to >= current_date)
  order by r.effective_from desc
  limit 1
) r on true
cross join lateral (
  select case when r.basis = 'weekly_salary' then r.rate
    else least(coalesce(e.weekly_target_hours, 40), 40) * r.rate
       + greatest(coalesce(e.weekly_target_hours, 40) - 40, 0) * r.rate * r.ot_multiplier
  end as base
) b
left join departments d on d.id = e.primary_department_id
where e.terminated_on is null;

create table if not exists demand_forecasts (
  id uuid primary key default gen_random_uuid(),
  product_family_id uuid references product_families(id),
  sku_id uuid references skus(id),
  week_start date not null,
  forecast_units numeric,
  forecast_revenue numeric,
  method text,
  note text,
  created_at timestamptz not null default now()
);
alter table demand_forecasts enable row level security;
create policy staff_read on demand_forecasts for select to authenticated using (true);
create policy exec_all on demand_forecasts for all using (is_executive()) with check (is_executive());
create index if not exists idx_demand_forecasts_week on demand_forecasts (week_start);
create trigger audit_demand_forecasts after insert or update or delete on demand_forecasts
  for each row execute function audit_row();

create table if not exists portfolio_targets (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  target_active_skus integer,
  min_units_per_sku numeric,
  note text,
  created_at timestamptz not null default now()
);
alter table portfolio_targets enable row level security;
create policy staff_read on portfolio_targets for select to authenticated using (true);
create policy exec_all on portfolio_targets for all using (is_executive()) with check (is_executive());
create trigger audit_portfolio_targets after insert or update or delete on portfolio_targets
  for each row execute function audit_row();

create table if not exists hiring_plan (
  id uuid primary key default gen_random_uuid(),
  role_title text not null,
  department_id uuid references departments(id),
  seats_needed integer not null default 1,
  seats_filled integer not null default 0,
  target_start date,
  target_rate numeric,
  rate_basis text,
  status text not null default 'open'
    check (status in ('open','interviewing','offer','filled','paused','cancelled')),
  note text,
  created_at timestamptz not null default now()
);
alter table hiring_plan enable row level security;
create policy staff_read on hiring_plan for select to authenticated using (true);
create policy exec_all on hiring_plan for all using (is_executive()) with check (is_executive());
create trigger audit_hiring_plan after insert or update or delete on hiring_plan
  for each row execute function audit_row();

-- Insert the section right after Command; everything else shifts down one
update nav_registry set category_order = category_order + 1 where category_order >= 1;
insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('Planning & Forecasting', 1, 0, 'plan_production', 'Production Forecast', 'v_production_forecast', null, 'gauge',
   'Monthly forward production computed live from the harvest calendar: events, plants, projected pounds, fresh-frozen splits - by availability month.', true, '#e2bd63'),
  ('Planning & Forecasting', 1, 1, 'plan_payroll', 'Payroll Forecast', 'v_payroll_forecast', null, 'dollar',
   'Forward weekly and annualized labor cost per employee at actual effective-dated rates - identical OT and burden math to actual payroll.', true, '#e2bd63'),
  ('Planning & Forecasting', 1, 2, 'plan_demand', 'Demand Forecast', 'demand_forecasts', 'M3', 'clock',
   '13-week rolling demand per product family and SKU - units and revenue, feeding S&OP and the production plan.', true, '#e2bd63'),
  ('Planning & Forecasting', 1, 3, 'plan_products', 'Product & SKU Targets', 'portfolio_targets', 'M3', 'box',
   'Portfolio planning: target active SKUs and minimum units per category, gap-checked against live SKU actuals.', true, '#e2bd63'),
  ('Planning & Forecasting', 1, 4, 'plan_hiring', 'Staffing & Hiring Plan', 'hiring_plan', 'M3', 'users',
   'Position plan: seats needed vs filled per role and department, target start dates and rates - the forward staffing picture.', true, '#e2bd63'),
  ('Planning & Forecasting', 1, 5, 'plan_capacity', 'Capacity Plan', null, 'M3', 'scale',
   'Machine and shift capacity math: effective weekly hours and units per line, physical daily ceilings, changeover and OEE - the constraint check for every schedule.', true, '#e2bd63')
on conflict do nothing;;
