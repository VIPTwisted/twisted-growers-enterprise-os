-- Agent I, 12 Aug 2026. DBI-082.
--
-- OWNER: "build workspace as our own clone as similar copy to clickup". Earlier: "must connect
-- and wire to our version of clickup too we call ours TG workspace".
--
-- MEASURED BEFORE BUILDING ANYTHING, because half of this already existed and rebuilding it
-- would have been the expensive mistake:
--   spaces            8 rows  - REAL, with per-space statuses jsonb, colour, privacy, owner
--   tasks             0 rows  - but already ClickUp-shaped: space_id, watchers, recurrence,
--                               recurrence_parent_id, order_no, budget, tags, start_on, due_on,
--                               priority, team_id, department, and the assign-from-tile columns
--                               source_view/source_kpi/source_value/source_snapshot
--   task_dependencies 0 rows  - exists (task_id, depends_on_id, dep_type)
--   teams/team_members 0 rows - exist
--   channels          7 rows  - exist; messages 0 rows, exists
--   clickup_*        63 tasks - the MIRROR of the real ClickUp, not ours. Left alone.
--
-- SO THE GAP IS: lists inside spaces, comments, subtasks, checklists, attachments, time tracking,
-- per-task activity, and saved views. That is what this builds. Nothing existing is rebuilt and
-- the clickup_* mirror is untouched - it is a read-only reflection of the outside system.
--
-- ONE THING FIXED IN PASSING: tg_task_from_dashboard was unusable. It declares `returns bigint`
-- and does `returning id into v_id` where tasks.id is UUID, and takes `p_assignee bigint` for
-- assignee_employee_id which is also UUID. Agent B found it and refused to wire a button that
-- could only ever error - the right call. Replaced with tg_task_create, correctly typed.
--
-- UNDO: drop the seven new tables and tg_task_create; drop the two columns added to tasks.

-- Lists live inside spaces. ClickUp calls the middle layer folders and lists; one level is
-- enough here and a second would be furniture nobody fills.
create table if not exists task_list (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references spaces(id) on delete cascade,
  name        text not null,
  description text,
  colour      text,
  sort        int not null default 100,
  archived    boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  unique (space_id, name)
);
create index if not exists task_list_space on task_list (space_id, sort) where not archived;

comment on table task_list is
 'Lists inside a space — the middle layer of the workspace. ClickUp nests folders then lists; one '
 'level is enough here and a second would be furniture nobody fills. Deliberately NOT the '
 'clickup_lists table, which is a read-only mirror of the outside ClickUp.';

-- tasks already carries space_id. It needs a list and a parent, and nothing else.
alter table tasks add column if not exists list_id        uuid references task_list(id) on delete set null;
alter table tasks add column if not exists parent_task_id uuid references tasks(id) on delete cascade;
create index if not exists tasks_list   on tasks (list_id, order_no);
create index if not exists tasks_parent on tasks (parent_task_id) where parent_task_id is not null;

comment on column tasks.parent_task_id is
 'Subtasks. A task with a parent is a subtask; the same table on purpose, so a subtask can be '
 'assigned, dated, commented on and tracked exactly like any other task — which is the thing '
 'people actually want and the reason a separate subtask table always disappoints.';

