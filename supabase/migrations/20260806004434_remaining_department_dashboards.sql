drop view if exists v_department_kpis_extra cascade;
create view v_department_kpis_extra as
select 'Human Resources'::text dept, 1 ord, 'People on the roster'::text kpi,
  (select count(*) from employees)::numeric value, 'people'::text unit, 'good'::text tone,
  'people'::text drill, ''::text sub
union all select 'Human Resources',2,'Shifts scheduled this week',
  (select count(*) from employee_schedules where work_date between current_date and current_date+7)::numeric,
  'shifts','good','emp_schedule','next seven days'
union all select 'Human Resources',3,'Departments',
  (select count(*) from departments)::numeric,'departments','good','people',''
union all select 'Human Resources',4,'Labour cost per saleable pound',
  coalesce((select round(value,0) from v_tower_inventory where metric='onhand_total_dry_equiv_lb'),0),'lb','good',
  'plan_payroll','stock the payroll is carried against'

union all select 'Infused Pre-Rolls & Flower',1,'Pre-rolls on hand',
  coalesce((select value from v_tower_inventory where metric='onhand_dried_flower_lb'),0)*0+
  coalesce((select round(sum(pounds),1) from v_stock_on_hand where stream='Pre-rolls'),0),'lb','good','stock_summary',''
union all select 'Infused Pre-Rolls & Flower',2,'Shake and trim available',
  coalesce((select value from v_tower_inventory where metric='onhand_shake_trim_lb'),0),'lb','good','stock_summary',
  'the input for pre-rolls'
union all select 'Infused Pre-Rolls & Flower',3,'Work orders open',
  (select count(*) from work_orders where status in ('ready','released'))::numeric,'orders','warn','work_orders',''
union all select 'Infused Pre-Rolls & Flower',4,'Pre-rolls never tested',
  coalesce((select round(sum(pounds),1) from v_stock_on_hand where stream='Pre-rolls' and lab_state='NotSubmitted'),0),
  'lb','bad','lab_results','cannot be sold'

union all select 'Settings',1,'Pages in the platform',
  (select count(*) from nav_registry where enabled)::numeric,'pages','good','menu_manager',''
union all select 'Settings',2,'Business rules not yet set',
  (select count(*) from open_questions where status='open' and area in ('Measurement','Inventory control'))::numeric,
  'rules','warn','open_questions','defaults still in place'
union all select 'Settings',3,'Suppliers not classified',
  (select count(*) from suppliers where bought_as='not yet set')::numeric,'suppliers','warn','suppliers',''
union all select 'Settings',4,'Users with AI access',
  (select count(*) from ai_user_access where enabled)::numeric,'users','good','ai_access_status','';

drop view if exists v_department_dashboard cascade;
create view v_department_dashboard as
with base as (
  select dept, ord, kpi, value, unit, tone, drill, sub from v_department_kpis
  union all select dept, ord, kpi, value, unit, tone, drill, sub from v_department_kpis_extra
)
select dept as department, kpi, value, unit, tone, sub as context, drill, ord from base
union all
select 'Command', kpi, value, unit, tone, sub, drill,
  row_number() over (order by case dept when 'Cultivation' then 1 when 'Inventory' then 2
    when 'Quality' then 3 when 'Sales & Cash' then 4 else 5 end, ord)::int
from base
where (dept='Cultivation' and ord in (1,2))
   or (dept='Inventory' and ord in (1,3,6))
   or (dept='Quality' and ord in (1,5))
   or (dept='Sales & Cash' and ord = 1)
   or (dept='Workspace' and ord in (1,2))
order by department, ord;

insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select min(category_order) from nav_registry n2 where n2.category=v.cat), 'Dashboard', v.l, 0, 'grid', v.k, 'v_department_dashboard', v.d, true, false, false
from (values
 ('Human Resources','Human Resources Dashboard','dept_dash_hr','Roster, shifts scheduled, departments and the stock the payroll is carried against. Every tile drills into the records.'),
 ('Infused Pre-Rolls & Flower','Pre-Rolls Dashboard','dept_dash_preroll','Pre-rolls on hand, the shake and trim available to make more, open work orders and anything untested.'),
 ('Settings','Settings Dashboard','dept_dash_settings','Platform health: pages live, business rules still on defaults, suppliers not yet classified and who has artificial intelligence access.')
) v(cat,l,k,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from (values ('dept_dash_hr'),('dept_dash_preroll'),('dept_dash_settings')) x(k),
 (values ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly')) r(role)
on conflict (view_key, role) do update set visible = true;;
