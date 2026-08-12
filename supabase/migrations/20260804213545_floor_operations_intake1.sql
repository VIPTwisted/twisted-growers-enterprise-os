-- TG Enterprise OS — 0005 Floor Operations (Intake #1: all 10 concepts adopted as critical)

create type rate_basis as enum ('per_operator','whole_machine');
create type worker_tier as enum ('dedicated_operator','assembly_specialist','flex_support','cross_department');
create type skill_level as enum ('trainee','standard','expert');

-- Concept 2: machine/station registry — every physical asset one named row
create table machines (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  department_id uuid references departments(id),
  stations text[] not null,                       -- station(s) served; combo units list several, one pass credits all
  actual_pcs_per_min numeric(10,3),               -- sustained real pace; null = inherit task standard
  rate_basis rate_basis not null default 'per_operator',
  min_operators int not null default 1 check (min_operators >= 1),
  max_operators int,                              -- null = unlimited (manual bench)
  active boolean not null default true,           -- park without deleting
  run_through_breaks boolean not null default false,
  notes text,
  check (max_operators is null or max_operators >= min_operators)
);

-- Concept 4: per-machine qualification + skill multipliers
create table machine_qualifications (
  employee_id uuid not null references employees(id),
  machine_id uuid not null references machines(id),
  level skill_level not null default 'standard',
  rate_multiplier numeric(4,2) not null default 1.00,  -- trainee 0.70 / standard 1.00 / expert 1.15 — configurable
  qualified_on date,
  qualified_by uuid references employees(id),
  primary key (employee_id, machine_id)
);

-- Concept 3: worker tiers + borrowed-labor pull budgets
alter table employees
  add column tier worker_tier not null default 'assembly_specialist',
  add column pull_budget_hours numeric(5,2) not null default 0,
  add column pull_lockout boolean not null default false;

-- Concept 7: shift shape as configuration (Law #4 — never hardcoded)
create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_time time not null,
  end_time time not null,
  block_minutes int not null default 120,
  break_minutes int not null default 15,
  lunch_minutes int not null default 30,
  granularity_minutes int not null default 5,
  min_block_minutes int not null default 15,
  quota_buffer numeric(4,3) not null default 1.05,
  active boolean not null default true
);

-- Concept 1: derating chain per task (finished -> +scrap -> gross -> xOEE -> effective)
create table task_standards (
  id uuid primary key default gen_random_uuid(),
  product_family_id uuid references product_families(id),
  task_name text not null,
  units_per_group numeric(10,2) not null default 1,   -- pack/case conversion
  nominal_pcs_per_min numeric(10,3),
  scrap_pct numeric(5,4) not null default 0,
  oee_pct numeric(5,4) not null default 0.85,
  pipeline_seq int,                                    -- concept 9: flow order for bottleneck monitor
  active boolean not null default true,
  unique (product_family_id, task_name)
);

-- Concept 6: starting-WIP stage buffers by day
create table wip_snapshots (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  task_name text not null,
  units numeric(14,2) not null default 0,
  entered_by uuid references employees(id),
  created_at timestamptz not null default now(),
  unique (as_of, task_name)
);

-- Concepts 5/8/9: scheduler engine fields on assignments
alter table schedule_assignments
  add column machine_id uuid references machines(id),
  add column rate_override numeric(10,3),
  add column expected_units numeric(14,2),
  add column actual_units numeric(14,2),
  add column is_pull boolean not null default false;   -- borrowed-labor block, counts against pull budget

create trigger audit_machines after insert or update or delete on machines
  for each row execute function audit_row();
create trigger audit_task_standards after insert or update or delete on task_standards
  for each row execute function audit_row();

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
           and tablename in ('machines','machine_qualifications','shift_templates','task_standards','wip_snapshots')
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;;
