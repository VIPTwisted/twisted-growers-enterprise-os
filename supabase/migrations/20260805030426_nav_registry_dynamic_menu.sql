-- 0011 Dynamic navigation: the menu is DATA (Law #4). Categories → items, ordered,
-- icon by name, live-count table refs, milestone tags. Editing these rows reshapes the app.
create table nav_registry (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  category_order int not null default 0,
  label text not null,
  item_order int not null default 0,
  icon text not null default 'gauge',
  view_key text not null unique,
  table_ref text,
  milestone text,
  description text,
  enabled boolean not null default true
);
alter table nav_registry enable row level security;
create policy exec_all on nav_registry for all using (is_executive()) with check (is_executive());

alter table user_settings add column sidebar_collapsed boolean not null default false;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, milestone, description) values
('Command', 0, 'Control Tower', 0, 'gauge', 'tower', null, null, 'Executive exception board — every number computed live.'),
('Cultivation', 1, 'Grow Rooms', 0, 'leafline', 'grow_rooms', 'grow_rooms', 'M2', 'Rooms F1–F4: capacity, cycles, milestones, environmental hooks.'),
('Cultivation', 1, 'Harvests', 1, 'scale', 'harvests', 'harvests', 'M2', 'Harvest events, wet→dry chain, grading, mass balance.'),
('Cultivation', 1, 'Genetics', 2, 'dna', 'genetics', 'cultivars', 'M2', 'Cultivar registry with aliases; scoring once actuals flow.'),
('Inventory', 2, 'Lots & Tags', 0, 'box', 'lots', 'lots', 'M2', 'Every lot with full Metrc tag, COA link, expiry, location.'),
('Inventory', 2, 'SKUs', 1, 'clip', 'skus', 'skus', 'M2', 'Sellable catalog with min/target/max and replenishment triggers.'),
('Inventory', 2, 'Allocations', 2, 'shield', 'allocations', 'allocations', 'M3', 'Vincent''s gate: request → approve → release, netted per lot.'),
('Inventory', 2, 'Vendors & POs', 3, 'truck', 'purchasing', 'purchase_orders', 'M3', 'Suppliers, purchase orders, receiving quality, scorecards.'),
('Production', 3, 'Work Orders', 0, 'gauge', 'work_orders', 'work_orders', 'M3', 'Stage-routed production with release gates and actuals.'),
('Production', 3, 'Machines', 1, 'gear', 'machines', 'machines', 'M2', 'The floor registry: real paces, crew limits, rate basis.'),
('Production', 3, 'Scheduling', 2, 'clock', 'scheduling', 'schedule_assignments', 'M3', 'Demand-driven boards: quota-capped, crew-pod, pull-budgeted.'),
('Quality', 4, 'Testing & COA', 0, 'flask', 'testing', 'test_requests', 'M2', 'COA registry and calendar; nothing ships without a passing COA.'),
('Quality', 4, 'Metrc Mirror', 1, 'plug', 'metrc_mirror', 'metrc_packages', null, 'The full state picture: packages, plants, harvests, transfers, sales.'),
('Quality', 4, 'Licenses', 2, 'shield', 'licenses', 'licenses', 'M2', 'License register with renewal countdowns and evidence.'),
('People', 5, 'Employees', 0, 'users', 'people', 'employees', null, 'Roster, roles, tiers, per-employee rates — effective-dated, audited.'),
('People', 5, 'Time & Attendance', 1, 'clock', 'time', 'time_entries', 'M3', 'Punches, productive hours, OT — feeding real payroll accrual.'),
('People', 5, 'Payroll', 2, 'dollar', 'payroll', 'employee_rates', 'M2', 'Per-employee actual rates rolling up to true labor cost.'),
('Sales & Cash', 6, 'Orders', 0, 'clip', 'orders', 'sales_orders', 'M3', 'Firm orders and forecasts — no off-system promises.'),
('Sales & Cash', 6, 'Shipping', 1, 'truck', 'shipping', 'shipments', 'M3', 'Manifested shipments, OTIF, chain of custody.'),
('Sales & Cash', 6, 'Cash & Overhead', 2, 'dollar', 'cash', 'cash_snapshots', 'M2', 'Weekly cash truth, overhead register, runway.'),
('System', 7, 'Integrations', 0, 'plug', 'integrations', null, null, 'Credential vault and sync control — Metrc first.'),
('System', 7, 'Audit Log', 1, 'shield', 'audit', 'audit_events', null, 'Append-only record of every material change.'),
('System', 7, 'Settings', 2, 'gear', 'settings', null, null, 'Your account preferences — theme, and more to come.');;
