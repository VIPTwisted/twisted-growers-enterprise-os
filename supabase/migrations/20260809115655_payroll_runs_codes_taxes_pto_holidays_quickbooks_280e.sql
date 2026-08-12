-- THE PAYROLL LAYER. Everything the top five have, plus the one thing none of
-- them do: 280E cost segregation, which for a cannabis company is the most
-- expensive line in the tax return to get wrong.
-- Nothing hardwired: every code, rate, cap, accrual and account is a row.

-- ── 280E. Labour touching production is COGS and deductible. Labour
--    touching sales and admin is not. This classification has to travel
--    with every dollar from the moment it is earned. ─────────────────
create table if not exists public.cost_classes (
  code        text primary key,
  name        text not null,
  cogs        boolean not null default false,
  irc_280e_deductible boolean not null default false,
  note        text
);
insert into public.cost_classes (code,name,cogs,irc_280e_deductible,note) values
 ('DIRECT_PROD','Direct production labour',true,true,'Cultivation, harvest, extraction, manufacturing, packaging — inventoriable under 471'),
 ('INDIRECT_PROD','Indirect production',true,true,'QA, maintenance and supervision of production areas'),
 ('SELLING','Selling',false,false,'Sales and delivery — disallowed under 280E'),
 ('G_AND_A','General & administrative',false,false,'Admin, finance, HR — disallowed under 280E')
on conflict (code) do nothing;

alter table public.departments add column if not exists cost_class text references public.cost_classes(code);
comment on column public.departments.cost_class is
  'Drives 280E treatment of every hour worked in this department. Set it once per '
  'department; every payroll line inherits it.';

-- ── Earnings and deductions. Codes, not literals. ────────────────────
create table if not exists public.earning_codes (
  code          text primary key,
  name          text not null,
  kind          text not null check (kind in ('regular','overtime','doubletime','holiday','pto','sick','bonus','commission','reimbursement','retro','other')),
  multiplier    numeric(4,2) not null default 1.00,
  taxable       boolean not null default true,
  counts_to_ot  boolean not null default true,
  cost_class    text references public.cost_classes(code),
  gl_account    text,
  qbo_item      text,
  active        boolean not null default true
);
insert into public.earning_codes (code,name,kind,multiplier,taxable,counts_to_ot) values
 ('REG','Regular','regular',1.00,true,true),
 ('OT','Overtime','overtime',1.50,true,false),
 ('DT','Double time','doubletime',2.00,true,false),
 ('HOL','Holiday pay','holiday',1.00,true,false),
 ('PTO','Paid time off','pto',1.00,true,false),
 ('SICK','Sick pay','sick',1.00,true,false),
 ('BON','Bonus','bonus',1.00,true,false),
 ('REIM','Reimbursement','reimbursement',1.00,false,false),
 ('RETRO','Retro pay','retro',1.00,true,false)
on conflict (code) do nothing;

create table if not exists public.deduction_codes (
  code        text primary key,
  name        text not null,
  kind        text not null check (kind in ('pretax','posttax','garnishment','employer')),
  calc        text not null default 'amount' check (calc in ('amount','percent')),
  default_amount numeric(12,2),
  annual_cap  numeric(12,2),
  gl_account  text,
  qbo_item    text,
  active      boolean not null default true
);
insert into public.deduction_codes (code,name,kind,calc) values
 ('MED','Medical','pretax','amount'),
 ('DEN','Dental','pretax','amount'),
 ('VIS','Vision','pretax','amount'),
 ('401K','401(k)','pretax','percent'),
 ('ROTH','Roth 401(k)','posttax','percent'),
 ('GARN','Garnishment','garnishment','amount'),
 ('MAPFML_EE','MA PFML employee','pretax','percent'),
 ('MAPFML_ER','MA PFML employer','employer','percent')
on conflict (code) do nothing;

create table if not exists public.employee_deductions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  code text not null references public.deduction_codes(code),
  amount numeric(12,2), percent numeric(6,3),
  effective_from date not null default current_date, effective_to date,
  note text, created_at timestamptz not null default now()
);

