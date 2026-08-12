-- 0012: planner harvest schedule (full sheet fidelity), HR scheduling + labor budgets, Metrc promoted to its own section

create table if not exists harvest_schedule (
  id uuid primary key default gen_random_uuid(),
  harvest_date date not null,
  flower_room text,
  projected_availability date,
  cultivar text,
  projected_g_sqft numeric,
  plants integer,
  projected_weight_g numeric,
  projected_weight_lbs numeric,
  fresh_frozen_portion numeric,
  fresh_frozen_lbs numeric,
  flower_after_ff_lbs numeric,
  day_of_week text,
  days_since_room_harvest integer,
  room_cycle_flag text,
  facility_days_since_harvest integer,
  facility_cadence_flag text,
  source text not null default 'planner_v4',
  note text,
  created_at timestamptz not null default now()
);
alter table harvest_schedule enable row level security;
create policy exec_all on harvest_schedule for all using (is_executive()) with check (is_executive());
create index if not exists idx_harvest_schedule_date on harvest_schedule (harvest_date);
create trigger audit_harvest_schedule after insert or update or delete on harvest_schedule
  for each row execute function audit_row();

create table if not exists employee_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  work_date date not null,
  shift_template_id uuid references shift_templates(id),
  department_id uuid references departments(id),
  zone text,
  planned_start time,
  planned_end time,
  status text not null default 'scheduled'
    check (status in ('scheduled','worked','late','called_out','no_show','cancelled')),
  note text,
  created_at timestamptz not null default now(),
  unique (employee_id, work_date, planned_start)
);
alter table employee_schedules enable row level security;
create policy exec_all on employee_schedules for all using (is_executive()) with check (is_executive());
create index if not exists idx_employee_schedules_date on employee_schedules (work_date);
create trigger audit_employee_schedules after insert or update or delete on employee_schedules
  for each row execute function audit_row();

create table if not exists labor_budgets (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id),
  week_start date not null,
  budgeted_hours numeric,
  budgeted_cost numeric,
  note text,
  created_at timestamptz not null default now(),
  unique (department_id, week_start)
);
alter table labor_budgets enable row level security;
create policy exec_all on labor_budgets for all using (is_executive()) with check (is_executive());
create trigger audit_labor_budgets after insert or update or delete on labor_budgets
  for each row execute function audit_row();

-- Metrc becomes its own top-level section named exactly "Metrc" (word "Mirror" removed)
update nav_registry set category_order = category_order + 1 where category in ('Reports','Settings');
update nav_registry set
  category = 'Metrc', category_order = 9, item_order = 0,
  label = 'Metrc', color = '#57a9ff',
  description = 'The entire Metrc seed-to-sale platform synced into your own database - every dataset and report the state API allows, full history, every row drillable to the raw payload.'
where view_key = 'metrc_mirror';

-- Harvest Schedule now points at the loaded planner table (real data, so no SOON tag)
update nav_registry set table_ref = 'harvest_schedule', milestone = null,
  description = 'Complete historical and 2026 harvest calendar from the operations planner - rooms, cultivars, plants, projected weights, fresh-frozen splits, cadence flags.'
where view_key = 'harvest_schedule';

-- HR: scheduling with zones/departments + labor budgets
insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values
  ('People', 6, 4, 'emp_schedule', 'Scheduling & Zones', 'employee_schedules', 'M3', 'people',
   'Per-employee daily schedule: department, zone, shift times, and exception status (late, called out, no-show).', true, '#b026ff'),
  ('People', 6, 5, 'labor_budgets', 'Labor Budgets', 'labor_budgets', 'M3', 'scale',
   'Weekly budgeted hours and cost per department against actuals from time and attendance at real per-employee rates.', true, '#b026ff'),
  ('Settings', 11, 4, 'permissions', 'Users & Permissions', null, 'M4', 'gear',
   'Granular access control: per-module, per-action permissions on top of roles - lock any screen, field, or action down per user or group.', true, 'var(--ink)')
on conflict do nothing;;
