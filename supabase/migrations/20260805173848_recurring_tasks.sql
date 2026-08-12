-- Recurring tasks: repeat rule on tasks, nightly materialisation, and a side menu entry.

alter table public.tasks
  add column if not exists recurrence jsonb,
  add column if not exists recurrence_parent_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tasks_recurrence_parent_id_fkey'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_recurrence_parent_id_fkey
      foreign key (recurrence_parent_id) references public.tasks(id) on delete set null;
  end if;
end $$;

comment on column public.tasks.recurrence is
  'How often this task repeats, written as a small object, for example {"every_days": 7}. When the number of days is missing or is not a whole number the task repeats every seven days. Leave empty for a task that does not repeat.';
comment on column public.tasks.recurrence_parent_id is
  'The first task in this repeating series. Empty when this task is itself the first one in the series.';

create index if not exists tasks_recurrence_parent_id_idx
  on public.tasks (recurrence_parent_id);

create index if not exists tasks_recurrence_open_idx
  on public.tasks (status, due_on)
  where recurrence is not null;

-- Creates the next occurrence of every finished repeating task.
-- Returns the number of tasks created.
create or replace function public.tg_materialize_recurring()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_created integer := 0;
begin
  with source as (
    select
      t.id,
      coalesce(t.recurrence_parent_id, t.id) as series_id,
      t.title,
      t.assignee_employee_id,
      t.priority,
      t.tags,
      t.space_id,
      t.recurrence,
      t.created_by,
      coalesce(t.due_on, current_date) as base_due_on,
      greatest(1, case
                    when t.recurrence ->> 'every_days' ~ '^[0-9]+$'
                      then (t.recurrence ->> 'every_days')::integer
                    else 7
                  end) as every_days
    from public.tasks t
    where t.recurrence is not null
      and t.status = 'done'
  ),
  eligible as (
    select distinct on (s.series_id)
      s.*,
      (s.base_due_on + (s.every_days || ' days')::interval)::date as next_due_on
    from source s
    where not exists (
      select 1
      from public.tasks sibling
      where coalesce(sibling.recurrence_parent_id, sibling.id) = s.series_id
        and sibling.id <> s.id
        and coalesce(sibling.due_on, current_date) > s.base_due_on
    )
    order by s.series_id, s.base_due_on desc, s.id
  ),
  inserted as (
    insert into public.tasks (
      title, status, priority, assignee_employee_id, tags, space_id,
      due_on, created_by, recurrence, recurrence_parent_id
    )
    select
      e.title, 'todo', e.priority, e.assignee_employee_id, e.tags, e.space_id,
      e.next_due_on, e.created_by, e.recurrence, e.series_id
    from eligible e
    returning 1
  )
  select count(*)::integer into v_created from inserted;

  return v_created;
end;
$fn$;

comment on function public.tg_materialize_recurring() is
  'Looks at every finished task that has a repeat rule and creates the next occurrence, due the stated number of days after the finished one. Copies the title, the assigned employee, the priority, the tags and the space, sets the new task to to do, and points it back at the first task in the series. Skips any series that already has a later task waiting. Returns the number of tasks created.';

revoke all on function public.tg_materialize_recurring() from public;
grant execute on function public.tg_materialize_recurring() to authenticated, service_role;

-- Reading view for the side menu.
drop view if exists public.v_recurring_tasks;
create view public.v_recurring_tasks
with (security_invoker = true) as
select
  t.id                                      as task_id,
  t.title,
  t.status,
  t.priority,
  t.due_on,
  coalesce(t.recurrence_parent_id, t.id)    as series_id,
  case
    when t.recurrence_parent_id is null then 'First task in the series'
    else 'Created automatically from an earlier task'
  end                                       as series_position,
  r.every_days                              as repeats_every_days,
  (coalesce(t.due_on, current_date) + (r.every_days || ' days')::interval)::date
                                            as next_occurrence_due_on,
  employee.full_name                        as assigned_to,
  space.name                                as space_name,
  t.tags,
  (select count(*)
     from public.tasks series_member
    where coalesce(series_member.recurrence_parent_id, series_member.id)
          = coalesce(t.recurrence_parent_id, t.id))::integer
                                            as tasks_in_series,
  t.completed_at,
  t.created_at
from public.tasks t
cross join lateral (
  select greatest(1, case
                       when t.recurrence ->> 'every_days' ~ '^[0-9]+$'
                         then (t.recurrence ->> 'every_days')::integer
                       else 7
                     end) as every_days
) r
left join public.employees employee on employee.id = t.assignee_employee_id
left join public.spaces space on space.id = t.space_id
where t.recurrence is not null;

comment on view public.v_recurring_tasks is
  'Every task that carries a repeat rule, with how often it repeats, when the next occurrence falls due, who it is assigned to and how many tasks the series holds so far.';

grant select on public.v_recurring_tasks to authenticated, service_role;

-- Nightly at 05:00 Coordinated Universal Time.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'materialize-recurring') then
    perform cron.unschedule('materialize-recurring');
  end if;
  perform cron.schedule(
    'materialize-recurring',
    '0 5 * * *',
    'select public.tg_materialize_recurring()'
  );
end $$;

-- Side menu entry.
insert into nav_registry (
  category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, admin_only, sync_enabled
)
select
  'Workspace',
  (select category_order from nav_registry where category = 'Workspace' limit 1),
  'Recurring Tasks',
  7,
  'clock',
  'recurring_tasks',
  'v_recurring_tasks',
  'Tasks that repeat on a schedule, showing how often each one repeats and when the next occurrence is due.',
  true,
  false,
  false
where not exists (select 1 from nav_registry where view_key = 'recurring_tasks');
;
