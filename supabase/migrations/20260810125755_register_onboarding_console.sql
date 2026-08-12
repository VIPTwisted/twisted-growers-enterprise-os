insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Onboarding Console',71,'people','onboard','employees',
  'Bring one person on in a single pass — who they are, how they are paid, how they clock in, the statutory checklist, and a welcome that is drafted rather than sent. The rate box starts empty and stays empty until a person types a real one.',
  true,'#2df26a',true,'hr','People','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select count(*) as hr_pages,
       count(*) filter (where page_kind='custom') as purpose_built
from public.nav_registry where enabled and surface='hr';;
