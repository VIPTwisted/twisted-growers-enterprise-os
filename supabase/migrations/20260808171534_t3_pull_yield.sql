-- T3 part 2 — WHAT EACH PULL ACTUALLY YIELDED. Owner-directed, 8 Aug 2026.
--
-- TWO CORRECTIONS ARE BUILT IN, AND BOTH CHANGE THE ANSWER:
--
-- 1. YIELD IS MEASURED FROM CreatedQuantity, NOT Quantity.
--    Metrc's Quantity is what REMAINS in a package today. mv_harvest_pkg_rollup sums it,
--    so a harvest that sold through reads as a near-total failure: TG Apple Fritter -
--    20260127 F4 shows bud_lb 0.00 against 14 packages holding 121.8 lb when created.
--    Across 2026: 6,330 lb created against 824 lb still held, 308 of 460 packages fully
--    depleted. Any yield built on Quantity decays toward zero as stock sells - it measures
--    the shelf, not the plants.
--
-- 2. FRESH FROZEN IS NEVER ADDED TO DRIED (rule B3). It is packaged WET. The FF suffix in
--    the harvest name marks it. Freezer/Biomass reads 277-417 g/plant only because it is
--    water; dried runs 46-113.
--
-- WHAT THIS VIEW DELIBERATELY DOES NOT DO (rule A1 - never invent a number):
--    1,848 of 4,218 packages - 44%, 9,734 lb - draw on MORE THAN ONE harvest. Splitting
--    them across pulls needs a business rule the owner has not set: evenly, by wet weight,
--    by strain, or excluded entirely. So dried_bud_lb counts SINGLE-harvest packages only
--    and is therefore a FLOOR, stated as such. The multi-harvest pool is exposed beside it,
--    unallocated and labelled, rather than silently dropped (A3) or silently apportioned.

create or replace view public.v_pull_yield as
with linked as (
  select * from v_harvest_pull_link where pull_no is not null
),
pkg as (
  select
    l.pull_no,
    l.is_fresh_frozen,
    (p.raw->>'SourceHarvestCount')::int as source_harvest_count,
    p.raw#>>'{Item,ProductCategoryName}' as category,
    f_to_pounds((p.raw->>'CreatedQuantity')::numeric,
                p.raw->>'CreatedQuantityUnitOfMeasureAbbreviation') as created_lb
  from linked l
  join metrc_packages p on p.raw->>'SourceHarvestNames' = l.harvest_name
),
agg as (
  select
    pull_no,
    sum(created_lb) filter (where not is_fresh_frozen and category ilike '%bud%'
                              and source_harvest_count = 1)               as dried_bud_lb,
    sum(created_lb) filter (where not is_fresh_frozen
                              and (category ilike '%shake%' or category ilike '%trim%')
                              and source_harvest_count = 1)               as shake_trim_lb,
    sum(created_lb) filter (where is_fresh_frozen and source_harvest_count = 1) as fresh_frozen_lb,
    sum(created_lb) filter (where source_harvest_count > 1)               as multi_harvest_lb_unallocated,
    count(*) filter (where source_harvest_count > 1)                      as multi_harvest_packages
  from pkg group by pull_no
),
h as (
  select pull_no,
         count(*)                                          as harvests,
         count(*) filter (where is_fresh_frozen)           as fresh_frozen_harvests,
         string_agg(distinct room_actual, '/' order by room_actual) as rooms_actual,
         bool_or(room_actual is distinct from room_planned) as room_drifted,
         sum(wet_weight)/453.592                           as wet_lb
  from linked group by pull_no
)
select
  pl.pull_no,
  pl.harvest_date          as pull_planned_date,
  pl.flower_room           as room_planned,
  h.rooms_actual,
  h.room_drifted,
  pl.planned_plants,
  h.harvests,
  h.fresh_frozen_harvests,
  round(h.wet_lb, 1)                          as wet_lb,
  round(a.dried_bud_lb, 1)                    as dried_bud_lb,
  round(a.shake_trim_lb, 1)                   as shake_trim_lb,
  round(a.fresh_frozen_lb, 1)                 as fresh_frozen_lb,
  round(a.multi_harvest_lb_unallocated, 1)    as multi_harvest_lb_unallocated,
  a.multi_harvest_packages,
  round(pl.projected_flower_after_ff_lb, 1)   as plan_dried_lb,
  f_rule('pull_target_dried_lb')              as owner_target_dried_lb,
  round(a.dried_bud_lb - pl.projected_flower_after_ff_lb, 1) as vs_plan_lb,
  round(a.dried_bud_lb - f_rule('pull_target_dried_lb'), 1)  as vs_owner_target_lb,
  /* Rule A3 - every figure says what it is and what would make it complete. */
  case
    when h.harvests is null
      then 'NO HARVESTS LINKED to this pull. Either it has not happened yet, or it happened and was not recorded in Metrc. If the date has passed, this is urgent.'
    when a.dried_bud_lb is null and h.fresh_frozen_harvests = h.harvests
      then 'No dried flower - every harvest in this pull was taken as fresh frozen, which is packaged wet and must never be added to a dried figure.'
    when a.dried_bud_lb is null
      then 'No dried flower packaged yet. Harvest to availability runs about 28 days, so a recent pull will read empty until curing finishes.'
    when a.multi_harvest_lb_unallocated > 0
      then 'FLOOR, not a total. ' || a.multi_harvest_packages || ' package(s) holding '
           || round(a.multi_harvest_lb_unallocated,1) || ' lb draw on more than one harvest and are NOT included, because how to split them across pulls is an owner decision that has not been made.'
    else 'Complete for single-harvest packages. No multi-harvest packages touch this pull.'
  end as completeness_note
from harvest_plan_2026 pl
left join h on h.pull_no = pl.pull_no
left join agg a on a.pull_no = pl.pull_no
order by pl.pull_no;

comment on view public.v_pull_yield is
  'T3, 8 Aug 2026. What each 2026 pull actually yielded. Yield is measured from Metrc '
  'CreatedQuantity, NOT Quantity - Quantity is what remains today, so a sold-through '
  'harvest reads as a failure (2026: 6,330 lb created vs 824 lb still held). Fresh frozen '
  'is reported separately and never added to dried (B3). dried_bud_lb counts SINGLE-harvest '
  'packages only and is a FLOOR: 44% of packages draw on several harvests and apportioning '
  'them is an unmade owner decision, so they are exposed unallocated rather than invented '
  'or dropped. owner_target_dried_lb is an editable row, not a literal (G1).';;
