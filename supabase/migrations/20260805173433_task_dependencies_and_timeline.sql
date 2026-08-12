-- Task dependencies for the timeline (Gantt) view
create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete cascade,
  depends_on_id uuid references public.tasks(id) on delete cascade,
  dep_type text default 'finish_to_start'
    check (dep_type in ('finish_to_start','start_to_start','finish_to_finish')),
  created_at timestamptz default now(),
  unique (task_id, depends_on_id),
  constraint task_dependencies_no_self_reference check (task_id is distinct from depends_on_id)
);

comment on table public.task_dependencies is
  'Links a task to the task that must happen before it. Used by the timeline view to detect blocked work and schedule conflicts.';
comment on column public.task_dependencies.dep_type is
  'Relationship between the two tasks: finish to start, start to start, or finish to finish.';

create index if not exists task_dependencies_task_id_idx on public.task_dependencies (task_id);
create index if not exists task_dependencies_depends_on_id_idx on public.task_dependencies (depends_on_id);

alter table public.task_dependencies enable row level security;

drop policy if exists task_dependencies_read on public.task_dependencies;
create policy task_dependencies_read
  on public.task_dependencies
  for select
  to authenticated
  using (true);

drop policy if exists task_dependencies_write on public.task_dependencies;
create policy task_dependencies_write
  on public.task_dependencies
  for all
  to authenticated
  using (true)
  with check (true);

-- Timeline view: every task with its schedule, duration, predecessors and warning
drop view if exists public.v_task_timeline;
create view public.v_task_timeline
with (security_invoker = true) as
select
  t.id                                   as task_id,
  t.title,
  t.status,
  t.priority,
  t.space_id,
  t.team_id,
  t.assignee_employee_id,
  t.start_on,
  t.due_on,
  case
    when t.start_on is not null and t.due_on is not null then (t.due_on - t.start_on)
  end                                    as duration_days,
  coalesce(p.predecessor_count, 0)       as predecessor_count,
  p.predecessor_names,
  p.blocking_predecessor_names,
  case
    when p.unfinished_count > 0 then 'BLOCKED - predecessor not finished'
    when p.conflict_count   > 0 then 'SCHEDULE CONFLICT - starts before predecessor finishes'
  end                                    as warning,
  t.created_at,
  t.updated_at
from public.tasks t
left join lateral (
  select
    count(*)                                                         as predecessor_count,
    count(*) filter (where pred.status is distinct from 'done')      as unfinished_count,
    count(*) filter (
      where t.start_on is not null
        and pred.due_on is not null
        and t.start_on < pred.due_on
    )                                                                as conflict_count,
    string_agg(pred.title, ', ' order by pred.title)                 as predecessor_names,
    string_agg(pred.title, ', ' order by pred.title)
      filter (where pred.status is distinct from 'done')             as blocking_predecessor_names
  from public.task_dependencies d
  join public.tasks pred on pred.id = d.depends_on_id
  where d.task_id = t.id
) p on true;

comment on view public.v_task_timeline is
  'Every task with its start date, due date, duration in days, the names of the tasks it waits on, and a warning when a predecessor is not finished or the schedule overlaps.';

grant select on public.v_task_timeline to authenticated;

-- Side menu entry
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Workspace',
       (select category_order from nav_registry where category='Workspace' limit 1),
       'Timeline & Dependencies',
       6,
       'clock',
       'task_timeline',
       'v_task_timeline',
       'Shows every task on a timeline with its start date, due date, length in days, the tasks it is waiting on, and a warning when work is blocked or scheduled too early.',
       true, false, false
where not exists (select 1 from nav_registry where view_key='task_timeline');;
