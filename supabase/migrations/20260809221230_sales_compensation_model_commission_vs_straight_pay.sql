-- Agent G, 9 Aug 2026. Owner: "hr HAS TO SET WHO IS COMMISSION VS STRAIGHT PAY
-- MAKE SURE ALL FIELDS ARE BUILT."
--
-- MEASURED BEFORE BUILDING: pay_basis is an enum of exactly ('hourly','weekly_salary').
-- earning_codes holds 9 codes - BON DT HOL OT PTO REG REIM RETRO SICK - and NOT ONE of them
-- is commission. So the designation the owner is asking for could not be recorded at all, and
-- a commission could not have been paid through the payroll model even if it had been.
--
-- WHY A SEPARATE STRUCTURE RATHER THAN A NEW pay_basis VALUE. Two reasons. Base pay basis and
-- commission eligibility are INDEPENDENT facts - a person can be hourly AND on commission -
-- so folding them into one enum makes the common case unrepresentable. And ALTER TYPE ... ADD
-- VALUE cannot be undone in Postgres: an enum value is permanent. Rule Zero says a change that
-- cannot be undone needs the owner, and this one did not have to be irreversible.
--
-- COMMISSION IS PAY, SO IT IS HR, SO IT REQUIRES A HUMAN. Owner ruling: "ALL HR REQUIRES
-- HUMAN." Every table here carries provisional/approved_by, following employee_rates - because
-- 21 pay rates nobody had approved were once shown with exactly the confidence of rates
-- somebody had.
--
-- 280E. cost_classes already carries the answer: SELLING is cogs=false,
-- irc_280e_deductible=false, "Sales and delivery - disallowed under 280E". Sales commission is
-- a selling expense, so it defaults there and is NOT inventoriable. Getting this wrong
-- overstates a deduction on a federal return.
--
-- UNDO: drop table commission_ledger, sales_rep, employee_compensation, commission_rule,
--       commission_plan cascade;  delete from earning_codes where code='COM';
--       (btree_gist may be left in place - it is inert.)

create extension if not exists btree_gist;

-- ── 1. THE PLAN ───────────────────────────────────────────────────────────────────
create table if not exists commission_plan (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  -- THE BASIS IS THE WHOLE ARGUMENT. Gross revenue, net of discount, gross margin and cash
  -- actually collected are four different numbers off the same order. Rule A5: a figure that
  -- does not say what it is will be quoted as something else.
  basis            text not null check (basis in
                     ('gross_revenue','net_of_discount','gross_margin','cash_collected')),
  -- EARNED IS NOT PAYABLE. A commission accrues on the order and becomes payable on the
  -- trigger. Pay on order and a cancelled or unpaid order has to be clawed back out of
  -- somebody's wages, which is a wage-claim conversation nobody wants.
  payable_trigger  text not null check (payable_trigger in
                     ('on_order','on_delivery','on_collection')),
  effective_from   date not null,
  effective_to     date,
  approved_by      uuid references employees(id),
  approved_at      timestamptz,
  note             text,
  created_at       timestamptz not null default now(),
  constraint plan_dates_ordered check (effective_to is null or effective_to >= effective_from),
  constraint plan_approval_is_whole check ((approved_by is null) = (approved_at is null))
);
comment on table commission_plan is
  'A commission scheme. basis and payable_trigger are NOT NULL because a plan that does not '
  'state which number it pays on, and when it becomes payable, is a dispute waiting to happen. '
  'Unapproved plans are visible and usable for MODELLING only - commission_ledger rows computed '
  'against them stay provisional.';

-- ── 2. THE RATES INSIDE IT ────────────────────────────────────────────────────────
create table if not exists commission_rule (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references commission_plan(id) on delete cascade,
  applies_to     text not null default 'all'
                   check (applies_to in ('all','brand','product_category','customer')),
  applies_to_key text,
  tier_from      numeric(14,2) not null default 0,
  tier_to        numeric(14,2),
  rate_pct       numeric(7,4),
  flat_amount    numeric(14,2),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  -- Exactly one of the two, never both and never neither: a rule that pays nothing, or pays
  -- twice, reads as a rule.
  constraint rule_pays_exactly_one_way check (num_nonnulls(rate_pct, flat_amount) = 1),
  constraint rule_tier_ordered check (tier_to is null or tier_to > tier_from),
  constraint rule_scope_needs_a_key check ((applies_to = 'all') = (applies_to_key is null))
);
comment on table commission_rule is
  'Tiers and rates within a plan. applies_to_key is the brand, product category or customer '
  'the rule is scoped to, and the CHECK refuses a scoped rule with no key - which would '
  'silently apply to everything.';

