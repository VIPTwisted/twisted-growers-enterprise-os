-- What each finished product earns per gram of input, and what the market is asking for.
create table if not exists product_economics (
  id uuid primary key default gen_random_uuid(),
  product_route text not null unique,
  product_family text,
  input_grams_per_unit numeric not null check (input_grams_per_unit > 0),
  sell_price_per_unit numeric not null,
  packaging_cost_per_unit numeric default 0,
  labor_cost_per_unit numeric default 0,
  other_cost_per_unit numeric default 0,
  yield_pct numeric default 100 check (yield_pct > 0),
  cycle_days numeric,
  active boolean default true,
  note text,
  updated_at timestamptz default now()
);
create table if not exists demand_signals (
  id uuid primary key default gen_random_uuid(),
  product_route text not null,
  period_start date not null default current_date,
  period_end date,
  units_demanded numeric not null default 0,
  units_committed numeric default 0,
  source text default 'manual' check (source in ('manual','sales_order','forecast','sheet_sync')),
  note text,
  created_at timestamptz default now()
);
alter table product_economics enable row level security;
alter table demand_signals enable row level security;
create policy pe_read on product_economics for select to authenticated using (true);
create policy ds_read on demand_signals for select to authenticated using (true);
create policy pe_write on product_economics for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create policy ds_write on demand_signals for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));

-- Gross margin per gram of input, ranked. Honest empty state until economics are entered.
create or replace view v_route_margin as
select
  e.product_route, e.product_family,
  e.sell_price_per_unit,
  (e.packaging_cost_per_unit + e.labor_cost_per_unit + e.other_cost_per_unit) as conversion_cost_per_unit,
  (e.sell_price_per_unit - e.packaging_cost_per_unit - e.labor_cost_per_unit - e.other_cost_per_unit) as contribution_per_unit,
  e.input_grams_per_unit, e.yield_pct,
  round(((e.sell_price_per_unit - e.packaging_cost_per_unit - e.labor_cost_per_unit - e.other_cost_per_unit)
        / (e.input_grams_per_unit / (e.yield_pct / 100.0)))::numeric, 4) as margin_per_input_gram,
  case when e.sell_price_per_unit > 0
    then round(100.0 * (e.sell_price_per_unit - e.packaging_cost_per_unit - e.labor_cost_per_unit - e.other_cost_per_unit)
      / e.sell_price_per_unit, 1) end as gross_margin_pct,
  e.cycle_days,
  coalesce(d.units_demanded, 0) as units_demanded,
  coalesce(d.units_committed, 0) as units_committed,
  greatest(coalesce(d.units_demanded, 0) - coalesce(d.units_committed, 0), 0) as units_open,
  round((greatest(coalesce(d.units_demanded, 0) - coalesce(d.units_committed, 0), 0)
        * e.input_grams_per_unit / (e.yield_pct / 100.0))::numeric, 1) as grams_needed_for_open_demand,
  e.active
from product_economics e
left join lateral (
  select sum(units_demanded) units_demanded, sum(units_committed) units_committed
  from demand_signals s
  where s.product_route = e.product_route
    and (s.period_end is null or s.period_end >= current_date)
) d on true
where e.active
order by margin_per_input_gram desc nulls last;

-- The recommendation: rank routes by margin, capped by real open demand, against available input.
create or replace function tg_allocation_plan(p_grams numeric)
returns table(
  rank int, product_route text, product_family text,
  margin_per_input_gram numeric, gross_margin_pct numeric,
  units_open numeric, grams_needed_for_open_demand numeric,
  recommended_grams numeric, recommended_units numeric, projected_contribution numeric, basis text
) as $$
declare r record; remaining numeric := coalesce(p_grams, 0); i int := 0; take numeric;
begin
  for r in select * from v_route_margin loop
    exit when remaining <= 0;
    i := i + 1;
    take := least(remaining, nullif(r.grams_needed_for_open_demand, 0));
    if take is null then take := 0; end if;
    rank := i;
    product_route := r.product_route; product_family := r.product_family;
    margin_per_input_gram := r.margin_per_input_gram; gross_margin_pct := r.gross_margin_pct;
    units_open := r.units_open; grams_needed_for_open_demand := r.grams_needed_for_open_demand;
    recommended_grams := take;
    recommended_units := case when r.input_grams_per_unit > 0
      then floor(take * (r.yield_pct / 100.0) / r.input_grams_per_unit) else 0 end;
    projected_contribution := round((take * r.margin_per_input_gram)::numeric, 2);
    basis := case
      when take = 0 and r.units_open = 0 then 'No open demand recorded - nothing allocated'
      when take < r.grams_needed_for_open_demand then 'Supply ran out at this rank'
      else 'Full open demand covered' end;
    remaining := remaining - take;
    return next;
  end loop;
end $$ language plpgsql stable;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Inventory', (select category_order from nav_registry where category='Inventory' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Margin by Route', 13, 'dollar', 'route_margin', 'v_route_margin', 'What every gram earns by product route: contribution per unit, gross margin percentage, margin per input gram, and open demand still uncovered - ranked highest earning first.'),
  ('Product Economics', 14, 'gauge', 'product_economics', 'product_economics', 'The inputs behind every margin: grams per unit, sell price, packaging, labor, other cost, yield percentage, and cycle days per product route.'),
  ('Demand Signals', 15, 'truck', 'demand_signals', 'demand_signals', 'What the market is asking for by product route and period, and how much of it is already committed.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
