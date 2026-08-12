drop view if exists v_department_kpis cascade;
create view v_department_kpis as
with f as (select value c from conversion_factors where key='target_cost_per_lb')
select 'Cultivation'::text dept, 1 ord, 'Harvests open past 21 days'::text kpi,
  count(*)::numeric value, 'harvests'::text unit,
  case when count(*)>0 then 'bad' else 'good' end::text tone,
  'harvest_issues'::text drill, ('oldest '||coalesce(max(total_days_start_to_now),0)||' days')::text sub
  from v_harvest_forensic where harvest_state like 'STILL OPEN%' and total_days_start_to_now>21
union all select 'Cultivation',2,'Pounds sitting in the rooms',round(coalesce(sum(still_in_room_lb),0),1),'lb',
  case when sum(still_in_room_lb)>1000 then 'bad' else 'warn' end,'harvest_issues','cut but not closed out'
  from v_harvest_forensic where harvest_state like 'STILL OPEN%'
union all select 'Cultivation',3,'Average dry time',round(coalesce(avg(dry_days_to_first_package),0),1),'days',
  case when avg(dry_days_to_first_package)>16 then 'bad' else 'good' end,'dry_room_performance','target is 10 to 14 days'
  from v_harvest_forensic where dry_days_to_first_package is not null
union all select 'Cultivation',4,'Harvests dried too long',count(*)::numeric,'harvests',
  case when count(*)>0 then 'warn' else 'good' end,'harvest_issues','past the 14 day window'
  from v_harvest_forensic where dry_days_to_first_package>16
union all select 'Cultivation',5,'Conversion, dried flower only',
  coalesce((select conversion_pct from v_moisture_summary where stream='Dried flower'),0),'%','good',
  'moisture_accounting','20 to 25 percent is the norm'
union all select 'Cultivation',6,'Schedule violations',count(*)::numeric,'violations',
  case when count(*)>0 then 'bad' else 'good' end,'issue_late','early is fine, late never is'
  from v_late_violations where rule_verdict like 'VIOLATION%'

union all select 'Inventory',1,'Total on hand, dry-equivalent',
  coalesce((select value from v_tower_inventory where metric='onhand_total_dry_equiv_lb'),0),'lb','good',
  'production_true_position','like-for-like across every stream'
union all select 'Inventory',2,'Sellable right now',
  coalesce((select value from v_tower_inventory where metric='sellable_lb'),0),'lb','good','stock_summary','test passed'
union all select 'Inventory',3,'Never submitted for testing',
  coalesce((select value from v_tower_inventory where metric='never_submitted_lb'),0),'lb','bad','lab_results','cannot legally be sold'
union all select 'Inventory',4,'Bought in',
  coalesce((select value from v_tower_inventory where metric='pct_bought_in'),0),'%','warn','own_vs_bought','of everything on hand'
union all select 'Inventory',5,'Sitting over 180 days',
  coalesce((select value from v_tower_inventory where metric='stock_over_180d_lb'),0),'lb','warn','stock_on_hand','capital not moving'
union all select 'Inventory',6,'Awaiting allocation approval',count(*)::numeric,'requests',
  case when count(*)>0 then 'warn' else 'good' end,'allocation_queue','nothing moves until Vincent decides'
  from allocation_requests where status='pending'

union all select 'Quality',1,'Failed testing on hand',
  coalesce((select value from v_tower_inventory where metric='failed_testing_lb'),0),'lb','bad',
  'failed_testing_by_origin','ours and bought in'
union all select 'Quality',2,'Our own fail rate',
  coalesce((select round(100.0*sum(failed)/nullif(sum(tested),0),1) from v_lab_fail_rate_by_origin where origin='Grown by us'),0),
  '%','warn','lab_fail_rate_by_origin','packages we grew'
union all select 'Quality',3,'Out for testing',
  coalesce((select value from v_tower_inventory where metric='out_for_testing_lb'),0),'lb','good','lab_results','awaiting a result'
union all select 'Quality',4,'Worst laboratory turnaround',
  coalesce((select max(slowest_turnaround_days) from v_lab_turnaround_summary),0),'days','warn',
  'lab_turnaround_summary','slowest result on record'
union all select 'Quality',5,'Open compliance flags',count(*)::numeric,'flags',
  case when count(*)>0 then 'bad' else 'good' end,'custody_alerts','live from Metrc' from v_custody_alerts

union all select 'Sales & Cash',1,'Genuine loss to date',
  coalesce((select sum(dollars) from v_real_loss_v2),0),'$','bad','real_loss_v2','excludes moisture and trim'
union all select 'Sales & Cash',2,'Value of stock on hand',
  round(coalesce((select sum(pounds) from v_stock_on_hand),0)*(select c from f)),'$','good','inv_value','at target cost per pound'
union all select 'Sales & Cash',3,'Failed testing value',
  round(coalesce((select value from v_tower_inventory where metric='failed_testing_lb'),0)*(select c from f)),'$','bad',
  'failed_testing_by_origin','cannot be sold as is'
