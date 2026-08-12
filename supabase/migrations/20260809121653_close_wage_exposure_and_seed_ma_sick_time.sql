-- 1. WAGE EXPOSURE. Four views were created without security_invoker, so they
--    execute as their owner and RLS on employees and employee_rates never
--    applies. Any authenticated user could read a colleague's pay rate through
--    v_payroll_week. Both tables already carry RLS with policies — the views
--    were the hole, not the tables. ALTER VIEW, not DROP: rule E1 stands and
--    nothing downstream is disturbed.
alter view public.v_payroll_week        set (security_invoker = on);
alter view public.v_schedule_compliance set (security_invoker = on);
alter view public.v_schedule_discipline set (security_invoker = on);
alter view public.v_schedule_scorecard  set (security_invoker = on);

comment on view public.v_payroll_week is
  'Weekly pay per person. security_invoker set 8 Aug 2026 — it previously ran as '
  'definer and bypassed row-level security on employee_rates, exposing every '
  'colleague''s wage to every signed-in user.';

-- 2. MASSACHUSETTS EARNED SICK TIME. The statute, as rows: one hour accrued
--    per thirty worked, forty hours a year, forty carried over. Written here
--    rather than assumed from the table shape.
insert into public.pto_policies
  (name, kind, accrual_method, accrual_rate, annual_cap_hours, carryover_cap_hours,
   waiting_period_days, earning_code, active)
select 'Massachusetts Earned Sick Time', 'sick', 'per_hour_worked',
       (1.0/30.0)::numeric(8,4), 40.00, 40.00, 90, 'SICK', true
where not exists (select 1 from public.pto_policies where name = 'Massachusetts Earned Sick Time');

comment on table public.pto_policies is
  'Accrual rules as rows. The Massachusetts Earned Sick Time row encodes the '
  'statute: 1 hour per 30 worked (0.0333), 40-hour annual cap, 40-hour carryover, '
  '90-day waiting period before use. Change the statute, change the row.';

-- 3. PUNCH IDENTITY, decided and written down.
--    app_users  = who you are in the APP (email + password, RLS, sees own data)
--    pin_hash   = who you are at a SHARED TERMINAL (login_id + PIN, no session)
--    badge_code = who you are at a DOOR (fob, no interaction)
--    They are three surfaces for one person, not competing identities. A packager
--    with no app login can still punch at the wall; an office manager with an app
--    login need never have a PIN.
comment on column public.employees.pin_hash is
  'Kiosk identity: bcrypt PIN used with login_id at a shared wall terminal. '
  'Deliberately separate from app_users — a shared terminal must never hold a '
  'session, and staff without an app login must still be able to clock in.';

-- Every active person needs a login_id to punch at a kiosk. Backfill any gap.
select public.f_assign_login_ids(false);

select
  (select count(*) from public.pto_policies where name='Massachusetts Earned Sick Time') as ma_sick_row,
  (select count(*) from public.employees where status::text='active' and login_id is null) as active_without_login_id,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in
      ('v_payroll_week','v_schedule_compliance','v_schedule_discipline','v_schedule_scorecard')
      and (select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker')='true'
  ) as views_now_secured;;
