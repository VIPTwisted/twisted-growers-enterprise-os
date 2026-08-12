-- FIX, same day. The first version joined packages on
--   p.raw->>'SourceHarvestNames' = l.harvest_name
-- which is an EXACT match. A package built from several harvests stores them as a
-- comma-separated LIST, so it could never match - and multi_harvest_lb_unallocated was
-- therefore null on every row. The column reported "no multi-harvest packages touch this
-- pull" for all 26 pulls while 9,734 lb of them existed.
--
-- That is the failure this platform keeps having: not a wrong number, a MISSING one that
-- reads as a clean result. A check that cannot fail proves nothing (C0b), and a column that
-- cannot populate is the same defect wearing a different hat.
create or replace view public.v_pull_yield as
with linked as (
  select * from v_harvest_pull_link where pull_no is not null
),
pkg_single as (
  select l.pull_no, l.is_fresh_frozen,
         p.raw#>>'{Item,ProductCategoryName}' as category,
         f_to_pounds((p.raw->>'CreatedQuantity')::numeric,
                     p.raw->>'CreatedQuantityUnitOfMeasureAbbreviation') as created_lb
  from linked l
  join metrc_packages p
    on p.raw->>'SourceHarvestNames' = l.harvest_name
   and coalesce((p.raw->>'SourceHarvestCount')::int, 1) = 1
),
pkg_multi as (
  select distinct l.pull_no, p.id as package_id,
         f_to_pounds((p.raw->>'CreatedQuantity')::numeric,
                     p.raw->>'CreatedQuantityUnitOfMeasureAbbreviation') as created_lb
  from metrc_packages p
  cross join lateral unnest(string_to_array(p.raw->>'SourceHarvestNames', ', ')) as hn(harvest_name)
  join linked l on l.harvest_name = btrim(hn.harvest_name)
  where coalesce((p.raw->>'SourceHarvestCount')::int, 1) > 1
),
agg as (
  select pull_no,
    sum(created_lb) filter (where not is_fresh_frozen and category ilike '%bud%')   as dried_bud_lb,
    sum(created_lb) filter (where not is_fresh_frozen
                              and (category ilike '%shake%' or category ilike '%trim%')) as shake_trim_lb,
    sum(created_lb) filter (where is_fresh_frozen)                                   as fresh_frozen_lb
  from pkg_single group by pull_no
),
multi as (
  select pull_no, sum(created_lb) as multi_lb, count(*) as multi_packages
  from pkg_multi group by pull_no
),
h as (
  select pull_no, count(*) as harvests,
         count(*) filter (where is_fresh_frozen) as fresh_frozen_harvests,
         string_agg(distinct room_actual, '/' order by room_actual) as rooms_actual,
         bool_or(room_actual is distinct from room_planned) as room_drifted,
         sum(wet_weight)/453.592 as wet_lb
  from linked group by pull_no
)
select
  pl.pull_no, pl.harvest_date as pull_planned_date, pl.flower_room as room_planned,
  h.rooms_actual, h.room_drifted, pl.planned_plants,
  h.harvests, h.fresh_frozen_harvests,
  round(h.wet_lb, 1)                        as wet_lb,
  round(a.dried_bud_lb, 1)                  as dried_bud_lb,
  round(a.shake_trim_lb, 1)                 as shake_trim_lb,
  round(a.fresh_frozen_lb, 1)               as fresh_frozen_lb,
  round(m.multi_lb, 1)                      as multi_harvest_lb_unallocated,
  m.multi_packages                          as multi_harvest_packages,
  round(pl.projected_flower_after_ff_lb, 1) as plan_dried_lb,
  f_rule('pull_target_dried_lb')            as owner_target_dried_lb,
  round(a.dried_bud_lb - pl.projected_flower_after_ff_lb, 1) as vs_plan_lb,
  round(a.dried_bud_lb - f_rule('pull_target_dried_lb'), 1)  as vs_owner_target_lb,
  case
    when h.harvests is null
      then 'NO HARVESTS LINKED to this pull. Either it has not happened yet, or it happened and was not recorded in Metrc. If the date has passed, this is urgent.'
    when a.dried_bud_lb is null and h.fresh_frozen_harvests = h.harvests
      then 'No dried flower - every harvest in this pull was taken as fresh frozen, which is packaged wet and must never be added to a dried figure.'
    when a.dried_bud_lb is null
      then 'No dried flower packaged yet. Harvest to availability runs about 28 days, so a recent pull reads empty until curing finishes.'
    when m.multi_lb > 0
      then 'FLOOR, not a total. A further ' || m.multi_packages || ' package(s) holding '
           || round(m.multi_lb,1) || ' lb draw on this pull AND others, and are NOT included - splitting them across pulls is an owner decision not yet made. They are listed against every pull they touch, so they must never simply be added.'
    else 'Complete for single-harvest packages. No multi-harvest packages touch this pull.'
  end as completeness_note
from harvest_plan_2026 pl
left join h       on h.pull_no  = pl.pull_no
left join agg a   on a.pull_no  = pl.pull_no
left join multi m on m.pull_no  = pl.pull_no
order by pl.pull_no;;
