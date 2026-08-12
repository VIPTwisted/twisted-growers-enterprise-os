-- The four purpose-built React screens, registered so they appear in the menu
-- like every other page. page_kind='custom' marks them as bespoke components
-- rather than the generic report screen — the owner's rule of 8 Aug 2026:
-- share primitives, never layouts.
insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Timesheets',55,'clock','timesheets','time_entries',
  'My timesheet, the whole floor, and approvals. Week grid per day with each person measured against their own capacity — never assumed to be forty. A missing clock-out cannot be approved.',
  true,'#2df26a',false,'hr','Time & Scheduling','custom','auto','this_month_td','activity'),
 ('Human Resources',7,'Schedule Builder',56,'calendar','schedule_builder','schedule_drafts',
  'Build a week: people down, days across. Conflicts show in the cell before posting — unavailable, licence lapsed, heading into overtime — and cost totals as you build. An agent may draft; only a person may post.',
  true,'#e2bd63',false,'hr','Time & Scheduling','custom','auto','this_month_td','activity'),
 ('Human Resources',7,'Employee File',57,'people','employee_file','employees',
  'One person, everything. Leads with what stops work, then attendance, documents signed, compliance, schedule. Pay is last and visible only to payroll roles.',
  true,'#2df26a',false,'hr','People','custom','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Wall Terminal',58,'clock','kiosk','time_entries',
  'The clock-in screen for a shared tablet. No session, large targets, ID then PIN. A late punch is challenged at the terminal while the reason is fresh.',
  true,'#57a9ff',true,'hr','Live','custom','not_applicable',null,'snapshot')
on conflict do nothing;

select count(*) filter (where page_kind='custom') as purpose_built,
       count(*) as hr_pages
from public.nav_registry where enabled and surface='hr';;