union all select 'Sales & Cash',4,'Untested stock value',
  round(coalesce((select value from v_tower_inventory where metric='never_submitted_lb'),0)*(select c from f)),'$','bad',
  'lab_results','locked up until submitted'

union all select 'Manufacturing',1,'Fresh frozen on hand',
  coalesce((select value from v_tower_inventory where metric='onhand_fresh_frozen_lb'),0),'lb','good',
  'fresh_frozen_equiv','input for extraction'
union all select 'Manufacturing',2,'Fresh frozen dry-equivalent',
  coalesce((select value from v_tower_inventory where metric='onhand_fresh_frozen_dry_equiv_lb'),0),'lb','good',
  'fresh_frozen_equiv','what it is really worth'
union all select 'Manufacturing',3,'Purchased material untouched',
  coalesce((select value from v_tower_inventory where metric='third_party_untouched_pkgs'),0),'packages','warn',
  'third_party_lifecycle','received and never drawn'
union all select 'Manufacturing',4,'Concentrate on hand',
  coalesce((select value from v_tower_inventory where metric='onhand_concentrate_lb'),0),'lb','good','stock_summary',''
union all select 'Manufacturing',5,'Shake and trim on hand',
  coalesce((select value from v_tower_inventory where metric='onhand_shake_trim_lb'),0),'lb','good','stock_summary',
  'feeds pre-rolls and extraction'

union all select 'Metrc',1,'Harvests mirrored',(select count(*) from metrc_harvests)::numeric,'harvests','good','harvests',''
union all select 'Metrc',2,'Packages mirrored',(select count(*) from metrc_packages)::numeric,'packages','good','metrc_rpt_packages',''
union all select 'Metrc',3,'Plants mirrored',(select count(*) from metrc_plants)::numeric,'plants','good','metrc_rpt_plants',''
union all select 'Metrc',4,'Transfers mirrored',(select count(*) from metrc_transfers)::numeric,'manifests','good','metrc_rpt_transfers',''

union all select 'Workspace',1,'Open questions',count(*)::numeric,'questions',
  case when count(*)>0 then 'warn' else 'good' end,'open_questions','blocking a number somewhere'
  from open_questions where status='open'
union all select 'Workspace',2,'Open watchdog findings',count(*)::numeric,'findings',
  case when count(*)>0 then 'bad' else 'good' end,'inventory_alerts',''
  from inventory_alerts where resolved_at is null
union all select 'Workspace',3,'Go-live items open',count(*)::numeric,'items','warn','golive',''
  from golive_items where status='open';

drop view if exists v_department_dashboard cascade;
create view v_department_dashboard as
select dept as department, kpi, value, unit, tone, sub as context, drill, ord
from v_department_kpis order by dept, ord;

insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select v.cat, (select min(category_order) from nav_registry n2 where n2.category=v.cat), 'Dashboard', v.l, 0, 'grid', v.k, 'v_department_dashboard', v.d, true, false, false
from (values
 ('Cultivation','Cultivation Dashboard','dept_dash_cultivation','Every cultivation number on one page: open harvests, pounds sitting in the rooms, dry time, conversion and schedule violations. Each tile drills into the records behind it.'),
 ('Inventory','Inventory Dashboard','dept_dash_inventory','The whole inventory position on one page: total on hand in dry-equivalent, sellable, untested, bought in, ageing and allocations waiting on approval.'),
 ('Quality','Quality Dashboard','dept_dash_quality','Testing at a glance: failed on hand, our own fail rate, out for testing, laboratory turnaround and open compliance flags.'),
 ('Sales & Cash','Sales & Cash Dashboard','dept_dash_sales','The money view: genuine loss, value of stock on hand, and the value locked up in failed and untested product.'),
 ('Manufacturing','Manufacturing Dashboard','dept_dash_mfg','Inputs and outputs: fresh frozen on hand and its dry-equivalent, purchased material untouched, concentrate and trim.'),
 ('Metrc','Metrc Dashboard','dept_dash_metrc','Mirror health: harvests, packages, plants and transfers mirrored from Metrc.'),
 ('Workspace','Workspace Dashboard','dept_dash_workspace','What is waiting on people: open questions, watchdog findings and go-live items.')
) v(cat,l,k,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);

insert into nav_role_visibility (view_key, role, visible)
select k, r.role, true from
 (values ('dept_dash_cultivation'),('dept_dash_inventory'),('dept_dash_quality'),('dept_dash_sales'),
         ('dept_dash_mfg'),('dept_dash_metrc'),('dept_dash_workspace')) x(k),
 (values ('owner'),('executive'),('planner'),('dept_head'),('staff'),('readonly')) r(role)
on conflict (view_key, role) do update set visible = true;

select department, count(*) kpis from v_department_dashboard group by 1 order by 1;;