-- ── 3. WHO IS COMMISSION AND WHO IS STRAIGHT PAY — the owner''s actual ask ─────────
create table if not exists employee_compensation (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references employees(id),
  pay_structure      text not null check (pay_structure in
                       ('straight_hourly','straight_salary',
                        'hourly_plus_commission','salary_plus_commission',
                        'commission_only','draw_against_commission')),
  commission_plan_id uuid references commission_plan(id),
  draw_amount        numeric(14,2),
  draw_period        text check (draw_period in ('weekly','biweekly','semimonthly','monthly')),
  -- A NON-RECOVERABLE DRAW IS A SALARY WEARING A DIFFERENT NAME, and it is taxed and
  -- budgeted differently. Making it explicit stops the two being confused at year end.
  draw_recoverable   boolean,
  cost_class         text not null default 'SELLING' references cost_classes(code),
  effective_from     date not null,
  effective_to       date,
  approved_by        uuid references employees(id),
  approved_at        timestamptz,
  provisional        boolean not null default true,
  note               text,
  created_at         timestamptz not null default now(),
  constraint comp_dates_ordered check (effective_to is null or effective_to >= effective_from),
  constraint comp_approval_is_whole check ((approved_by is null) = (approved_at is null)),
  -- THE ENFORCEMENT THE OWNER ASKED FOR. A structure that includes commission MUST name its
  -- plan, and a straight-pay structure must NOT carry one. "Commission-eligible with no plan"
  -- is the state where somebody is owed a number nobody can compute.
  constraint comp_commission_needs_a_plan check (
    (pay_structure in ('hourly_plus_commission','salary_plus_commission',
                       'commission_only','draw_against_commission'))
    = (commission_plan_id is not null)),
  -- Draw fields belong to exactly one structure.
  constraint comp_draw_only_when_drawing check (
    (pay_structure = 'draw_against_commission')
    = (num_nonnulls(draw_amount, draw_period, draw_recoverable) = 3)),
  -- No two overlapping compensation rows for one person: which one governs a pay run would
  -- otherwise be whichever the query happened to return first.
  constraint comp_no_overlap exclude using gist (
    employee_id with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&)
);
comment on table employee_compensation is
  'WHO IS COMMISSION AND WHO IS STRAIGHT PAY - owner instruction, 9 Aug 2026. Deliberately '
  'separate from employee_rates.basis (hourly | weekly_salary), which is the BASE pay basis: '
  'the two are independent facts and a person can be hourly AND on commission. A CHECK '
  'constraint refuses a commission structure with no plan and a straight-pay structure that '
  'carries one, so "commission-eligible but uncomputable" cannot be stored. Effective-dated '
  'and non-overlapping. provisional defaults TRUE: nothing here is an approved pay term until '
  'a person approves it.';

-- ── 4. THE REP, MATCHED ON EMAIL AND NEVER ON NAME ────────────────────────────────
create table if not exists sales_rep (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid references employees(id),
  -- Apex sales_reps carries ONLY name, phone and email - no rep id anywhere in the API. A
  -- name has no key and drifts exactly the way "Nova Farms LLC" / "Nova Farms, LLC" drifts.
  apex_rep_email text not null,
  apex_rep_name  text,
  apex_rep_phone text,
  territory      text,
  quota_amount   numeric(14,2),
  quota_period   text check (quota_period in ('monthly','quarterly','annual')),
  effective_from date not null default current_date,
  effective_to   date,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint rep_email_lowercase check (apex_rep_email = lower(apex_rep_email)),
  constraint rep_quota_is_whole check ((quota_amount is null) = (quota_period is null)),
  constraint rep_dates_ordered check (effective_to is null or effective_to >= effective_from)
);
create unique index if not exists sales_rep_email_active_uk
  on sales_rep (apex_rep_email) where active;
comment on table sales_rep is
  'Links an Apex sales rep to an employee. MATCHED ON EMAIL, NEVER ON NAME - Apex exposes no '
  'rep id. employee_id is NULLABLE on purpose: an Apex rep with no employee match must be '
  'stored and FLAGGED, never guessed at and never dropped, or their orders silently lose '
  'their attribution.';

