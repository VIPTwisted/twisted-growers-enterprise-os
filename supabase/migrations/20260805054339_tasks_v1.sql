-- 0024: Tasks v1 - the Work Layer's first slice, live
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo' check (status in ('todo','in_progress','done','blocked')),
  priority text not null default 'P2' check (priority in ('P0','P1','P2','P3')),
  assignee_employee_id uuid references employees(id),
  team_id uuid references teams(id),
  due_on date,
  tags text[] not null default '{}',
  created_by uuid not null,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table tasks enable row level security;
create policy staff_read on tasks for select to authenticated using (true);
create policy staff_insert on tasks for insert to authenticated with check (created_by = auth.uid());
create policy staff_update on tasks for update to authenticated using (true) with check (true);
create policy exec_delete on tasks for delete using (is_executive());
create trigger audit_tasks after insert or update or delete on tasks
  for each row execute function audit_row();

update nav_registry set milestone = null, label = 'Tasks & Boards',
  description = 'Real tasks: statuses, priorities, roster assignees, due dates, tags - grouped by status with one-click advance. Board/calendar views, subtasks, and automations grow in with the Work Layer.'
where view_key = 'tasks';;
