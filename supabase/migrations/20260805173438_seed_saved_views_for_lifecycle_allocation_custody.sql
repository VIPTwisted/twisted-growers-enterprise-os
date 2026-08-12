-- Shared starter saved views for three collections beyond tasks.
-- These are view configurations (structure), not business records.

-- Harvest Lifecycle
insert into saved_views (collection, name, view_type, group_by, shown_fields, filters, is_private, pinned, owner, position)
select 'harvest_lifecycle', 'List', 'list', 'verdict',
       '["harvest","strain","room","planned_date","planned_lbs","takedown_status","drying_status","packaged_lbs","yield_pct","verdict"]'::jsonb,
       '{}'::jsonb, false, true, null, 1
where not exists (select 1 from saved_views where collection='harvest_lifecycle' and name='List' and owner is null);

insert into saved_views (collection, name, view_type, group_by, shown_fields, filters, is_private, pinned, owner, position)
select 'harvest_lifecycle', 'Board', 'board', 'verdict',
       '["harvest","strain","room","planned_date","planned_lbs","takedown_status","drying_status","packaged_lbs","yield_pct","verdict"]'::jsonb,
       '{}'::jsonb, false, true, null, 2
where not exists (select 1 from saved_views where collection='harvest_lifecycle' and name='Board' and owner is null);

-- Allocation Requests
insert into saved_views (collection, name, view_type, group_by, shown_fields, filters, is_private, pinned, owner, position)
select 'allocation_requests', 'List', 'list', 'status',
       '["request_no","material_name","strain","quantity","uom","destination","requester_name","needed_by","priority","status"]'::jsonb,
       '{}'::jsonb, false, true, null, 1
where not exists (select 1 from saved_views where collection='allocation_requests' and name='List' and owner is null);

insert into saved_views (collection, name, view_type, group_by, shown_fields, filters, is_private, pinned, owner, position)
select 'allocation_requests', 'Board', 'board', 'status',
       '["request_no","material_name","strain","quantity","uom","destination","requester_name","needed_by","priority","status"]'::jsonb,
       '{}'::jsonb, false, true, null, 2
where not exists (select 1 from saved_views where collection='allocation_requests' and name='Board' and owner is null);

-- Custody Alerts
insert into saved_views (collection, name, view_type, group_by, shown_fields, filters, is_private, pinned, owner, position)
select 'custody_alerts', 'List', 'list', 'severity',
       '["flag","severity","license","identifier","item","location","quantity","uom","detail","reference_date"]'::jsonb,
       '{}'::jsonb, false, true, null, 1
where not exists (select 1 from saved_views where collection='custody_alerts' and name='List' and owner is null);

-- Side menu entry for the saved view engine
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Workspace', (select category_order from nav_registry where category='Workspace' limit 1), 'Saved Views', 6, 'grid', 'saved_views', 'saved_views',
       'Shared and private saved views that decide which columns, grouping and filters each collection opens with.', true, false, false
where not exists (select 1 from nav_registry where view_key='saved_views');;
