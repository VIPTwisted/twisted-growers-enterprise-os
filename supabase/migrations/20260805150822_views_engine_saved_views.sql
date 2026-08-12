alter table tasks add column if not exists start_on date;
alter table tasks add column if not exists budget numeric;
alter table tasks add column if not exists updated_at timestamptz default now();
create table if not exists saved_views (
  id uuid primary key default gen_random_uuid(),
  collection text not null default 'tasks',
  name text not null,
  view_type text not null default 'list' check (view_type in ('list','board','table','calendar')),
  group_by text default 'status',
  shown_fields jsonb default '["status","assignee","priority","due_on","tags"]'::jsonb,
  filters jsonb default '{}'::jsonb,
  is_private boolean not null default true,
  pinned boolean default false,
  owner uuid,
  position int default 100,
  created_at timestamptz default now()
);
alter table saved_views enable row level security;
create policy sv_read on saved_views for select to authenticated
  using (owner = auth.uid() or is_private = false);
create policy sv_insert on saved_views for insert to authenticated
  with check (owner = auth.uid());
create policy sv_update on saved_views for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
create policy sv_delete on saved_views for delete to authenticated
  using (owner = auth.uid());
insert into saved_views (collection, name, view_type, group_by, shown_fields, is_private, pinned, owner, position) values
('tasks', 'List', 'list', 'status', '["status","assignee","priority","due_on","tags"]', false, true, null, 1),
('tasks', 'Board', 'board', 'status', '["assignee","priority","due_on"]', false, true, null, 2),
('tasks', 'Table', 'table', 'none', '["status","assignee","priority","start_on","due_on","budget","updated_at"]', false, true, null, 3),
('tasks', 'Calendar', 'calendar', 'none', '["status","assignee"]', false, true, null, 4);;
