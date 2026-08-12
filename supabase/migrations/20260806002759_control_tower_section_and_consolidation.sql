alter table nav_registry add column if not exists subcategory text;

-- ── New CONTROL TOWER category with subcategories. Nothing removed. ──
update nav_registry set category='Control Tower', category_order=0, report_group=null, subcategory=v.sub, item_order=v.ord
from (values
 ('tower',                    'Overview', 1),
 ('tower_inventory',          'Overview', 2),
 ('ceo_dashboard',            'Overview', 3),
 ('dashboards',               'Overview', 4),

 ('inventory_alerts',         'Alerts & Watchdog', 1),
 ('watchdog_current',         'Alerts & Watchdog', 2),
 ('watchdog_log',             'Alerts & Watchdog', 3),
 ('watchdog_timeline',        'Alerts & Watchdog', 4),
 ('watchdog_runs',            'Alerts & Watchdog', 5),
 ('inventory_alert_history',  'Alerts & Watchdog', 6),
 ('agent_findings',           'Alerts & Watchdog', 7),
 ('intelligence_briefing',    'Alerts & Watchdog', 8),

 ('open_questions',           'Decisions Waiting', 1),
 ('allocation_queue',         'Decisions Waiting', 2),
 ('unrequested_material',     'Decisions Waiting', 3),
 ('ceo_recommendations',      'Decisions Waiting', 4),
 ('finding_history',          'Decisions Waiting', 5),

 ('stock_summary',            'Inventory Position', 1),
 ('stock_on_hand',            'Inventory Position', 2),
 ('own_vs_bought',            'Inventory Position', 3),
 ('production_true_position', 'Inventory Position', 4),
 ('fresh_frozen_equiv',       'Inventory Position', 5),
 ('storage_limit_status',     'Inventory Position', 6),
 ('moisture_accounting',      'Inventory Position', 7),

 ('third_party_stock',        'Third Party', 1),
 ('third_party_lifecycle',    'Third Party', 2),
 ('third_party_cycle_time',   'Third Party', 3),
 ('third_party_chain',        'Third Party', 4),
 ('third_party_downstream',   'Third Party', 5),
 ('remediation_yield',        'Third Party', 6),

 ('lab_results',              'Laboratory & Quality', 1),
 ('lab_turnaround_summary',   'Laboratory & Quality', 2),
 ('lab_fail_rate_by_origin',  'Laboratory & Quality', 3),
 ('failed_testing_by_origin', 'Laboratory & Quality', 4),
 ('issue_attribution_summary','Laboratory & Quality', 5),

 ('real_loss_v2',             'Loss & Accountability', 1),
 ('leadership_accountability','Loss & Accountability', 2),
 ('leadership_cost_output',   'Loss & Accountability', 3),
 ('forensic_audit',           'Loss & Accountability', 4),
 ('forensic_audit_history',   'Loss & Accountability', 5),
 ('finding_accountability',   'Loss & Accountability', 6),

 ('budz',                     'Assistant', 1),
 ('brain',                    'Assistant', 2),
 ('planner',                  'Assistant', 3),
 ('goals',                    'Assistant', 4)
) v(k, sub, ord)
where nav_registry.view_key = v.k;

insert into nav_registry (category, category_order, subcategory, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Control Tower', 0, v.sub, v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Alerts & Watchdog','Watchdog — Latest Sweep', 2, 'search', 'watchdog_current', 'v_watchdog_current',
  'What the watchdog found on its most recent sweep, with the what, where, who is accountable, when it started, why it matters, how it was detected, what to do, and the arithmetic behind every figure.'),
 ('Alerts & Watchdog','Watchdog — Full Forensic Log', 3, 'file-text', 'watchdog_log', 'v_watchdog_log',
  'Every finding the watchdog has ever recorded, permanently. Append-only: nothing here can be edited or deleted, by anyone. Each row carries the full evidence as it stood at that moment, so a finding from months ago can be reproduced exactly.'),
 ('Alerts & Watchdog','Watchdog — Issue Timeline', 4, 'trending-up', 'watchdog_timeline', 'v_watchdog_timeline',
  'Each issue across time: when it first appeared, how many sweeps it has survived, how many days it has persisted, who is accountable, and whether it is still open or has resolved itself.'),
 ('Alerts & Watchdog','Watchdog — Sweep History', 5, 'clock', 'watchdog_runs', 'v_watchdog_runs',
  'Every sweep the watchdog has run: when, how long it took, how many findings it raised and the pounds and dollars flagged. Proof the monitoring actually ran.')
) v(sub, l, o, i, k, t, d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);

insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from
 (values ('watchdog_current'),('watchdog_log'),('watchdog_timeline'),('watchdog_runs')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

select subcategory, count(*) items from nav_registry
where category='Control Tower' and enabled group by 1 order by 1;;
