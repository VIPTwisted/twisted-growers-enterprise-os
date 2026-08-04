-- TG Enterprise OS — 0001 Foundation
-- CODE-001 Identity & Organization, CODE-012 Audit/Security/Change
-- Source contract: "Platform Code & Build Blueprint" sheet, TG Planner v5.

create extension if not exists pgcrypto;

-- ===== Enums =====
create type app_role as enum ('owner','executive','planner','dept_head','staff','readonly');
create type employment_status as enum ('active','inactive','terminated');
create type pay_basis as enum ('hourly','weekly_salary');
create type lot_status as enum ('production_queue','production','packaging_queue','packaging',
  'out_for_testing','testing_hold','quarantine','remediation','ready_to_ship','shipped','expired_verify','consumed');
create type release_status as enum ('pending','released','not_required','failed');
create type approval_status as enum ('pending','approved','rejected','hold');
create type wo_status as enum ('draft','planned','ready','released','in_production','complete','cancelled');
create type test_status as enum ('planned','submitted','at_lab','results_received','qa_review','released','failed','remediation');
create type coa_status as enum ('pending','pass','fail','remediation_pass');

-- ===== Reference (canonical names — from v5 "Reference Tables" sheet) =====
create table departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort int not null default 0,
  active boolean not null default true
);

create table roles_catalog (
  id uuid primary key default gen_random_uuid(),
  department_id uuid references departments(id),
  name text not null,
  planned_hourly_rate numeric(8,2),      -- per-role planning rate for OPEN seats only
  unique (department_id, name)
);

create table product_families (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  home_department_id uuid references departments(id)
);

-- ===== People (CODE-001) =====
create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  full_name text not null,
  status employment_status not null default 'active',
  primary_department_id uuid references departments(id),
  primary_role_id uuid references roles_catalog(id),
  primary_allocation numeric(4,3) not null default 1.0 check (primary_allocation between 0 and 1),
  secondary_department_id uuid references departments(id),
  secondary_role_id uuid references roles_catalog(id),
  secondary_allocation numeric(4,3) not null default 0 check (secondary_allocation between 0 and 1),
  manager_id uuid references employees(id),
  weekly_target_hours numeric(5,2) not null default 40,
  metrc_agent_badge text,
  badge_expires date,
  hired_on date,
  terminated_on date,
  created_at timestamptz not null default now(),
  check (primary_allocation + secondary_allocation <= 1.0)
);

-- REQUIREMENT #1 (owner, 2026-08-04): payroll is PER-EMPLOYEE at actual individual rates.
-- Effective-dated so every rate change is history, never an overwrite.
create table employee_rates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  basis pay_basis not null,
  rate numeric(10,2) not null check (rate >= 0),   -- $/hr or $/week by basis
  ot_multiplier numeric(4,2) not null default 1.5,
  burden_pct numeric(5,4) not null default 0.12,
  effective_from date not null,
  effective_to date,
  approved_by uuid references employees(id),
  note text,
  check (effective_to is null or effective_to >= effective_from)
);
create unique index employee_rates_open_period
  on employee_rates(employee_id) where effective_to is null;

create table app_users (
  user_id uuid primary key,                        -- auth.users.id
  employee_id uuid references employees(id),
  role app_role not null default 'readonly',
  created_at timestamptz not null default now()
);

-- ===== Audit (CODE-012: append-only, immutable) =====
create table audit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  entity text not null,
  entity_id text,
  action text not null,
  old_value jsonb,
  new_value jsonb,
  reason text
);

create or replace function audit_row() returns trigger
language plpgsql security definer as $$
begin
  insert into audit_events(actor, entity, entity_id, action, old_value, new_value)
  values (auth.uid(), tg_table_name,
          coalesce((case when tg_op='DELETE' then old else new end).id::text, '?'),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_events is append-only';
end $$;
create trigger audit_events_immutable before update or delete on audit_events
  for each row execute function forbid_change();

create table configurations (
  key text primary key,
  value jsonb not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

-- ===== RLS: default deny; executives full; shadow mode = executive-only (per Workbook Guide governance) =====
create or replace function current_app_role() returns app_role
language sql stable security definer as $$
  select coalesce((select role from app_users where user_id = auth.uid()), 'readonly'::app_role)
$$;

create or replace function is_executive() returns boolean
language sql stable as $$ select current_app_role() in ('owner','executive') $$;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname='public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy exec_all on public.%I for all using (is_executive()) with check (is_executive())', t);
  end loop;
end $$;

-- Audit triggers on people/pay (blueprint: "Immutable audit of pay, role and reporting changes")
create trigger audit_employees after insert or update or delete on employees
  for each row execute function audit_row();
create trigger audit_employee_rates after insert or update or delete on employee_rates
  for each row execute function audit_row();
create trigger audit_configurations after insert or update or delete on configurations
  for each row execute function audit_row();
