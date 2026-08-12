-- Inventory position on the Control Tower, split by stream and by origin.
drop view if exists v_tower_inventory cascade;
create view v_tower_inventory as
with f as (select value r from conversion_factors where key='fresh_frozen_wet_to_dry')
select 'onhand_dried_flower_lb'::text as metric, round(sum(pounds),1) as value,
       'Dried flower on hand, all licences'::text as label, 'stock'::text as grp, 'stock_summary'::text as drill
  from v_stock_on_hand where stream='Dried flower'
union all
select 'onhand_fresh_frozen_lb', round(sum(pounds),1),
       'Fresh frozen on hand, as recorded (still holds its water)', 'stock', 'fresh_frozen_equiv'
  from v_stock_on_hand where stream='Fresh frozen'
union all
select 'onhand_fresh_frozen_dry_equiv_lb', round(sum(pounds)/(select r from f),1),
       'Fresh frozen in dry-equivalent pounds - the only figure comparable to dried flower', 'stock', 'fresh_frozen_equiv'
  from v_stock_on_hand where stream='Fresh frozen'
union all
select 'onhand_shake_trim_lb', round(sum(pounds),1), 'Shake and trim on hand', 'stock', 'stock_summary'
  from v_stock_on_hand where stream='Shake and trim'
union all
select 'onhand_concentrate_lb', round(sum(pounds),1), 'Concentrate on hand', 'stock', 'stock_summary'
  from v_stock_on_hand where stream='Concentrate'
union all
select 'onhand_total_dry_equiv_lb',
       round(sum(case when stream='Fresh frozen' then pounds/(select r from f) else pounds end),1),
       'Everything on hand in like-for-like dry-equivalent pounds', 'stock', 'production_true_position'
  from v_stock_on_hand
union all
select 'onhand_grown_by_us_lb', round(sum(pounds),1), 'On hand that we grew', 'origin', 'own_vs_bought'
  from v_stock_on_hand where origin='Grown by us'
union all
select 'onhand_bought_in_lb', round(sum(pounds),1), 'On hand that we bought in', 'origin', 'third_party_stock'
  from v_stock_on_hand where origin='Bought in'
union all
select 'pct_bought_in', round(100.0*sum(pounds) filter (where origin='Bought in')/nullif(sum(pounds),0),1),
       'Percent of everything on hand that was bought in', 'origin', 'own_vs_bought'
  from v_stock_on_hand
union all
select 'third_party_suppliers', count(distinct supplier)::numeric,
       'Suppliers we currently hold material from', 'origin', 'third_party_stock'
  from v_stock_on_hand where origin='Bought in'
union all
select 'third_party_untouched_pkgs', count(*)::numeric,
       'Purchased packages received and never drawn from', 'origin', 'third_party_lifecycle'
  from v_third_party_lifecycle where position like 'RECEIVED%' or position like 'SITTING%'
union all
select 'third_party_sitting_over_90d', count(*)::numeric,
       'Purchased packages sitting untouched over 90 days', 'origin', 'third_party_lifecycle'
  from v_third_party_lifecycle where position like 'SITTING%'
union all
select 'sellable_lb', round(sum(pounds),1), 'Test-passed and sellable', 'quality', 'stock_summary'
  from v_stock_on_hand where lab_state='TestPassed'
union all
select 'failed_testing_lb', round(sum(pounds),1), 'Failed testing and held', 'quality', 'failed_testing_by_origin'
  from v_stock_on_hand where lab_state='TestFailed'
union all
select 'never_submitted_lb', round(sum(pounds),1), 'Never submitted for testing', 'quality', 'lab_results'
  from v_stock_on_hand where lab_state='NotSubmitted'
union all
select 'out_for_testing_lb', round(sum(pounds),1), 'Out for testing right now', 'quality', 'lab_results'
  from v_stock_on_hand where lab_state like '%ubmitted%' and lab_state <> 'NotSubmitted'
union all
select 'oldest_stock_days', max(oldest_days)::numeric, 'Age of the oldest thing we own, in days', 'ageing', 'stock_on_hand'
  from v_stock_on_hand
union all
select 'stock_over_180d_lb', round(sum(pounds),1), 'On hand sitting over 180 days', 'ageing', 'stock_on_hand'
  from v_stock_on_hand where oldest_days > 180
union all
select 'limits_breached', count(*)::numeric, 'Storage limits currently breached', 'control', 'storage_limit_status'
  from v_storage_limit_status where status in ('OVER THE STORAGE LIMIT','MATERIAL OLDER THAN THE LIMIT')
union all
select 'limits_not_set', count(*)::numeric, 'Storage limits nobody has set yet', 'control', 'storage_limits'
  from v_storage_limit_status where status like 'NO LIMIT%'
union all
select 'open_questions', count(*)::numeric, 'Questions the platform needs answered', 'control', 'open_questions'
  from open_questions where status='open'
union all
select 'allocations_pending', count(*)::numeric, 'Allocations waiting on Vincent', 'control', 'allocation_queue'
  from allocation_requests where status='pending';

drop view if exists v_tower_inventory_grouped cascade;
create view v_tower_inventory_grouped as
select grp as section, label, value, drill, metric,
  case grp
    when 'stock'   then 'What we are holding, by product stream'
    when 'origin'  then 'Grown by us versus bought in'
    when 'quality' then 'Testing position'
    when 'ageing'  then 'How long it has been sitting'
    when 'control' then 'Controls and things awaiting a decision'
  end as section_note
from v_tower_inventory
order by case grp when 'stock' then 1 when 'origin' then 2 when 'quality' then 3 when 'ageing' then 4 else 5 end,
  value desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
 'Inventory Position', 4, 'layers', 'tower_inventory', 'v_tower_inventory_grouped',
 'The whole inventory position at a glance: every stream, grown versus bought in, testing state, ageing, and every control awaiting a decision. Each line drills into the records behind it.', true, false, false
where not exists (select 1 from nav_registry where view_key='tower_inventory');
insert into nav_role_visibility (view_key, role, visible)
select 'tower_inventory', r.role, r.vis from
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