-- ── Tax profile. W-4 and Massachusetts M-4. ──────────────────────────
create table if not exists public.employee_tax_profile (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  federal_filing_status text check (federal_filing_status in ('single','married','married_separate','head_of_household')),
  federal_dependents_amt numeric(10,2) default 0,
  federal_other_income numeric(10,2) default 0,
  federal_deductions numeric(10,2) default 0,
  federal_extra_withholding numeric(10,2) default 0,
  federal_multiple_jobs boolean default false,
  state_code text default 'MA',
  state_filing_status text, state_exemptions integer default 0,
  state_extra_withholding numeric(10,2) default 0,
  exempt_federal boolean default false, exempt_state boolean default false,
  work_state text default 'MA', resident_state text default 'MA',
  updated_at timestamptz not null default now()
);
comment on table public.employee_tax_profile is
  'W-4 and Massachusetts M-4. work_state and resident_state exist so a future '
  'out-of-state hire does not require a schema change.';

-- ── Pay periods and runs. Open, review, approve, lock. ───────────────
create table if not exists public.pay_periods (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null, ends_on date not null, pay_date date not null,
  frequency text not null default 'weekly' check (frequency in ('weekly','biweekly','semimonthly','monthly')),
  status text not null default 'open' check (status in ('open','locked')),
  unique (starts_on, ends_on)
);

create table if not exists public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  pay_period_id uuid not null references public.pay_periods(id) on delete cascade,
  run_no text not null unique,
  kind text not null default 'regular' check (kind in ('regular','off_cycle','bonus','correction')),
  status text not null default 'draft' check (status in ('draft','review','approved','paid','void')),
  gross numeric(14,2), employee_taxes numeric(14,2), employer_taxes numeric(14,2),
  deductions numeric(14,2), net numeric(14,2), total_cost numeric(14,2),
  prepared_by uuid references auth.users(id), approved_by uuid references auth.users(id),
  approved_at timestamptz, exported_at timestamptz, qbo_journal_id text,
  note text, created_at timestamptz not null default now()
);
comment on table public.pay_runs is
  'A payroll batch. draft → review → approved → paid. Nothing is exported to '
  'QuickBooks or the payroll company until approved, and an approved run is never '
  'edited — a correction is a new run of kind=correction.';

create table if not exists public.pay_run_lines (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references public.pay_runs(id) on delete cascade,
  employee_id uuid not null references public.employees(id),
  earning_code text references public.earning_codes(code),
  deduction_code text references public.deduction_codes(code),
  department_id uuid references public.departments(id),
  cost_class text references public.cost_classes(code),
  hours numeric(8,2), rate numeric(10,4), amount numeric(12,2) not null,
  taxable boolean not null default true,
  gl_account text, memo text,
  created_at timestamptz not null default now(),
  check (earning_code is not null or deduction_code is not null)
);
create index if not exists prl_run_idx on public.pay_run_lines(pay_run_id, employee_id);
comment on table public.pay_run_lines is
  'Every earning and deduction, per person, per run — carrying the department and '
  'the 280E cost class so the tax split is a fact of the record, not a later guess.';

-- ── PTO. Policies, accrual, balance, requests. ───────────────────────
create table if not exists public.pto_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, kind text not null default 'pto' check (kind in ('pto','sick','unpaid','bereavement','jury','parental')),
  accrual_method text not null default 'per_hour_worked' check (accrual_method in ('per_hour_worked','per_pay_period','annual_grant','none')),
  accrual_rate numeric(8,4), annual_cap_hours numeric(8,2), carryover_cap_hours numeric(8,2),
  waiting_period_days integer default 0, max_negative_hours numeric(6,2) default 0,
  earning_code text references public.earning_codes(code), active boolean not null default true
);
comment on table public.pto_policies is
  'Massachusetts earned sick time is one hour per thirty worked, capped at forty a '
  'year — expressed as rows here so the rule can change without a deploy.';

create table if not exists public.employee_pto (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  policy_id uuid not null references public.pto_policies(id) on delete cascade,
  balance_hours numeric(8,2) not null default 0,
  accrued_ytd numeric(8,2) not null default 0, used_ytd numeric(8,2) not null default 0,
  updated_at timestamptz not null default now(), unique (employee_id, policy_id)
);

