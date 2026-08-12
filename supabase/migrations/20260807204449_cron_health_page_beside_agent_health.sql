-- v_cron_health with nothing reading it is the same defect it was built to fix.
-- Placed next to Agent Health, which is where somebody already goes to ask
-- "is the machinery running?" — a second place to look is a place nobody looks.
insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
select 'Settings',
       (select category_order from nav_registry where category='Settings' limit 1),
       'Scheduled Job Health',
       1,
       'gauge',
       'cron_health',
       'v_cron_health',
       'Every scheduled job, judged on read. Shows jobs failing, jobs that have never succeeded, and jobs that are switched on but have never run at all.',
       true, true, 'side', 'Programme'
where not exists (select 1 from nav_registry where view_key='cron_health');

-- Agent Departments sat at item_order 1 too; push it down so the ordering stays stable.
update nav_registry set item_order = 2
where view_key = 'agent_departments' and item_order = 1;

select view_key, label, table_ref, item_order from nav_registry
where subcategory='Programme' and enabled order by item_order;;
