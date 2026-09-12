-- Owner, 12 Sep 2026: "keep it simple and be taken to the HR platform main Dashboard for HR".
-- Menu change only (rename / consolidate / add / remove are allowed under the frozen-surfaces ruling).
-- Nothing is deleted: superseded rows are disabled with the reason in their description; OS-only items
-- that were parked under Human Resources move to the category they belong to.

-- 1. the door
insert into public.nav_registry (category, category_order, label, item_order, icon, view_key, milestone, description, enabled, surface, page_kind, subcategory, module)
select 'Human Resources', coalesce((select min(category_order) from public.nav_registry where category = 'Human Resources'), 90), 'HR Platform', 0, 'users', 'hr_platform', 'live',
       'The Twisted Growers HR platform (/hr): dashboard, scheduling, time clock, people, documents, training, payroll. Same sign-in, same database.', true, 'side', 'application', 'Dashboard', 'hr'
where not exists (select 1 from public.nav_registry where view_key = 'hr_platform');

-- 2. OS-only items re-homed (they are not HR pages; they were parked here)
update public.nav_registry set category = 'Settings', subcategory = 'Integrations', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026.'
 where view_key in ('qbo_account_map', 'qbo_employee_map', 'payroll_imports', 'hr_external_task') and category = 'Human Resources';

update public.nav_registry set category = 'Settings', subcategory = 'Alerts', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: these are the OS alert outbox and the owner-configured recipient lists.'
 where view_key in ('hr_delivery', 'hr_message_recipient') and category = 'Human Resources';

update public.nav_registry set category = 'Settings', subcategory = 'Devices & Clock', category_order = (select min(category_order) from public.nav_registry where category = 'Settings'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: the physical clock and device layer; punches feed the HR platform.'
 where view_key in ('kiosk', 'punch_queue', 'terminals', 'clock_readiness') and category = 'Human Resources';

update public.nav_registry set category = 'Finance', subcategory = 'Payroll (280E)', category_order = (select min(category_order) from public.nav_registry where category = 'Finance'),
       description = coalesce(description, '') || ' Re-homed from Human Resources 12 Sep 2026: TG finance views over payroll — 280E cost classes, journals, forecasts.'
 where view_key in ('payroll_journal', 'cost_classes', 'tax_profiles', 'earning_codes', 'deduction_codes', 'pay_runs', 'pay_run_lines', 'payroll_ytd', 'labour_forecast', 'plan_payroll', 'labor_budgets', 'v-payroll-week', 'dept_labour')
   and category = 'Human Resources';

-- 3. everything else under Human Resources is superseded by the platform: off, kept, explained
update public.nav_registry set enabled = false,
       description = coalesce(description, '') || ' Superseded 12 Sep 2026 by the HR platform (/hr) at the owner''s direction; row kept, page code kept, data kept.'
 where category = 'Human Resources' and view_key <> 'hr_platform' and enabled;

select 'HR enabled' k, count(*)::text v from public.nav_registry where category = 'Human Resources' and enabled
union all select 'HR disabled', count(*)::text from public.nav_registry where category = 'Human Resources' and not enabled
union all select 'moved to Settings', count(*)::text from public.nav_registry where category = 'Settings' and description like '%Re-homed from Human Resources%'
union all select 'moved to Finance', count(*)::text from public.nav_registry where category = 'Finance' and description like '%Re-homed from Human Resources%';