create table if not exists public.pto_ledger (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  policy_id uuid not null references public.pto_policies(id),
  entry_date date not null default current_date,
  kind text not null check (kind in ('accrual','use','adjustment','payout','carryover','forfeit')),
  hours numeric(8,2) not null, balance_after numeric(8,2),
  pay_run_id uuid references public.pay_runs(id), reason text,
  created_by uuid references auth.users(id), created_at timestamptz not null default now()
);
comment on table public.pto_ledger is
  'Every movement of every balance, forever. A balance you cannot explain line by '
  'line is a balance you cannot defend in a wage claim.';

create table if not exists public.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  policy_id uuid references public.pto_policies(id),
  starts_on date not null, ends_on date not null, hours numeric(8,2) not null,
  reason_code text, note text,
  status text not null default 'pending' check (status in ('pending','approved','denied','cancelled','withdrawn')),
  decided_by uuid references auth.users(id), decided_at timestamptz, decision_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null, holiday_date date not null,
  paid boolean not null default true, hours numeric(5,2) default 8,
  multiplier_if_worked numeric(4,2) default 1.50,
  department_id uuid references public.departments(id), active boolean not null default true,
  unique (name, holiday_date)
);

-- ── QuickBooks. Mapping both ways, and the journal it produces. ──────
create table if not exists public.qbo_account_map (
  id uuid primary key default gen_random_uuid(),
  purpose text not null unique,
  qbo_account_id text, qbo_account_name text, gl_code text,
  cost_class text references public.cost_classes(code), note text
);
insert into public.qbo_account_map (purpose) values
 ('wages_direct_production'),('wages_indirect_production'),('wages_selling'),
 ('wages_g_and_a'),('employer_fica'),('employer_futa'),('employer_ma_ui'),
 ('employer_ma_pfml'),('payroll_liabilities'),('cash')
on conflict (purpose) do nothing;

create table if not exists public.qbo_employee_map (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  qbo_employee_id text, qbo_display_name text,
  payroll_provider_id text, last_synced_at timestamptz, sync_note text
);
comment on table public.qbo_employee_map is
  'Links a person to their QuickBooks employee record and to the payroll company''s '
  'own id. Without this a payroll export is guessing at who is who.';

create table if not exists public.payroll_imports (
  id uuid primary key default gen_random_uuid(),
  source text not null, file_name text, storage_path text,
  period_start date, period_end date,
  rows_total integer, rows_matched integer, rows_unmatched integer,
  status text not null default 'uploaded' check (status in ('uploaded','parsed','matched','posted','failed')),
  raw jsonb, error text,
  uploaded_by uuid references auth.users(id), uploaded_at timestamptz not null default now()
);
comment on table public.payroll_imports is
  'Payroll reports uploaded back from the provider, and the agent map used to '
  'reconcile them. rows_unmatched is the number that matters.';

-- ── The journal a run produces, split by 280E class. ─────────────────
create or replace view public.v_payroll_journal with (security_invoker = on) as
select r.id as pay_run_id, r.run_no, p.pay_date,
       coalesce(l.cost_class, d.cost_class, 'G_AND_A') as cost_class,
       cc.cogs, cc.irc_280e_deductible,
       coalesce(d.name,'Unassigned') as department,
       case when l.earning_code is not null then 'debit' else 'credit' end as side,
       coalesce(l.earning_code, l.deduction_code) as code,
       coalesce(l.gl_account, m.gl_code, m.qbo_account_name) as gl_account,
       sum(l.amount) as amount
from public.pay_run_lines l
join public.pay_runs r on r.id = l.pay_run_id
join public.pay_periods p on p.id = r.pay_period_id
left join public.departments d on d.id = l.department_id
left join public.cost_classes cc on cc.code = coalesce(l.cost_class, d.cost_class, 'G_AND_A')
left join public.qbo_account_map m
  on m.purpose = case coalesce(l.cost_class, d.cost_class, 'G_AND_A')
                   when 'DIRECT_PROD'   then 'wages_direct_production'
                   when 'INDIRECT_PROD' then 'wages_indirect_production'
                   when 'SELLING'       then 'wages_selling'
                   else 'wages_g_and_a' end
