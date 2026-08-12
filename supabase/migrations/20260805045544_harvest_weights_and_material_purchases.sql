-- 0016: Sheet-34 harvest weight/grading/mass-balance + Sheet-13 purchased-material capital tracker

create table if not exists harvest_weights (
  id uuid primary key default gen_random_uuid(),
  harvest_record_id text unique,
  harvest_date date not null,
  flower_room text,
  cultivar text,
  plants integer,
  actual_wet_lb numeric,
  actual_dry_input_lb numeric,
  grade_a_lb numeric,
  grade_b_lb numeric,
  grade_c_smalls_lb numeric,
  trim_lb numeric,
  fresh_frozen_dry_eq_lb numeric,
  extraction_only_lb numeric,
  samples_retain_lb numeric,
  waste_destruction_lb numeric,
  canopy_sqft numeric,
  metrc_harvest_batch text,
  qa_release_status text,
  status text,
  entered_by text,
  verified_by text,
  verified_date date,
  note text,
  created_at timestamptz not null default now()
);
alter table harvest_weights enable row level security;
create policy staff_read on harvest_weights for select to authenticated using (true);
create policy staff_insert on harvest_weights for insert to authenticated with check (true);
create policy exec_all on harvest_weights for all using (is_executive()) with check (is_executive());
create trigger audit_harvest_weights after insert or update or delete on harvest_weights
  for each row execute function audit_row();

-- The sheet's exact mass-balance math, live
create or replace view v_harvest_mass_balance with (security_invoker = true) as
select
  harvest_date, flower_room, cultivar,
  actual_wet_lb, actual_dry_input_lb,
  grade_a_lb, grade_b_lb, grade_c_smalls_lb, trim_lb,
  fresh_frozen_dry_eq_lb, extraction_only_lb, samples_retain_lb, waste_destruction_lb,
  round((coalesce(grade_a_lb,0)+coalesce(grade_b_lb,0)+coalesce(grade_c_smalls_lb,0)+coalesce(trim_lb,0)
       + coalesce(fresh_frozen_dry_eq_lb,0)+coalesce(extraction_only_lb,0)+coalesce(samples_retain_lb,0)
       + coalesce(waste_destruction_lb,0))::numeric, 3) as total_accounted_lb,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((actual_dry_input_lb
       - (coalesce(grade_a_lb,0)+coalesce(grade_b_lb,0)+coalesce(grade_c_smalls_lb,0)+coalesce(trim_lb,0)
        + coalesce(fresh_frozen_dry_eq_lb,0)+coalesce(extraction_only_lb,0)+coalesce(samples_retain_lb,0)
        + coalesce(waste_destruction_lb,0)))::numeric, 3) end as unaccounted_variance_lb,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0
       * (coalesce(grade_a_lb,0)+coalesce(grade_b_lb,0)+coalesce(grade_c_smalls_lb,0)+coalesce(trim_lb,0)
        + coalesce(fresh_frozen_dry_eq_lb,0)+coalesce(extraction_only_lb,0)+coalesce(samples_retain_lb,0)
        + coalesce(waste_destruction_lb,0)) / actual_dry_input_lb)::numeric, 1) end as mass_balance_pct,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0
       * (coalesce(grade_a_lb,0)+coalesce(grade_b_lb,0)+coalesce(grade_c_smalls_lb,0)+coalesce(trim_lb,0)
        + coalesce(fresh_frozen_dry_eq_lb,0)+coalesce(extraction_only_lb,0)+coalesce(samples_retain_lb,0))
       / actual_dry_input_lb)::numeric, 1) end as saleable_yield_pct,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0*coalesce(grade_a_lb,0)/actual_dry_input_lb)::numeric,1) end as grade_a_pct,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0*coalesce(grade_b_lb,0)/actual_dry_input_lb)::numeric,1) end as grade_b_pct,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0*coalesce(grade_c_smalls_lb,0)/actual_dry_input_lb)::numeric,1) end as grade_c_pct,
  case when coalesce(actual_dry_input_lb,0) > 0 then round((100.0*coalesce(trim_lb,0)/actual_dry_input_lb)::numeric,1) end as trim_pct,
  case when coalesce(canopy_sqft,0) > 0 and coalesce(actual_dry_input_lb,0) > 0
       then round((actual_dry_input_lb*453.592/canopy_sqft)::numeric,1) end as actual_g_sqft,
  metrc_harvest_batch, qa_release_status, status, entered_by, verified_by, verified_date
from harvest_weights
order by harvest_date desc;

