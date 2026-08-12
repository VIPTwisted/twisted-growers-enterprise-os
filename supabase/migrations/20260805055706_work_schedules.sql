-- 0026: work schedules - company default + per-employee schedules in the employee file
create table if not exists employee_work_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  unique (employee_id, weekday)
);
alter table employee_work_schedules enable row level security;
create policy staff_read on employee_work_schedules for select to authenticated using (true);
create policy exec_all on employee_work_schedules for all using (is_executive()) with check (is_executive());
create trigger audit_employee_work_schedules after insert or update or delete on employee_work_schedules
  for each row execute function audit_row();

create table if not exists non_working_days (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  label text not null,
  scope text not null default 'company' check (scope in ('company','employee')),
  employee_id uuid references employees(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table non_working_days enable row level security;
create policy staff_read on non_working_days for select to authenticated using (true);
create policy exec_all on non_working_days for all using (is_executive()) with check (is_executive());
create trigger audit_non_working_days after insert or update or delete on non_working_days
  for each row execute function audit_row();

insert into configurations (key, value) values ('workspace_work_schedule',
'{"workweek":[1,2,3,4,5],"start":"09:00","end":"17:00","daily_capacity_hours":8,"weekly_capacity_hours":40,
"note":"Company default; any employee with rows in employee_work_schedules overrides it. Weekday 0=Sunday."}'::jsonb)
on conflict (key) do nothing;

-- Live capacity per employee: their own schedule, or the company default
create or replace view v_employee_capacity with (security_invoker = true) as
select
  e.employee_code,
  e.full_name,
  coalesce(rc.name, '—') as position,
  coalesce(d.name, '—') as department,
  case when s.days is null then 'Company default' else 'Custom' end as schedule_source,
  coalesce(s.days, (select jsonb_array_length(value->'workweek') from configurations where key = 'workspace_work_schedule')) as days_per_week,
  round(coalesce(s.weekly_hours,
    (select (value->>'weekly_capacity_hours')::numeric from configurations where key = 'workspace_work_schedule')), 1) as weekly_capacity_hours,
  e.weekly_target_hours as payroll_target_hours,
  e.status
from employees e
left join (
  select employee_id, count(*)::int as days,
    sum(extract(epoch from (end_time - start_time)) / 3600.0) as weekly_hours
  from employee_work_schedules group by employee_id
) s on s.employee_id = e.id
left join roles_catalog rc on rc.id = e.primary_role_id
left join departments d on d.id = e.primary_department_id
where e.terminated_on is null
order by e.full_name;

insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Human Resources', 7, 8, 'work_schedules', 'Work Schedules', 'v_employee_capacity', null, 'clock',
  'Standing work schedule per employee - workweek days, hours, and weekly capacity, with the company default as fallback. Feeds workload planning, the Planner, and payroll targets. Part of each CCC employee file.', true, '#b026ff')
on conflict do nothing;

update actions_register set note = note || ' ADDENDUM: each employee file includes their standing work schedule (employee_work_schedules table live, weekday/hours rows + company default in configurations.workspace_work_schedule + non_working_days holidays/days-off, v_employee_capacity in HR). Needs per-employee schedule editor UI in the employee file page.'
where title = 'Build CCC-compliant employee file per person: notes, documents, badges, training, discipline';;
