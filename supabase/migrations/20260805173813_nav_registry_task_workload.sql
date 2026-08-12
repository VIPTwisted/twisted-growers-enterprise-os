insert into nav_registry (
    category, category_order, label, item_order, icon,
    view_key, table_ref, description, enabled, admin_only, sync_enabled
)
select
    'Workspace',
    (select category_order from nav_registry where category = 'Workspace' limit 1),
    'Workload & Capacity',
    7,
    'scale',
    'task_workload',
    'v_task_workload',
    'Shows how many open tasks each employee has due on each day, how many of those are high priority, and flags any day that is heavy or overloaded.',
    true,
    false,
    false
where not exists (
    select 1 from nav_registry where view_key = 'task_workload'
);;