create table if not exists material_purchases (
  id uuid primary key default gen_random_uuid(),
  lot_code text unique,
  supplier text,
  po_invoice text,
  material_type text check (material_type in ('trim','flower','concentrate','distillate','fresh_frozen','packaging','other')),
  strain_description text,
  purchase_date date,
  received_date date,
  uom text,
  purchased_qty numeric,
  unit_cost numeric,
  freight numeric,
  other_landed_cost numeric,
  allocated_qty numeric not null default 0,
  work_order text,
  allocation_date date,
  production_complete date,
  fg_release_date date,
  first_sale_date date,
  cash_collected_date date,
  revenue_from_lot numeric,
  status text not null default 'On Hand',
  note text,
  created_at timestamptz not null default now()
);
alter table material_purchases enable row level security;
create policy staff_read on material_purchases for select to authenticated using (true);
create policy staff_insert on material_purchases for insert to authenticated with check (true);
create policy exec_all on material_purchases for all using (is_executive()) with check (is_executive());
create trigger audit_material_purchases after insert or update or delete on material_purchases
  for each row execute function audit_row();

insert into configurations (key, value)
values ('material_aging_alert_days', '{"days": 30, "note": "Purchased material still unallocated after this many days flags CAPITAL TIED UP. Admin-editable."}'::jsonb)
on conflict (key) do nothing;

-- The sheet's exact working-capital math, live
create or replace view v_material_aging with (security_invoker = true) as
select
  m.lot_code, m.supplier, m.material_type, m.strain_description,
  m.purchase_date, m.received_date, m.uom, m.purchased_qty, m.unit_cost,
  round((coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0))::numeric,2) as total_landed_cost,
  case when coalesce(m.purchased_qty,0) > 0 then round(((coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0))/m.purchased_qty)::numeric,4) end as landed_cost_per_uom,
  m.allocated_qty,
  greatest(coalesce(m.purchased_qty,0) - coalesce(m.allocated_qty,0), 0) as available_qty,
  m.work_order, m.allocation_date,
  case when m.purchase_date is not null and m.allocation_date is not null then m.allocation_date - m.purchase_date end as days_to_allocation,
  case when m.purchase_date is not null and m.fg_release_date is not null then m.fg_release_date - m.purchase_date end as days_purchase_to_release,
  case when m.purchase_date is not null and m.cash_collected_date is not null then m.cash_collected_date - m.purchase_date end as days_purchase_to_cash,
  m.revenue_from_lot,
  case when coalesce(m.revenue_from_lot,0) > 0 then round((m.revenue_from_lot - (coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0)))::numeric,2) end as gross_return,
  case when coalesce(m.revenue_from_lot,0) > 0 and (coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0)) > 0
       then round((100.0*(m.revenue_from_lot-(coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0)))
            /(coalesce(m.purchased_qty,0)*coalesce(m.unit_cost,0)+coalesce(m.freight,0)+coalesce(m.other_landed_cost,0)))::numeric,1) end as roi_pct,
  case when m.purchase_date is not null then current_date - m.purchase_date end as aging_days,
  case when greatest(coalesce(m.purchased_qty,0)-coalesce(m.allocated_qty,0),0) > 0
        and m.purchase_date is not null
        and current_date - m.purchase_date > coalesce((select (value->>'days')::int from configurations where key='material_aging_alert_days'), 30)
       then 'CAPITAL TIED UP' else 'OK' end as aging_alert,
  m.status
from material_purchases m
order by m.purchase_date desc nulls last;

-- Weights & Grading menu item now serves the full mass-balance picture
update nav_registry set table_ref = 'v_harvest_mass_balance',
  description = 'Reported weights per harvest and cultivar: wet, dry input, Grade A/B/C buds, trim, fresh frozen, extraction-only, samples, waste/destruction - with live mass-balance %, saleable yield %, grade splits, and unaccounted-variance flags. Exact Sheet-34 math.'
where view_key = 'grading';

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Inventory', 5, 10, 'materials', 'Material Purchases & Aging', 'v_material_aging', null, 'dollar',
  'Everything we buy - trim, flower, concentrates, packaging: purchase and received dates, landed cost, allocation, days purchase-to-production/sale/cash, ROI, and CAPITAL TIED UP alerts when unallocated material sits past the admin-set threshold. Exact Sheet-13 math.', true, '#00d4ff')
on conflict do nothing;

select 'v_harvest_mass_balance' as view, count(*) from v_harvest_mass_balance
union all select 'v_material_aging', count(*) from v_material_aging;;
