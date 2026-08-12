-- 0019: customer & supplier books - notes, terms, cost comparison
create table if not exists customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id),
  category text not null default 'general'
    check (category in ('general','order','terms','credit','complaint','opportunity')),
  note text not null,
  author_id uuid,
  created_at timestamptz not null default now()
);
alter table customer_notes enable row level security;
create policy staff_read on customer_notes for select to authenticated using (true);
create policy exec_all on customer_notes for all using (is_executive()) with check (is_executive());
create trigger audit_customer_notes after insert or update or delete on customer_notes
  for each row execute function audit_row();

create table if not exists vendor_notes (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references vendors(id),
  category text not null default 'general'
    check (category in ('general','pricing','terms','quality','delivery','order')),
  note text not null,
  author_id uuid,
  created_at timestamptz not null default now()
);
alter table vendor_notes enable row level security;
create policy staff_read on vendor_notes for select to authenticated using (true);
create policy exec_all on vendor_notes for all using (is_executive()) with check (is_executive());
create trigger audit_vendor_notes after insert or update or delete on vendor_notes
  for each row execute function audit_row();

alter table vendors add column if not exists terms_days integer;
alter table vendors add column if not exists payment_terms text;

-- Who has the best cost, live from purchase history
create or replace view v_supplier_costs with (security_invoker = true) as
with buys as (
  select supplier, material_type,
    count(*) as purchases,
    sum(purchased_qty) as total_qty,
    round(avg((coalesce(purchased_qty,0)*coalesce(unit_cost,0)+coalesce(freight,0)+coalesce(other_landed_cost,0))
      / nullif(purchased_qty,0))::numeric, 4) as avg_landed_cost_per_uom,
    round(min((coalesce(purchased_qty,0)*coalesce(unit_cost,0)+coalesce(freight,0)+coalesce(other_landed_cost,0))
      / nullif(purchased_qty,0))::numeric, 4) as best_landed_cost_per_uom,
    max(purchase_date) as last_purchase
  from material_purchases
  where purchased_qty > 0
  group by supplier, material_type
)
select b.material_type, b.supplier,
  b.purchases, b.total_qty, b.avg_landed_cost_per_uom, b.best_landed_cost_per_uom, b.last_purchase,
  case when b.avg_landed_cost_per_uom = min(b.avg_landed_cost_per_uom) over (partition by b.material_type)
       then 'BEST COST' end as cost_rank,
  v.payment_terms, v.terms_days, v.approved
from buys b
left join vendors v on lower(v.name) = lower(b.supplier)
order by b.material_type, b.avg_landed_cost_per_uom nulls last;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('Sales & Cash', 9, 5, 'customers', 'Customers', 'customers', null, 'users',
   'The customer book: licenses, terms, credit limits - with notes (orders, terms, complaints, opportunities) behind each account for the sales director.', true, '#e2bd63'),
  ('Sales & Cash', 9, 6, 'suppliers', 'Suppliers & Costs', 'v_supplier_costs', null, 'truck',
   'Supplier comparison computed live from purchase history: average and best landed cost per unit by material, BEST COST flags, terms, last purchase - who to buy from and why.', true, '#e2bd63')
on conflict do nothing;

insert into actions_register (title, priority, source, note, status) values
('Customer & supplier detail pages with note entry, permission-gated', 'P0', 'owner_directive',
 'Owner 2026-08-05: sales director (and permitted roles) needs customer pages with notes and supplier pages with notes, cost comparison, terms, order notes. Tables customer_notes/vendor_notes + v_supplier_costs live; needs detail-page UI with note entry, gated by the RBAC layer.', 'open')
on conflict do nothing;;