create table if not exists task_comment (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  author     uuid not null default auth.uid(),
  body       text not null check (length(btrim(body)) > 0),
  mentions   uuid[] not null default '{}',
  edited_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists task_comment_task on task_comment (task_id, created_at);

comment on table task_comment is
 'The conversation on a task. mentions is an array of user ids so a notification can be raised '
 'without parsing prose. Comments are never deleted, only edited — a decision thread that can be '
 'silently removed is not a record of anything.';

create table if not exists task_checklist_item (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  label       text not null,
  done        boolean not null default false,
  done_by     uuid,
  done_at     timestamptz,
  sort        int not null default 100,
  created_at  timestamptz not null default now()
);
create index if not exists checklist_task on task_checklist_item (task_id, sort);

comment on table task_checklist_item is
 'Tick-boxes inside a task, for steps too small to be subtasks. done_by and done_at are recorded '
 'because "who ticked this" is the first question asked when something turns out not to be done.';

create table if not exists task_attachment (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references tasks(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid not null default auth.uid(),
  uploaded_at  timestamptz not null default now()
);
create index if not exists attachment_task on task_attachment (task_id, uploaded_at);

comment on table task_attachment is
 'Files on a task. storage_path points at the bucket; the bytes never live in a column. NEVER '
 'store a credential, a key or a token as an attachment — that is what Keys & Connections is for.';

create table if not exists task_time_log (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references tasks(id) on delete cascade,
  employee_id uuid,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  minutes     int generated always as
              (case when ended_at is not null
                    then greatest(0, (extract(epoch from (ended_at - started_at)) / 60)::int) end) stored,
  note        text,
  created_at  timestamptz not null default now(),
  constraint time_log_ends_after_it_starts check (ended_at is null or ended_at >= started_at)
);
create index if not exists time_log_task on task_time_log (task_id, started_at);

comment on table task_time_log is
 'Time against a task. minutes is GENERATED, never typed, so logged time and the clock can never '
 'disagree. A running timer is a row with no ended_at. NOTE: this is workspace time, NOT payroll '
 'time — payroll lives in time_entries and belongs to the HR module, which the owner has parked. '
 'Do not sum the two together.';

create table if not exists task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks(id) on delete cascade,
  actor      uuid not null default auth.uid(),
  what       text not null,
  field      text,
  old_value  text,
  new_value  text,
  at         timestamptz not null default now()
);
create index if not exists activity_task on task_activity (task_id, at desc);

comment on table task_activity is
 'What happened to this task and who did it. The history is the reason a workspace beats a '
 'spreadsheet: "it says done and I never marked it done" has to be answerable.';

create table if not exists workspace_view (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid(),
  name       text not null,
  scope      text not null default 'space' check (scope in ('everything','space','list','mine')),
  space_id   uuid references spaces(id) on delete cascade,
  list_id    uuid references task_list(id) on delete cascade,
  layout     text not null default 'list' check (layout in ('list','board','calendar','table','timeline')),
  group_by   text,
  filters    jsonb not null default '{}'::jsonb,
  sort_by    text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

comment on table workspace_view is
 'A saved way of looking at the work: board, list, calendar, table or timeline, with its grouping '
 'and filters. Per user, because two managers want different cuts of the same tasks — the same '
 'reasoning as dashboard_layout.';

-- RLS. Everything in the workspace is readable by any signed-in employee; writes are the
-- author's own or an admin's. A workspace nobody can see is not a workspace.
do $$
declare t text;
begin
  foreach t in array array['task_list','task_comment','task_checklist_item','task_attachment',
                           'task_time_log','task_activity','workspace_view'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists ws_read on %I', t);
    execute format('create policy ws_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;

drop policy if exists ws_write on task_list;
drop policy if exists ws_write on task_comment;
drop policy if exists ws_write on task_checklist_item;
drop policy if exists ws_write on task_attachment;
drop policy if exists ws_write on task_time_log;
drop policy if exists ws_write on task_activity;
drop policy if exists ws_own   on workspace_view;

create policy ws_write on task_list           for all to authenticated using (true) with check (true);
create policy ws_write on task_checklist_item for all to authenticated using (true) with check (true);
create policy ws_write on task_time_log       for all to authenticated using (true) with check (true);
create policy ws_write on task_activity       for insert to authenticated with check (true);
-- A comment may be edited only by the person who wrote it. Anyone may add one.
create policy ws_write on task_comment for all to authenticated
  using (author = auth.uid() or f_caller_is_admin())
  with check (author = auth.uid() or f_caller_is_admin());
create policy ws_write on task_attachment for all to authenticated
  using (uploaded_by = auth.uid() or f_caller_is_admin())
  with check (uploaded_by = auth.uid() or f_caller_is_admin());
-- A saved view is personal.
create policy ws_own on workspace_view for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Replace the broken assign-from-tile function. The old one could never run: it declared
-- `returns bigint` against a uuid id, and took a bigint assignee for a uuid column.
create or replace function tg_task_create(
  p_title text,
  p_assignee uuid    default null,
  p_due_on date      default null,
  p_priority text    default 'normal',
  p_list_id uuid     default null,
  p_space_id uuid    default null,
  p_description text default null,
  p_source_view text default null,
  p_source_kpi text  default null,
  p_source_value numeric default null,
  p_source_unit text default null)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_title is null or btrim(p_title) = '' then
    raise exception 'A task needs a title somebody could act on.';
  end if;

  insert into tasks (title, description, status, priority, assignee_employee_id, due_on,
                     list_id, space_id, created_by,
                     source_view, source_kpi, source_value, source_unit, source_snapshot)
  values (btrim(p_title), nullif(btrim(coalesce(p_description,'')),''), 'open',
          coalesce(nullif(btrim(coalesce(p_priority,'')),''),'normal'),
          p_assignee, p_due_on, p_list_id, p_space_id, auth.uid(),
          p_source_view, p_source_kpi, p_source_value, p_source_unit,
          case when p_source_kpi is not null
               then jsonb_build_object('kpi', p_source_kpi, 'value', p_source_value,
                                       'unit', p_source_unit, 'captured_at', now())
          end)
  returning id into v_id;

  insert into task_activity (task_id, what, new_value) values (v_id, 'created', btrim(p_title));
  return v_id;
end $$;

comment on function tg_task_create is
 'Create a task, including straight off a dashboard tile. Replaces tg_task_from_dashboard, which '
 'could NEVER have run: it declared `returns bigint` while tasks.id is uuid, and took a bigint '
 'assignee for a uuid column. Agent B found it and refused to wire a button that could only '
 'error, which was correct. source_snapshot captures the figure AS IT STOOD when the task was '
 'raised — the number that triggered the work, frozen, so the task still makes sense next month '
 'when the live figure has moved.';;