where r.status in ('approved','paid')
group by r.id, r.run_no, p.pay_date, l.cost_class, d.cost_class, cc.cogs,
         cc.irc_280e_deductible, d.name, l.earning_code, l.deduction_code,
         l.gl_account, m.gl_code, m.qbo_account_name;

comment on view public.v_payroll_journal is
  'The journal entry a run produces, already split by 280E class — deductible COGS '
  'labour separated from disallowed selling and administrative labour. This is what '
  'posts to QuickBooks, and what an auditor asks to see first.';

create or replace view public.v_payroll_ytd with (security_invoker = on) as
select l.employee_id, e.employee_code, e.full_name,
       extract(year from p.pay_date)::int as tax_year,
       sum(l.amount) filter (where l.earning_code is not null) as gross_ytd,
       sum(l.amount) filter (where l.earning_code is not null and l.taxable) as taxable_ytd,
       sum(l.amount) filter (where l.deduction_code is not null) as deductions_ytd,
       sum(l.hours)  filter (where l.earning_code = 'REG') as regular_hours_ytd,
       sum(l.hours)  filter (where l.earning_code = 'OT')  as ot_hours_ytd,
       sum(l.amount) filter (where l.earning_code is not null)
         - coalesce(sum(l.amount) filter (where l.deduction_code is not null),0) as net_ytd
from public.pay_run_lines l
join public.pay_runs r on r.id = l.pay_run_id and r.status in ('approved','paid')
join public.pay_periods p on p.id = r.pay_period_id
join public.employees e on e.id = l.employee_id
group by l.employee_id, e.employee_code, e.full_name, extract(year from p.pay_date);

comment on view public.v_payroll_ytd is
  'Year-to-date accumulators per person — the basis of a pay stub and of W-2 prep.';

-- ── RLS. Pay is the most sensitive data here. ────────────────────────
do $$ declare t text; begin
  foreach t in array array['cost_classes','earning_codes','deduction_codes','employee_deductions',
    'employee_tax_profile','pay_periods','pay_runs','pay_run_lines','pto_policies','employee_pto',
    'pto_ledger','time_off_requests','holidays','qbo_account_map','qbo_employee_map','payroll_imports']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy pr_read   on public.pay_runs        for select to authenticated using (public.f_can_read_hr());
create policy prl_read  on public.pay_run_lines   for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy pp_read   on public.pay_periods     for select to authenticated using (public.f_can_read_hr());
create policy ded_self  on public.employee_deductions for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy tax_self  on public.employee_tax_profile for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy pto_self  on public.employee_pto    for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy ptol_self on public.pto_ledger      for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy tor_self  on public.time_off_requests for select to authenticated
  using (employee_id = public.f_my_employee_id() or public.f_can_read_hr());
create policy tor_mine  on public.time_off_requests for insert to authenticated
  with check (employee_id = public.f_my_employee_id());
create policy hol_read  on public.holidays        for select to authenticated using (true);
create policy cc_read   on public.cost_classes    for select to authenticated using (true);
create policy ec_read   on public.earning_codes   for select to authenticated using (true);
create policy dc_read   on public.deduction_codes for select to authenticated using (true);
create policy ptop_read on public.pto_policies    for select to authenticated using (true);
create policy qbo_a     on public.qbo_account_map for select to authenticated using (public.f_can_read_hr());
create policy qbo_e     on public.qbo_employee_map for select to authenticated using (public.f_can_read_hr());
create policy pimp_read on public.payroll_imports for select to authenticated using (public.f_can_read_hr());

grant select on public.cost_classes, public.earning_codes, public.deduction_codes,
                public.pto_policies, public.holidays, public.employee_pto, public.pto_ledger,
                public.time_off_requests, public.employee_deductions, public.employee_tax_profile,
                public.pay_periods, public.pay_runs, public.pay_run_lines,
                public.qbo_account_map, public.qbo_employee_map, public.payroll_imports,
                public.v_payroll_journal, public.v_payroll_ytd to authenticated;
grant insert on public.time_off_requests to authenticated;;
