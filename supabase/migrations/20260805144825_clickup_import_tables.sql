create table if not exists clickup_spaces (
  id text primary key, name text, archived boolean, payload jsonb, synced_at timestamptz default now()
);
create table if not exists clickup_lists (
  id text primary key, name text, space_id text, folder_id text, folder_name text,
  task_count numeric, archived boolean, payload jsonb, synced_at timestamptz default now()
);
create table if not exists clickup_tasks (
  id text primary key, name text, status text, list_id text, list_name text, space_id text,
  assignees text, tags text, priority text, due_date timestamptz, date_created timestamptz,
  date_closed timestamptz, url text, custom_fields jsonb, payload jsonb, synced_at timestamptz default now()
);
do $$ declare t text;
begin
  foreach t in array array['clickup_spaces','clickup_lists','clickup_tasks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
  end loop;
end $$;
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Workspace', (select category_order from nav_registry where category='Workspace' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, true
from (values
  ('ClickUp Tasks (Imported)', 40, 'board', 'clickup_tasks', 'clickup_tasks', 'Every task pulled from the company ClickUp workspace - statuses, assignees, dates, tags, and the complete raw payload.'),
  ('ClickUp Lists (Imported)', 41, 'apps', 'clickup_lists', 'clickup_lists', 'Every space, folder, and list from the company ClickUp workspace.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);;
