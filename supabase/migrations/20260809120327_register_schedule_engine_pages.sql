insert into public.nav_registry
  (category, category_order, label, item_order, icon, view_key, table_ref,
   description, enabled, color, admin_only, surface, subcategory, page_kind,
   date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Schedule Drafts',36,'calendar','schedule_drafts','schedule_drafts',
  'Proposed weeks. A human or an agent may draft one; only a human may post it. Posting is what makes it real for staff.',
  true,'#e2bd63',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Draft Lines',37,'clip','schedule_draft_lines','schedule_draft_lines',
  'Every proposed shift with its zone, break window and any conflict — unavailable, licence expired, would breach overtime — flagged before it is posted.',
  true,'#e2bd63',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Open Shifts',38,'clock','open_shifts','open_shifts',
  'Unfilled shifts and calls for extra hours, weekends or a second shift. First-come or manager-approved.',
  true,'#2df26a',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Shift Claims',39,'check','shift_claims','shift_claims',
  'Who claimed what, and whether approving it would cost overtime — known before approval, not after payroll.',
  true,'#2df26a',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Shift Swaps',40,'clock','shift_swaps','shift_swaps',
  'Both parties agree, then a manager approves. Two gates, because a swap changes two people''s pay and the coverage of two zones.',
  true,'#57a9ff',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Call-outs',41,'clock','callouts','callouts',
  'Who could not make a shift, with the reason code and whether proper notice was given — computed against policy, not argued later.',
  true,'#ff4245',false,'hr','Time & Scheduling','report','auto','this_month_td','activity'),
 ('Human Resources',7,'Availability',42,'calendar','employee_availability','employee_availability',
  'When each person can and cannot work. Staff maintain their own; a manager can override. Scheduling without this is guessing.',
  true,'#2df26a',false,'hr','Time & Scheduling','report','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Who Can Work Today',43,'people','schedulable','v_schedulable',
  'Who can legally and practically take a shift right now. A lapsed agent registration makes someone unschedulable however available they are.',
  true,'#2df26a',false,'hr','Time & Scheduling','report','not_applicable',null,'snapshot')
on conflict do nothing;

select count(*) as hr_pages,
       count(*) filter (where subcategory='Time & Scheduling') as scheduling_pages,
       count(*) filter (where subcategory='Payroll & Budget')  as payroll_pages
from public.nav_registry where enabled and surface='hr';;
