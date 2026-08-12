-- Revert my rename. The category is Command, as it always was.
update nav_registry set category='Command' where category='Control Tower';

-- Command gets a dashboard too, first item, above every subcategory.
insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select min(category_order) from nav_registry where category='Command'), 'Dashboard',
 'Command Dashboard', 0, 'grid', 'dept_dash_command', 'v_department_dashboard',
 'Everything that needs a decision today, on one page: open harvests, stock position, quality exposure, money at risk and what is waiting on a person. Every tile drills into the records behind it.',
 true, false, false
where not exists (select 1 from nav_registry where view_key='dept_dash_command');
insert into nav_role_visibility (view_key, role, visible)
select 'dept_dash_command', r.role, true from
 (values ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly')) r(role)
on conflict (view_key, role) do update set visible = true;

-- Command rollup KPIs
drop view if exists v_department_dashboard cascade;
create view v_department_dashboard as
select dept as department, kpi, value, unit, tone, sub as context, drill, ord from v_department_kpis
union all
select 'Command', 'Harvests open past 21 days', value, unit, tone, context, drill, 1
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Cultivation' and ord=1) a
union all
select 'Command', 'Pounds sitting in the rooms', value, unit, tone, context, drill, 2
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Cultivation' and ord=2) b
union all
select 'Command', 'Total on hand, dry-equivalent', value, unit, tone, context, drill, 3
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Inventory' and ord=1) c
union all
select 'Command', 'Never submitted for testing', value, unit, tone, context, drill, 4
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Inventory' and ord=3) d
union all
select 'Command', 'Failed testing on hand', value, unit, tone, context, drill, 5
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Quality' and ord=1) e
union all
select 'Command', 'Genuine loss to date', value, unit, tone, context, drill, 6
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Sales & Cash' and ord=1) f
union all
select 'Command', 'Open watchdog findings', value, unit, tone, context, drill, 7
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Workspace' and ord=2) g
union all
select 'Command', 'Open questions', value, unit, tone, context, drill, 8
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Workspace' and ord=1) h
union all
select 'Command', 'Awaiting allocation approval', value, unit, tone, context, drill, 9
  from (select value, unit, tone, sub as context, drill from v_department_kpis where dept='Inventory' and ord=6) i
order by department, ord;

-- Every dashboard sits first in its category
update nav_registry set item_order = 0, subcategory = 'Dashboard'
where view_key like 'dept_dash_%';

select category, count(*) filter (where subcategory='Dashboard') has_dash, count(*) items,
  count(distinct subcategory) subs
from nav_registry where enabled and report_group is null group by 1 order by 3 desc;;
