-- 0013: staff issue reporting (equipment down, short-staffed, out of material) + maintenance & supplies

create table if not exists issue_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('equipment','staffing','material','supply','safety','quality','facility','other')),
  severity text not null default 'watch' check (severity in ('watch','elevated','critical')),
  title text not null,
  detail text,
  department_id uuid references departments(id),
  machine_id uuid references machines(id),
  status text not null default 'open' check (status in ('open','acknowledged','in_progress','resolved','wont_fix')),
  reported_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
alter table issue_reports enable row level security;
create policy staff_read on issue_reports for select to authenticated using (true);
create policy staff_insert on issue_reports for insert to authenticated with check (true);
create policy exec_all on issue_reports for all using (is_executive()) with check (is_executive());
create trigger audit_issue_reports after insert or update or delete on issue_reports
  for each row execute function audit_row();

create table if not exists supply_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  on_hand numeric,
  unit text,
  reorder_level numeric,
  vendor text,
  location text,
  note text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table supply_items enable row level security;
create policy staff_read on supply_items for select to authenticated using (true);
create policy exec_all on supply_items for all using (is_executive()) with check (is_executive());
create trigger audit_supply_items after insert or update or delete on supply_items
  for each row execute function audit_row();

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('Workspace', 7, 3, 'issues', 'Issue Reports', 'issue_reports', 'M4', 'shield',
   'Staff report anything blocking the floor - equipment down, short-staffed, out of material, running low - with severity tiers, routing to a department or machine, and resolution tracking.', true, '#8fa5ff'),
  ('Inventory', 4, 5, 'supplies', 'Supplies & Materials', 'supply_items', 'M3', 'box',
   'Non-cannabis operating supplies: packaging, consumables, PPE - on-hand levels, reorder points, and vendors, feeding low-stock alerts.', true, '#00d4ff')
on conflict do nothing;

insert into actions_register (title, priority, source, note, status) values
('Build staff issue-report submit form + supplies low-stock alerts', 'P0', 'owner_directive',
 'Owner 2026-08-05: staff need an area to report equipment down, short staffing, out-of-material, running low; plus a maintenance and supplies area. Tables issue_reports + supply_items are live with staff-writable RLS; needs the in-app submit form (forms engine M4) and reorder-level alert wiring.', 'open');;
