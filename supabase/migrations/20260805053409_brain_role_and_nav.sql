-- 0020: TG Brain landing + role personalization (feeds persona Control Tower)
alter table user_settings add column if not exists brain_role text;
insert into nav_registry (category, category_order, item_order, view_key, label, table_ref, milestone, icon, description, enabled, color)
values ('Command', 0, 3, 'brain', 'TG Brain', null, null, 'dna',
  'The company''s brain: every operating record - Metrc, the floor, the sheets, the money - read as one mind. Role personalization is live; the reasoning engine and loop agents arrive in M5.', true, 'var(--ink)')
on conflict do nothing;;
