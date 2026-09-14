-- Human Resources → the HR platform. APPLY ONLY WITH THE DEPLOY THAT CARRIES cockpit-rail.jsx/App.jsx
-- from PR #238 (view 'hr_platform' opens /hr). Applied and reverted on 12 Sep 2026 because the live OS
-- reads nav_registry live while the code was still on the branch: the production menu lost its HR pages
-- and gained a button that opened nothing. Nothing is deleted here; superseded rows are disabled and kept.
update public.nav_registry set enabled = true where view_key = 'hr_platform';

update public.nav_registry set category = 'Settings', subcategory = 'Integrations', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026.'
 where view_key in ('qbo_account_map', 'qbo_employee_map', 'payroll_imports', 'hr_external_task') and category = 'Human Resources';
update public.nav_registry set category = 'Settings', subcategory = 'Alerts', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: the OS alert outbox and owner-configured recipient lists.'
 where view_key in ('hr_delivery', 'hr_message_recipient') and category = 'Human Resources';
update public.nav_registry set category = 'Settings', subcategory = 'Devices & Clock', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: the physical clock and device layer; punches feed the HR platform.'
 where view_key in ('kiosk', 'punch_queue', 'terminals', 'clock_readiness') and category = 'Human Resources';
update public.nav_registry set category = 'Finance', subcategory = 'Payroll (280E)', category_order = (select min(category_order) from public.nav_registry where category = 'Finance'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: TG finance views over payroll.'
 where view_key in ('payroll_journal', 'cost_classes', 'tax_profiles', 'earning_codes', 'deduction_codes', 'pay_runs', 'pay_run_lines', 'payroll_ytd', 'labour_forecast', 'plan_payroll', 'labor_budgets', 'v-payroll-week', 'dept_labour')
   and category = 'Human Resources';
update public.nav_registry set enabled = false,
       description = coalesce(description, '') || ' Superseded 12 Sep 2026 by the HR platform (/hr) at the owner''s direction; row kept, page code kept, data kept.'
 where category = 'Human Resources' and view_key <> 'hr_platform' and enabled;
