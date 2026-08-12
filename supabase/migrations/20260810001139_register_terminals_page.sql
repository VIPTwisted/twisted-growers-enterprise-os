-- The screen that was missing, and the reason the clock sat at zero punches:
-- f_set_punch_pin() and punch_devices existed from day one with nowhere to
-- call them from. A capability with no interface is a capability nobody has.
--
-- module='hr' declared per the nav_new_rows_declare_their_module constraint.
insert into public.nav_registry
 (category, category_order, label, item_order, icon, view_key, table_ref,
  description, enabled, color, admin_only, surface, subcategory, page_kind,
  module, date_policy, default_range, range_kind)
values
 ('Human Resources',7,'Terminals & Credentials',67,'clock','terminals','punch_devices',
  'Register a wall terminal or door scanner, then give people a PIN or a badge. Nobody can clock in until both exist. A PIN is hashed on save and can never be read back — not by anyone.',
  true,'#2df26a',true,'hr','Live','custom','hr','not_applicable',null,'snapshot')
on conflict do nothing;

select count(*) filter (where page_kind='custom') as purpose_built,
       count(*) as hr_pages,
       count(*) filter (where module is null) as undeclared
from public.nav_registry where enabled and surface='hr';;
