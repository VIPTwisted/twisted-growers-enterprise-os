insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Run Payroll',75,'dollar','pay_runs','pay_runs',
  'Open a run, review it, approve it, lock it. Approving is witnessed and records what was approved. An approved run is never edited — a correction is a new run. Refuses to open while any wage rate is a planning placeholder.',
  true,'#e2bd63',true,'hr','Payroll & Budget','custom','hr','not_applicable',null,'snapshot'),
 ('Human Resources',7,'My Availability',76,'calendar','my_availability','employee_availability',
  'When you can work at all. This is not time off — time off spends a balance; availability describes the days you can be scheduled.',
  true,'#2df26a',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot'),
 ('Human Resources',7,'Swap a Shift',77,'clock','my_swap','shift_swaps',
  'Pick the shift you cannot work and who is taking it. They agree first, then a manager approves — two gates, because a swap moves two people''s pay and the cover on two zones.',
  true,'#57a9ff',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select subcategory, count(*) n, count(*) filter (where page_kind='custom') built
from public.nav_registry where enabled and surface='hr'
group by subcategory order by n desc;;
