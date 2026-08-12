-- Workload / capacity view: one row per employee per due date for open tasks.
-- security_invoker = true so the row level security policies on tasks and
-- employees are enforced for whoever queries the view.
drop view if exists public.v_task_workload;

create view public.v_task_workload
with (security_invoker = true) as
select
    e.id        as employee_id,
    e.full_name as employee_name,
    t.due_on    as due_date,
    count(*)    as tasks_due,
    count(*) filter (where t.priority in ('P0', 'P1')) as high_priority_tasks,
    case
        when count(*) > 5 then 'OVERLOADED'
        when count(*) >= 4 then 'HEAVY'
        else 'Normal'
    end as workload_status
from public.tasks t
join public.employees e on e.id = t.assignee_employee_id
where t.status is distinct from 'done'
  and t.due_on is not null
group by e.id, e.full_name, t.due_on
order by e.full_name, t.due_on;

comment on view public.v_task_workload is
    'One row for each employee and each due date on which they have open tasks. Shows how many tasks fall on that day, how many of those are high priority (P0 or P1), and whether the day is Normal, HEAVY (four or five tasks) or OVERLOADED (more than five tasks). Tasks that are already done are excluded.';

grant select on public.v_task_workload to authenticated;
grant select on public.v_task_workload to service_role;;
