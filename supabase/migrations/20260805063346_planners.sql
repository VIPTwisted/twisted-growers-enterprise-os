-- 0031: multiple planners - pick or create; each planner selects its event sources
create table if not exists planners (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sources text[] not null default '{harvest,shipment,work_order,expiry,shift}',
  description text,
  is_private boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table planners enable row level security;
create policy read_visible on planners for select to authenticated
  using ((not is_private) or created_by = auth.uid() or is_executive());
create policy create_own on planners for insert to authenticated with check (created_by = auth.uid());
create policy exec_all on planners for all using (is_executive()) with check (is_executive());
create trigger audit_planners after insert or update or delete on planners
  for each row execute function audit_row();

insert into planners (name, sources, description) values
('Operations — everything', '{harvest,shipment,work_order,expiry,shift}', 'The whole company on one calendar.'),
('Cultivation', '{harvest}', 'Harvest events only.'),
('Logistics', '{shipment,expiry}', 'Shipments, pickups, and expiring lots.'),
('Production', '{work_order}', 'Work orders and line schedules.'),
('People', '{shift}', 'Employee shifts and zones.')
on conflict (name) do nothing;;
