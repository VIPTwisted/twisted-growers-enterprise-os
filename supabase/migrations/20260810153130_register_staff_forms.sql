-- The three forms behind My Week's action buttons. Until now those buttons
-- navigated to raw table grids — a packager tapping "Call out" at 5:40 got a
-- database view with a column header row.
insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Call Out',72,'clock','my_callout','callouts',
  'Tell us you cannot make a shift. The notice you are giving is computed against policy and shown before you send, so nobody discovers afterwards that they were an hour short.',
  true,'#ff4245',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Request Time Off',73,'calendar','my_timeoff','time_off_requests',
  'Your balance is shown first, so a request for more hours than you hold is visible while you type it rather than denied a week later.',
  true,'#2df26a',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Report an Incident',74,'shield','my_incident','hr_incidents',
  'Write down what happened while it is fresh. A near miss is worth reporting precisely because nothing happened that time. You are never asked whether it is recordable — that is a determination, and Human Resources makes it.',
  true,'#e2bd63',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select subcategory, count(*) n from public.nav_registry
where enabled and surface='hr' group by 1 order by n desc;;
