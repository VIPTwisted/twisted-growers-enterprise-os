update nav_registry set subcategory=v.sub, item_order=v.ord from (values
 -- ═══ INVENTORY ═══
 ('lots','Stock & Location',1),('inventory_locator','Stock & Location',2),('inv_summary','Stock & Location',3),
 ('fg_inventory','Stock & Location',4),('skus','Stock & Location',5),('genealogy','Stock & Location',6),
 ('production_tracker','Stock & Location',7),('supplies','Stock & Location',8),
 ('allocations','Allocation Control',1),('allocation_requests','Allocation Control',2),
 ('awaiting_allocation','Allocation Control',3),
 ('custody_compliance','Custody & Reconciliation',1),('custody_alerts','Custody & Reconciliation',2),
 ('custody_alert_log','Custody & Reconciliation',3),('inventory_reconciliation','Custody & Reconciliation',4),
 ('fg_metrc_check','Custody & Reconciliation',5),('inventory_aging','Custody & Reconciliation',6),
 ('third_party','Purchasing & Third Party',1),('third_party_purchases','Purchasing & Third Party',2),
 ('purchasing','Purchasing & Third Party',3),('materials','Purchasing & Third Party',4),
 ('inv_value','Value & Margin',1),('route_margin','Value & Margin',2),('product_economics','Value & Margin',3),
 ('demand_signals','Value & Margin',4),('plan_products','Value & Margin',5),

 -- ═══ SALES & CASH ═══
 ('orders','Orders & Customers',1),('customers','Orders & Customers',2),('shipping','Orders & Customers',3),
 ('customer_history','Orders & Customers',4),('customer_manifests','Orders & Customers',5),
 ('sales_history','Sales History',1),('sales_monthly','Sales History',2),
 ('cash','Cash & Cost',1),('invoices','Cash & Cost',2),('overhead','Cash & Cost',3),
 ('cost_model','Cash & Cost',4),('true_cost_per_pound','Cash & Cost',5),('harvest_economics','Cash & Cost',6),
 ('cost_of_loss','Loss',1),('real_loss','Loss',2),('real_loss_summary','Loss',3),
 ('sop','Planning & Forecast',1),('plan_demand','Planning & Forecast',2),
 ('year_end_2025','Tax',1),('year_end_2025_summary','Tax',2),('inventory_valuation','Tax',3),

 -- ═══ WORKSPACE ═══
 ('tasks','Work',1),('task_timeline','Work',2),('task_workload','Work',3),('recurring_tasks','Work',4),
 ('action_register','Work',5),('issues','Work',6),
 ('teams','People & Spaces',1),('spaces','People & Spaces',2),('messages','People & Spaces',3),
 ('whiteboards','People & Spaces',4),
 ('templates','Tools',1),('forms','Tools',2),('saved_views','Tools',3),
 ('clickup_tasks','Imported from ClickUp',1),('clickup_lists','Imported from ClickUp',2),

 -- ═══ METRC ═══
 ('metrc_mirror','Live Mirror',1),('metrc_mc','Live Mirror',2),('metrc_mp','Live Mirror',3),
 ('forensic_trace','Live Mirror',4),
 ('metrc_report_import','Report Import',1),('metrc_report_rows','Report Import',2),
 ('metrc_uom','Reference Data',1),('metrc_employees','Reference Data',2),
 ('metrc_item_categories','Reference Data',3),('metrc_lab_types','Reference Data',4),
 ('metrc_waste_types','Reference Data',5),

 -- ═══ MANUFACTURING ═══
 ('mfg_schedule','Schedule & Capacity',1),('plan_capacity','Schedule & Capacity',2),
 ('flow','Production',1),('pipelines_def','Production',2),('pipeline_runs','Production',3),
 ('pipeline_aging','Production',4),('bom','Production',5),
 ('turnaround_policies','Turnaround',1),('turnaround_watch','Turnaround',2),
 ('maintenance','Equipment',1),

 -- ═══ HUMAN RESOURCES ═══
 ('people','People',1),('wage_bands','People',2),
 ('emp_schedule','Time & Scheduling',1),('work_schedules','Time & Scheduling',2),('time','Time & Scheduling',3),
 ('payroll','Payroll & Budget',1),('plan_payroll','Payroll & Budget',2),
 ('labor_budgets','Payroll & Budget',3),('plan_hiring','Payroll & Budget',4),

 -- ═══ QUALITY ═══
 ('testing','Testing',1),('coa_register','Testing',2),('testing_sla','Testing',3),
 ('licenses','Compliance',1),('sop_training','Compliance',2),('safety','Compliance',3),

 -- ═══ INFUSED PRE-ROLLS & FLOWER ═══
 ('preroll_schedule','Production',1),('work_orders','Production',2),('weekly_fg','Production',3),
 ('machines','Equipment & Scheduling',1),('scheduling','Equipment & Scheduling',2),

 -- ═══ SETTINGS ═══
 ('settings','General',1),('permissions','General',2),('role_menu_matrix','General',3),
 ('menu_manager','General',4),('help','General',5),
 ('assistant_settings','Artificial Intelligence',1),('ai_settings','Artificial Intelligence',2),
 ('ai_user_access','Artificial Intelligence',3),('ai_access_status','Artificial Intelligence',4),
 ('ai_usage','Artificial Intelligence',5),('ai_spend','Artificial Intelligence',6),
 ('storage_limits','Business Rules',1),('conversion_factors','Business Rules',2),
 ('suppliers','Business Rules',3),('purchase_intent','Business Rules',4),
 ('industry_benchmarks','Business Rules',5),
 ('integrations','Connections',1),('app_secrets','Connections',2),
 ('agent_departments','Programme',1),('golive','Programme',2)
) v(k,sub,ord)
where nav_registry.view_key = v.k;

select category, coalesce(subcategory,'(none)') sub, count(*) n
from nav_registry where enabled and report_group is null
group by 1,2 order by 1, 2;;
