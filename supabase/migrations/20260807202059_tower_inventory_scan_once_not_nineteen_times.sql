-- v_tower_inventory scanned v_stock_on_hand FIFTEEN times, v_third_party_lifecycle
-- twice and v_storage_limit_status twice — once per UNION ALL branch. v_stock_on_hand
-- costs ~20 seconds on its own (a nested loop producing 297,434 rows), so the whole
-- view took 83.4 seconds against a 2-minute statement timeout.
--
-- Result: `refresh-tower-inventory` FAILED 10 of its last 20 runs with
-- "canceling statement due to statement timeout". Half the time the Control Tower
-- inventory tiles were showing whatever the last successful refresh left behind, with
-- nothing anywhere saying so. A stale tile and a fresh tile look identical.
--
-- The fix is not a new query — it is the SAME query, reading each source ONCE.
-- MATERIALIZED is explicit rather than relying on Postgres's multi-reference default,
-- because the day someone splits a branch out is the day it silently inlines again.
--
-- Rule E1: CREATE OR REPLACE. No drop, so mv_tower_inventory keeps its dependency.
-- Column names, order and types are unchanged, which is what makes REPLACE legal here.
create or replace view v_tower_inventory as
with f as (
  select value as r from conversion_factors where key = 'fresh_frozen_wet_to_dry'
),
s as materialized (
  select * from v_stock_on_hand
),
tp as materialized (
  select * from v_third_party_lifecycle
),
sl as materialized (
  select * from v_storage_limit_status
)
select 'onhand_dried_flower_lb'::text as metric, round(sum(s.pounds),1) as value, 'Dried flower on hand, all licences'::text as label, 'stock'::text as grp, 'stock_summary'::text as drill from s where s.stream = 'Dried flower'
union all
select 'onhand_fresh_frozen_lb'::text, round(sum(s.pounds),1), 'Fresh frozen on hand, as recorded (still holds its water)'::text, 'stock'::text, 'fresh_frozen_equiv'::text from s where s.stream = 'Fresh frozen'
union all
select 'onhand_fresh_frozen_dry_equiv_lb'::text, round(sum(s.pounds)/((select f.r from f)),1), 'Fresh frozen in dry-equivalent pounds - the only figure comparable to dried flower'::text, 'stock'::text, 'fresh_frozen_equiv'::text from s where s.stream = 'Fresh frozen'
union all
select 'onhand_shake_trim_lb'::text, round(sum(s.pounds),1), 'Shake and trim on hand'::text, 'stock'::text, 'stock_summary'::text from s where s.stream = 'Shake and trim'
union all
select 'onhand_concentrate_lb'::text, round(sum(s.pounds),1), 'Concentrate on hand'::text, 'stock'::text, 'stock_summary'::text from s where s.stream = 'Concentrate'
union all
select 'onhand_total_dry_equiv_lb'::text, round(sum(case when s.stream = 'Fresh frozen' then s.pounds/((select f.r from f)) else s.pounds end),1), 'Everything on hand in like-for-like dry-equivalent pounds'::text, 'stock'::text, 'production_true_position'::text from s
union all
select 'onhand_grown_by_us_lb'::text, round(sum(s.pounds),1), 'On hand that we grew'::text, 'origin'::text, 'own_vs_bought'::text from s where s.origin = 'Grown by us'
union all
select 'onhand_bought_in_lb'::text, round(sum(s.pounds),1), 'On hand that we bought in'::text, 'origin'::text, 'third_party_stock'::text from s where s.origin = 'Bought in'
union all
select 'pct_bought_in'::text, round(100.0*sum(s.pounds) filter (where s.origin = 'Bought in')/nullif(sum(s.pounds),0::numeric),1), 'Percent of everything on hand that was bought in'::text, 'origin'::text, 'own_vs_bought'::text from s
union all
select 'third_party_suppliers'::text, count(distinct s.supplier)::numeric, 'Suppliers we currently hold material from'::text, 'origin'::text, 'third_party_stock'::text from s where s.origin = 'Bought in'
union all
select 'third_party_untouched_pkgs'::text, count(*)::numeric, 'Purchased packages received and never drawn from'::text, 'origin'::text, 'third_party_lifecycle'::text from tp where tp."position" like 'RECEIVED%' or tp."position" like 'SITTING%'
union all
select 'third_party_sitting_over_90d'::text, count(*)::numeric, 'Purchased packages sitting untouched over 90 days'::text, 'origin'::text, 'third_party_lifecycle'::text from tp where tp."position" like 'SITTING%'
union all
select 'sellable_lb'::text, round(sum(s.pounds),1), 'Test-passed and sellable'::text, 'quality'::text, 'stock_summary'::text from s where s.lab_state = 'TestPassed'
union all
select 'failed_testing_lb'::text, round(sum(s.pounds),1), 'Failed testing and held'::text, 'quality'::text, 'failed_testing_by_origin'::text from s where s.lab_state = 'TestFailed'
union all
select 'never_submitted_lb'::text, round(sum(s.pounds),1), 'Never submitted for testing'::text, 'quality'::text, 'lab_results'::text from s where s.lab_state = 'NotSubmitted'
union all
select 'out_for_testing_lb'::text, round(sum(s.pounds),1), 'Out for testing right now'::text, 'quality'::text, 'lab_results'::text from s where s.lab_state like '%ubmitted%' and s.lab_state <> 'NotSubmitted'
union all
select 'oldest_stock_days'::text, max(s.oldest_days)::numeric, 'Age of the oldest thing we own, in days'::text, 'ageing'::text, 'stock_on_hand'::text from s
union all
select 'stock_over_180d_lb'::text, round(sum(s.pounds),1), 'On hand sitting over 180 days'::text, 'ageing'::text, 'stock_on_hand'::text from s where s.oldest_days > 180
union all
select 'limits_breached'::text, count(*)::numeric, 'Storage limits currently breached'::text, 'control'::text, 'storage_limit_status'::text from sl where sl.status = any (array['OVER THE STORAGE LIMIT'::text, 'MATERIAL OLDER THAN THE LIMIT'::text])
union all
select 'limits_not_set'::text, count(*)::numeric, 'Storage limits nobody has set yet'::text, 'control'::text, 'storage_limits'::text from sl where sl.status like 'NO LIMIT%'
union all
select 'open_questions'::text, count(*)::numeric, 'Questions the platform needs answered'::text, 'control'::text, 'open_questions'::text from open_questions where status = 'open'
union all
select 'allocations_pending'::text, count(*)::numeric, 'Allocations waiting on Vincent'::text, 'control'::text, 'allocation_queue'::text from allocation_requests where status = 'pending';

-- The proof table holds nothing not already on the Control Tower, but rule is rule:
-- RLS on, anon off, at creation time. It is dropped once the diff is clean.
alter table tg_tower_rewrite_proof enable row level security;
revoke all on tg_tower_rewrite_proof from anon;;
