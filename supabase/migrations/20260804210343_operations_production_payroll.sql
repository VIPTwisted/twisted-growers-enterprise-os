-- TG Enterprise OS — 0003 Operations (CODE-002/003/007/008/009 + REQUIREMENT #1 payroll view)

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  state_license text,
  terms_days int not null default 30,
  credit_limit numeric(12,2),
  active boolean not null default true
);

create table sales_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  customer_id uuid not null references customers(id),
  kind text not null default 'firm',
  ordered_on date not null default current_date,
  requested_ship_on date,
  promised_ship_on date,
  status text not null default 'open',
  owner_id uuid references employees(id),
  risk text not null default 'normal',
  note text
);

create table sales_order_lines (
  id uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_orders(id),
  sku_id uuid not null references skus(id),
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(10,2) not null default 0,
  discount_pct numeric(5,4) not null default 0
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_code text not null unique,
  sku_id uuid references skus(id),
  product_family_id uuid references product_families(id),
  sales_order_id uuid references sales_orders(id),
  planned_qty numeric(12,2) not null default 0,
  actual_qty numeric(12,2),
  planned_start date,
  planned_finish date,
  actual_start date,
  actual_finish date,
  status wo_status not null default 'draft',
  released_by uuid references employees(id),
  released_at timestamptz,
  note text
);
alter table allocations add constraint allocations_wo_fk foreign key (work_order_id) references work_orders(id);

create or replace function enforce_wo_release_gate() returns trigger
language plpgsql as $$
begin
  if new.status in ('released','in_production')
     and not exists (select 1 from allocations a
                     where a.work_order_id = new.id and a.release = 'released') then
    raise exception 'Work order % cannot be released: no released material allocation', new.wo_code;
  end if;
  return new;
end $$;
create trigger wo_release_gate before update of status on work_orders
  for each row execute function enforce_wo_release_gate();

create table work_order_stages (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id),
  seq int not null,
  stage text not null,
  department_id uuid references departments(id),
  planned_date date,
  actual_date date,
  planned_units numeric(12,2),
  actual_units numeric(12,2),
  planned_hours numeric(8,2),
  actual_hours numeric(8,2),
  status text not null default 'planned',
  unique (work_order_id, seq)
);

create table schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  shift text not null default 'Day',
  department_id uuid not null references departments(id),
  work_order_stage_id uuid references work_order_stages(id),
  task text,
  planned_hours numeric(5,2) not null default 8,
  status text not null default 'scheduled',
  approved_by uuid references employees(id),
  unique (employee_id, work_date, shift)
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  clock_in timestamptz,
  clock_out timestamptz,
  unpaid_lunch_min int not null default 30,
  productive_hours numeric(5,2),
  exception_code text,
  approved_by uuid references employees(id),
  payroll_exported boolean not null default false,
  unique (employee_id, work_date),
  check (clock_out is null or clock_in is null or clock_out > clock_in)
);

create or replace view v_payroll_week as
select e.id as employee_id,
       e.full_name,
       date_trunc('week', t.work_date)::date as week_start,
       sum(t.productive_hours) as hours,
       r.basis, r.rate, r.ot_multiplier, r.burden_pct,
       case when r.basis = 'weekly_salary' then r.rate
            else least(sum(t.productive_hours), 40) * r.rate
               + greatest(sum(t.productive_hours) - 40, 0) * r.rate * r.ot_multiplier
       end * (1 + r.burden_pct) as loaded_weekly_cost
from time_entries t
join employees e on e.id = t.employee_id
join employee_rates r on r.employee_id = e.id
  and t.work_date >= r.effective_from
  and (r.effective_to is null or t.work_date <= r.effective_to)
group by e.id, e.full_name, date_trunc('week', t.work_date), r.basis, r.rate, r.ot_multiplier, r.burden_pct;

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_code text not null unique,
  vendor_id uuid not null references vendors(id),
  ordered_on date not null default current_date,
  required_on date,
  promised_on date,
  received_on date,
  status text not null default 'open',
  approved_by uuid references employees(id),
  note text
);

create table purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id),
  description text not null,
  sku_id uuid references skus(id),
  qty numeric(14,3) not null,
  uom text not null default 'each',
  unit_cost numeric(12,4) not null default 0,
  received_good numeric(14,3) not null default 0,
  received_damaged numeric(14,3) not null default 0,
  received_short numeric(14,3) not null default 0,
  lot_id uuid references lots(id)
);

create table overhead_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text not null,
  monthly_amount numeric(12,2) not null,
  is_280e_cogs boolean not null default false,
  effective_from date not null,
  effective_to date,
  vendor_id uuid references vendors(id)
);

create table cash_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of date not null unique,
  unrestricted_cash numeric(14,2) not null,
  evidence_url text,
  entered_by uuid references employees(id),
  created_at timestamptz not null default now()
);

create table licenses (
  id uuid primary key default gen_random_uuid(),
  license_number text not null unique,
  license_type text not null,
  holder text not null,
  regulator text not null default 'MA CCC',
  issued_on date,
  expires_on date not null,
  status text not null default 'active',
  renewal_owner uuid references employees(id),
  evidence_url text
);

create table shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_code text not null unique,
  sales_order_id uuid not null references sales_orders(id),
  metrc_manifest text,
  carrier text,
  driver text,
  vehicle text,
  scheduled_ship_on date,
  actual_ship_at timestamptz,
  requested_delivery_on date,
  actual_delivery_at timestamptz,
  status text not null default 'open'
);

create table shipment_lines (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references shipments(id),
  lot_id uuid not null references lots(id),
  qty numeric(12,2) not null check (qty > 0)
);

create or replace function enforce_ship_gate() returns trigger
language plpgsql as $$
declare s lot_status; code text;
begin
  select status, lot_code into s, code from lots where id = new.lot_id;
  if s not in ('ready_to_ship','shipped') then
    raise exception 'Lot % cannot ship: status is %, requires ready_to_ship', code, s;
  end if;
  return new;
end $$;
create trigger shipment_lines_gate before insert on shipment_lines
  for each row execute function enforce_ship_gate();

create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_code text not null unique,
  sales_order_id uuid not null references sales_orders(id),
  issued_on date not null default current_date,
  due_on date not null,
  amount numeric(12,2) not null,
  paid_on date,
  paid_amount numeric(12,2),
  status text not null default 'open'
);

create trigger audit_work_orders after insert or update or delete on work_orders
  for each row execute function audit_row();
create trigger audit_shipments after insert or update or delete on shipments
  for each row execute function audit_row();
create trigger audit_cash after insert or update or delete on cash_snapshots
  for each row execute function audit_row();
create trigger audit_licenses after insert or update or delete on licenses
  for each row execute function audit_row();

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('customers','sales_orders','sales_order_lines','work_orders','work_order_stages',
                             'schedule_assignments','time_entries','purchase_orders','purchase_order_lines',
                             'overhead_items','cash_snapshots','licenses','shipments','shipment_lines','invoices')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;;
