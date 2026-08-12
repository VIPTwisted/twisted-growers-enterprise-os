-- Everything I added today that is a report goes to the Reports dropdown,
-- not the side menu. Only what needs acting on daily stays in Command.
update nav_registry set report_group = 'Inventory & Stock' where view_key in
 ('stock_summary','stock_on_hand','own_vs_bought','third_party_stock','fresh_frozen_equiv',
  'production_true_position','storage_limit_status','moisture_accounting','tower_inventory');

update nav_registry set report_group = 'Third Party & Suppliers' where view_key in
 ('third_party_chain','third_party_downstream','third_party_lifecycle','third_party_cycle_time','remediation_yield');

update nav_registry set report_group = 'Laboratory & Quality' where view_key in
 ('lab_results','lab_turnaround_summary','lab_fail_rate_by_origin','failed_testing_by_origin','issue_attribution_summary');

update nav_registry set report_group = 'Loss & Accountability' where view_key in
 ('real_loss_v2','inventory_alert_history');

update nav_registry set report_group = 'Cultivation & Harvest' where view_key in
 ('harvest_issues','harvest_forensic','dry_room_performance','cultivation_meeting_pack');

-- Settings-type pages belong in Settings, not Command
update nav_registry set category='Settings', report_group=null,
  category_order=(select category_order from nav_registry where view_key='settings'),
  item_order = case view_key
    when 'storage_limits' then 40 when 'conversion_factors' then 41
    when 'suppliers' then 42 when 'purchase_intent' then 43 else item_order end
where view_key in ('storage_limits','conversion_factors','suppliers','purchase_intent');

-- What stays in the side menu: only things that need a decision today
update nav_registry set report_group = null, item_order = 3 where view_key = 'inventory_alerts';
update nav_registry set report_group = null, item_order = 4 where view_key = 'open_questions';
update nav_registry set report_group = null, item_order = 5 where view_key = 'allocation_queue';
update nav_registry set report_group = 'Inventory & Stock' where view_key = 'unrequested_material';

select category, coalesce(report_group,'(side menu)') as placement, count(*) items
from nav_registry where category='Command' group by 1,2 order by 3 desc;;
