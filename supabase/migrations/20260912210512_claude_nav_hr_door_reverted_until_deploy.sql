-- REVERT of claude_nav_human_resources_is_the_hr_platform, 12 Sep 2026 21:05 UTC.
-- The live OS reads nav_registry live, but the rail/App code that makes the 'hr_platform' entry open
-- /hr is only on branch claude/hr-platform. So the production menu lost its Human Resources pages and
-- gained a button that did nothing — a regression I caused. Everything goes back exactly as it was;
-- the door is re-applied by the deploy that carries the code (see tools/repairs/claude-nav-hr-door.sql).
update public.nav_registry set enabled = true,
       description = replace(description, ' Superseded 12 Sep 2026 by the HR platform (/hr) at the owner''s direction; row kept, page code kept, data kept.', '')
 where category = 'Human Resources' and not enabled and description like '%Superseded 12 Sep 2026 by the HR platform%';

update public.nav_registry set category = 'Human Resources', subcategory = 'Integrations', category_order = (select min(category_order) from public.nav_registry where category = 'Human Resources' and view_key <> 'hr_platform'),
       description = replace(description, ' Re-homed from Human Resources 12 Sep 2026.', '')
 where view_key in ('qbo_account_map', 'qbo_employee_map', 'payroll_imports', 'hr_external_task') and category = 'Settings';

update public.nav_registry set category = 'Human Resources', subcategory = 'Communications', category_order = (select min(category_order) from public.nav_registry where category = 'Human Resources' and view_key <> 'hr_platform'),
       description = replace(description, ' Re-homed from Human Resources 12 Sep 2026: these are the OS alert outbox and the owner-configured recipient lists.', '')
 where view_key in ('hr_delivery', 'hr_message_recipient') and category = 'Settings';

update public.nav_registry set category = 'Human Resources', subcategory = 'Live', category_order = (select min(category_order) from public.nav_registry where category = 'Human Resources' and view_key <> 'hr_platform'),
       description = replace(description, ' Re-homed from Human Resources 12 Sep 2026: the physical clock and device layer; punches feed the HR platform.', '')
 where view_key in ('kiosk', 'punch_queue', 'terminals', 'clock_readiness') and category = 'Settings';

update public.nav_registry set category = 'Human Resources', subcategory = case when view_key = 'v-payroll-week' then 'All Data' else 'Payroll & Budget' end,
       category_order = (select min(category_order) from public.nav_registry where category = 'Human Resources' and view_key <> 'hr_platform'),
       description = replace(description, ' Re-homed from Human Resources 12 Sep 2026: TG finance views over payroll — 280E cost classes, journals, forecasts.', '')
 where view_key in ('payroll_journal', 'cost_classes', 'tax_profiles', 'earning_codes', 'deduction_codes', 'pay_runs', 'pay_run_lines', 'payroll_ytd', 'labour_forecast', 'plan_payroll', 'labor_budgets', 'v-payroll-week', 'dept_labour')
   and category = 'Finance';

-- the door row stays but is off until the code that opens it is live
update public.nav_registry set enabled = false where view_key = 'hr_platform';
