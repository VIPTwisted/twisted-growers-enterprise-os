create table if not exists nav_role_visibility (
  view_key text not null,
  role text not null,
  visible boolean not null default true,
  primary key (view_key, role)
);
alter table nav_role_visibility enable row level security;
drop policy if exists nrv_read on nav_role_visibility;
drop policy if exists nrv_write on nav_role_visibility;
create policy nrv_read on nav_role_visibility for select to authenticated using (true);
create policy nrv_write on nav_role_visibility for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive')));

-- Sensible defaults: everything visible to owner and executive; department pages
-- visible to manager; only operational pages to member, limited and guest.
insert into nav_role_visibility (view_key, role, visible)
select n.view_key, r.role,
  case
    when r.role in ('owner','executive') then true
    when r.role = 'manager' then not n.admin_only
    when r.role = 'member' then not n.admin_only and n.category in
      ('Cultivation','Manufacturing','Infused Pre-Rolls & Flower','Inventory','Quality','Workspace')
    when r.role = 'limited' then not n.admin_only and n.category in ('Workspace','Quality')
    else n.view_key in ('tower','tasks','messages','issues')
  end
from nav_registry n
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do nothing;

-- What each role can actually see, for the admin screen
create or replace view v_role_menu_matrix as
select n.category, n.label, n.view_key, n.admin_only,
  bool_or(v.visible) filter (where v.role='owner') as owner,
  bool_or(v.visible) filter (where v.role='executive') as executive,
  bool_or(v.visible) filter (where v.role='manager') as manager,
  bool_or(v.visible) filter (where v.role='member') as member,
  bool_or(v.visible) filter (where v.role='limited') as limited,
  bool_or(v.visible) filter (where v.role='guest') as guest
from nav_registry n left join nav_role_visibility v on v.view_key = n.view_key
group by n.category, n.label, n.view_key, n.admin_only, n.category_order, n.item_order
order by n.category_order, n.item_order;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Settings', (select category_order from nav_registry where category='Settings' limit 1),
  'Menu Visibility by Role', 6, 'shield', 'role_menu_matrix', 'v_role_menu_matrix',
  'Which menu items each role can see: owner, executive, manager, member, limited and guest. Anything not visible to a role is hidden from that person entirely, not greyed out.',
  true, true, false
where not exists (select 1 from nav_registry where view_key = 'role_menu_matrix');
select role, count(*) filter (where visible) as can_see, count(*) as of_total
from nav_role_visibility group by role order by can_see desc;;