-- ── 5. THE LEDGER ─────────────────────────────────────────────────────────────────
create table if not exists commission_ledger (
  id                  uuid primary key default gen_random_uuid(),
  rep_employee_id     uuid references employees(id),
  sales_rep_id        uuid references sales_rep(id),
  plan_id             uuid not null references commission_plan(id),
  rule_id             uuid references commission_rule(id),
  apex_order_id       text,
  apex_order_line_id  text,
  metrc_package_label text,
  -- THE BASIS AND ITS KIND TRAVEL TOGETHER. Copied in rather than joined, so the ledger row
  -- still explains itself after the plan is amended. Rule A5.
  basis_kind          text not null,
  basis_amount        numeric(14,2) not null,
  rate_pct            numeric(7,4),
  flat_amount         numeric(14,2),
  earned_amount       numeric(14,2) not null,
  status              text not null default 'accrued'
                        check (status in ('accrued','payable','approved','paid','clawed_back','void')),
  approved_by         uuid references employees(id),
  approved_at         timestamptz,
  pay_run_line_id     uuid references pay_run_lines(id),
  provisional         boolean not null default true,
  computed_at         timestamptz not null default now(),
  computed_by         text not null default f_actor(),
  note                text,
  constraint ledger_approval_is_whole check ((approved_by is null) = (approved_at is null)),
  -- A COMPUTED FIGURE CANNOT REACH AN APPROVED STATE WITHOUT A NAMED PERSON. This is the
  -- machine half of "ALL HR REQUIRES HUMAN" - an agent cannot mark its own homework.
  constraint ledger_approved_states_need_a_person check (
    status not in ('approved','paid') or approved_by is not null),
  constraint ledger_paid_is_not_provisional check (status <> 'paid' or provisional = false)
);
create index if not exists commission_ledger_rep_idx on commission_ledger (rep_employee_id, status);
create index if not exists commission_ledger_order_idx on commission_ledger (apex_order_id);
comment on table commission_ledger is
  'One row per order line per rep. Apex exposes no commission amount anywhere in its API, so '
  'this is the ONLY machine-readable commission figure in the business and it must be right. '
  'earned / payable / approved / paid are kept as separate states because they are separate '
  'facts: an accrual on an uncollected order is not money owed to anyone yet. A CHECK refuses '
  'approved or paid without a named approver.';

-- ── 6. PAYROLL CAN NOW CARRY IT ───────────────────────────────────────────────────
-- counts_to_ot is TRUE deliberately and it is the conservative reading: under the FLSA,
-- NONDISCRETIONARY commission must be included in the regular rate when computing overtime for
-- a non-exempt employee. Whether a given plan is discretionary is a legal question, not a
-- schema one - raised as an open question rather than decided here.
insert into earning_codes (code, name, kind, multiplier, taxable, counts_to_ot, cost_class, active)
values ('COM', 'Commission', 'commission', 1, true, true, 'SELLING', true)
on conflict (code) do nothing;

-- ── 7. RLS AT CREATION, NEVER AFTER ───────────────────────────────────────────────
-- Postgres defaults it off and three tables shipped wide open on 7 Aug 2026. The read rule
-- follows pay_run_lines exactly: your own row, or somebody with HR read rights. Commission is
-- pay, and per-person pay is not a figure that rolls up to anyone who asks.
alter table commission_plan       enable row level security;
alter table commission_rule       enable row level security;
alter table employee_compensation enable row level security;
alter table sales_rep             enable row level security;
alter table commission_ledger     enable row level security;

create policy comp_plan_read on commission_plan for select using (f_can_read_hr() or is_executive());
create policy comp_plan_write on commission_plan for all using (f_can_decide_hr()) with check (f_can_decide_hr());

create policy comp_rule_read on commission_rule for select using (f_can_read_hr() or is_executive());
create policy comp_rule_write on commission_rule for all using (f_can_decide_hr()) with check (f_can_decide_hr());

create policy emp_comp_read on employee_compensation for select
  using (employee_id = f_my_employee_id() or f_can_read_hr());
create policy emp_comp_write on employee_compensation for all
  using (f_can_decide_hr()) with check (f_can_decide_hr());

create policy sales_rep_read on sales_rep for select
  using (employee_id = f_my_employee_id() or f_can_read_hr() or is_executive());
create policy sales_rep_write on sales_rep for all using (f_can_decide_hr()) with check (f_can_decide_hr());

create policy comm_ledger_read on commission_ledger for select
  using (rep_employee_id = f_my_employee_id() or f_can_read_hr());
create policy comm_ledger_write on commission_ledger for all
  using (f_can_decide_hr()) with check (f_can_decide_hr());;
