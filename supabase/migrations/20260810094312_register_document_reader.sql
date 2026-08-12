-- The reader. hr_document_sections, _progress and _acknowledgements existed
-- from the documents migration with nothing able to read or sign — the whole
-- evidence chain was empty tables. Same failure as the missing PIN screen.
insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Read & Sign',70,'clip','doc_reader','hr_documents',
  'Read the manual or a policy section by section, then sign. Your signature binds to the version you read — a revised document asks again, which is what makes the signature worth anything.',
  true,'#2df26a',false,'hr','My Work','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select subcategory, count(*) n,
       count(*) filter (where page_kind='custom') custom
from public.nav_registry where enabled and surface='hr'
group by subcategory order by n desc;;
