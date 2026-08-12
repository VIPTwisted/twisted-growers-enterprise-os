update nav_registry set subcategory=v.sub, item_order=v.ord, report_group=null
from (values
 ('grow_rooms',              'Rooms & Plants', 1),
 ('room_board',              'Rooms & Plants', 2),
 ('facility_live_map',       'Rooms & Plants', 3),
 ('genetics',                'Rooms & Plants', 4),
 ('room_yield',              'Rooms & Plants', 5),
 ('plan_production',         'Rooms & Plants', 6),

 ('harvest_schedule',        'Schedule & Calendar', 1),
 ('harvest_pulls',           'Schedule & Calendar', 2),
 ('harvest_pulls_edit',      'Schedule & Calendar', 3),
 ('harvest_sop',             'Schedule & Calendar', 4),
 ('harvest_labor',           'Schedule & Calendar', 5),
 ('weekend_watch',           'Schedule & Calendar', 6),
 ('department_board',        'Schedule & Calendar', 7),

 ('harvests',                'Harvests', 1),
 ('harvest_stage_map',       'Harvests', 2),
 ('harvest_detail',          'Harvests', 3),
 ('harvest_lifecycle',       'Harvests', 4),
 ('harvest_lineage',         'Harvests', 5),
 ('seed_to_sale_chain',      'Harvests', 6),
 ('grading',                 'Harvests', 7),

 ('harvest_enforce',         'Discipline & Alerts', 1),
 ('schedule_discipline',     'Discipline & Alerts', 2),
 ('schedule_compliance',     'Discipline & Alerts', 3),
 ('schedule_scorecard',      'Discipline & Alerts', 4),
 ('late_violations',         'Discipline & Alerts', 5),
 ('harvest_alerts',          'Discipline & Alerts', 6),
 ('harvest_alert_rules',     'Discipline & Alerts', 7),
 ('cultivation_goals',       'Discipline & Alerts', 8),

 ('harvest_recon',           'Yield & Performance', 1),
 ('harvest_plan_actual',     'Yield & Performance', 2),
 ('yield_versus_industry',   'Yield & Performance', 3),
 ('loss_ledger',             'Yield & Performance', 4),
 ('loss_analysis',           'Yield & Performance', 5),
 ('loss_ranking',            'Yield & Performance', 6)
) v(k, sub, ord)
where nav_registry.view_key = v.k and nav_registry.category = 'Cultivation';

-- The five pure reports stay in the Reports dropdown
update nav_registry set report_group='Cultivation & Harvest', subcategory=null
where view_key in ('issue_yield_by_harvest','room_best_vs_worst','room_month_comparison','issue_late','issue_yield_gap');

select coalesce(subcategory,'(reports dropdown)') as grp, count(*) items
from nav_registry where category='Cultivation' and enabled group by 1 order by 1;;
