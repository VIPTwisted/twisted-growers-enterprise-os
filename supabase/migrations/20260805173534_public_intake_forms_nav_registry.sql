insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Workspace', (select category_order from nav_registry where category='Workspace' limit 1), 'Intake Forms', 6, 'check', 'forms', 'forms', 'Build simple forms that anyone can fill out from a shared link, and review every answer that comes back.', true, false, false
where not exists (select 1 from nav_registry where view_key='forms');
;
