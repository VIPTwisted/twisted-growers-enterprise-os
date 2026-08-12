-- 0021: Teams Hub - departments are built-in teams; custom teams with real members
create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text default '#2df26a',
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table teams enable row level security;
create policy staff_read on teams for select to authenticated using (true);
create policy exec_all on teams for all using (is_executive()) with check (is_executive());
create trigger audit_teams after insert or update or delete on teams
  for each row execute function audit_row();

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  employee_id uuid not null references employees(id),
  added_at timestamptz not null default now(),
  unique (team_id, employee_id)
);
alter table team_members enable row level security;
create policy staff_read on team_members for select to authenticated using (true);
create policy exec_all on team_members for all using (is_executive()) with check (is_executive());
create trigger audit_team_members after insert or update or delete on team_members
  for each row execute function audit_row();

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Workspace', 8, -1, 'teams', 'Teams', null, null, 'users',
  'The Teams Hub: every department as a living team with real members from the roster, plus custom cross-department teams - assign to tasks, mention, and route work once the Work Layer lands.', true, '#8fa5ff')
on conflict do nothing;;
