-- The staff home. Deliberately NOT admin_only and NOT gated on f_can_read_hr:
-- it shows a person only their own data, enforced by RLS through
-- f_my_employee_id(), so the page is safe for everyone precisely because the
-- database decides what it can see rather than the page.
insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'My Week',69,'calendar','my_week','employee_schedules',
  'Your shift, your hours, your attendance points and what clears when, documents to sign, and extra shifts you can claim. Your own record only.',
  true,'#2df26a',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select subcategory, count(*) from public.nav_registry
where enabled and surface='hr' group by 1 order by 2 desc;;
