-- 0018: admin-only menu items (Menu Manager hidden from non-executives) + self role lookup
alter table nav_registry add column if not exists admin_only boolean not null default false;
update nav_registry set admin_only = true where view_key = 'menu_manager';
create policy self_read on app_users for select to authenticated using (user_id = auth.uid());;
