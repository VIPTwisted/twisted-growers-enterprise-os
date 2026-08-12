-- Tasks raised from a dashboard tile carry the number that triggered them.
alter table tasks add column if not exists source_view text;
alter table tasks add column if not exists source_kpi text;
alter table tasks add column if not exists source_value numeric;
alter table tasks add column if not exists source_unit text;
alter table tasks add column if not exists source_snapshot jsonb;
alter table tasks add column if not exists department text;
alter table tasks add column if not exists watchers text[];

create or replace function tg_task_from_dashboard(
  p_title text, p_description text, p_department text, p_kpi text,
  p_value numeric, p_unit text, p_drill text, p_assignee bigint,
  p_due date, p_priority text
) returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if coalesce(length(trim(p_title)),0) < 5 then
    raise exception 'A task needs a title of at least five characters.';
  end if;
  insert into tasks (title, description, status, priority, assignee_employee_id, due_on,
                     department, source_view, source_kpi, source_value, source_unit,
                     source_snapshot, created_by)
  values (p_title, p_description, 'open', coalesce(p_priority,'normal'), p_assignee, p_due,
          p_department, p_drill, p_kpi, p_value, p_unit,
          jsonb_build_object('kpi',p_kpi,'value',p_value,'unit',p_unit,'department',p_department,
                             'captured_at', now(), 'drill', p_drill),
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;
grant execute on function tg_task_from_dashboard(text,text,text,text,numeric,text,text,bigint,date,text) to authenticated;

drop view if exists v_dashboard_tasks cascade;
create view v_dashboard_tasks as
select t.id, t.title, t.description, t.status, t.priority,
  e.full_name as assigned_to, d.name as assignee_department,
  t.department as raised_from, t.source_kpi, t.source_value, t.source_unit, t.source_view as drill,
  t.due_on, (t.due_on - current_date) as days_until_due,
  case when t.due_on < current_date and t.status <> 'done' then 'OVERDUE by '||(current_date - t.due_on)||' days'
       when t.status = 'done' then 'Done '||coalesce(t.completed_at::date::text,'')
       when t.due_on is null then 'No due date set'
       else 'Due in '||(t.due_on - current_date)||' days' end as position,
  t.created_at::date as raised_on, (current_date - t.created_at::date) as days_open,
  t.source_snapshot
from tasks t
left join employees e on e.id = t.assignee_employee_id
left join departments d on d.id = e.primary_department_id
where t.source_kpi is not null
order by case t.status when 'open' then 0 else 1 end, t.due_on nulls last;

-- Task KPIs feed back into every dashboard
drop view if exists v_department_task_kpis cascade;
create view v_department_task_kpis as
select coalesce(department,'Command') dept, 90 ord, 'Open tasks from this dashboard' kpi,
  count(*) filter (where status <> 'done')::numeric value, 'tasks' unit,
  case when count(*) filter (where status <> 'done') > 0 then 'warn' else 'good' end tone,
  'dashboard_tasks' drill, 'raised from a tile here' sub
from tasks where source_kpi is not null group by 1
union all
select coalesce(department,'Command'), 91, 'Tasks overdue',
  count(*) filter (where due_on < current_date and status <> 'done')::numeric, 'tasks',
  case when count(*) filter (where due_on < current_date and status <> 'done') > 0 then 'bad' else 'good' end,
  'dashboard_tasks', 'past their due date'
from tasks where source_kpi is not null group by 1;

insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Workspace', (select min(category_order) from nav_registry where category='Workspace'), 'Work',
 'Dashboard Tasks', 7, 'check-square', 'dashboard_tasks', 'v_dashboard_tasks',
 'Every task raised from a dashboard tile, carrying the number that triggered it. Shows who it is assigned to, their department, the KPI and its value at the moment it was raised, the due date and whether it is overdue.',
 true, false, false
where not exists (select 1 from nav_registry where view_key='dashboard_tasks');
insert into nav_role_visibility (view_key, role, visible)
select 'dashboard_tasks', r.role, true from
 (values ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly')) r(role)
on conflict (view_key, role) do update set visible = true;;
