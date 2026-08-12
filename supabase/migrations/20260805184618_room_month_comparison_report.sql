-- THE FIX REPORT: room by room, month by month, best against worst.
-- This answers "compare the best and worst months room by room" without anyone walking the floor.
create or replace view v_room_month_comparison as
with rm as (
  select coalesce(h.raw->>'DryingLocationName','(no room)') as room,
    to_char(h.harvest_start,'YYYY-MM') as month,
    (date_trunc('month', h.harvest_start))::date as month_date,
    count(*) as harvests,
    sum(coalesce((h.raw->>'PlantCount')::numeric,0)) as plants,
    sum(coalesce((h.raw->>'TotalWetWeight')::numeric,0)) as wet_g,
    sum(coalesce((h.raw->>'TotalPackagedWeight')::numeric,0)) as packaged_g,
    sum(coalesce((h.raw->>'TotalWasteWeight')::numeric,0)) as waste_g,
    avg(case when h.raw->>'FinishedDate' is not null
      then ((h.raw->>'FinishedDate')::date - h.harvest_start) end) as avg_dry_days
  from metrc_harvests h where h.harvest_start is not null
  group by 1,2,3
),
scored as (
  select rm.*,
    case when wet_g > 0 then round((100.0*packaged_g/wet_g)::numeric,1) end as conversion_pct,
    case when plants > 0 then round((packaged_g/plants)::numeric,1) end as grams_per_plant,
    round(avg_dry_days::numeric,1) as dry_days
  from rm
)
select s.room, s.month, s.harvests, s.plants,
  round((s.wet_g/453.592)::numeric,1) as wet_lbs,
  round((s.packaged_g/453.592)::numeric,1) as saleable_lbs,
  s.conversion_pct, s.grams_per_plant, s.dry_days,
  max(s.conversion_pct) over (partition by s.room) as room_best_conversion,
  min(s.conversion_pct) over (partition by s.room) as room_worst_conversion,
  round((s.conversion_pct - avg(s.conversion_pct) over (partition by s.room))::numeric,1) as versus_room_average,
  (select average from industry_benchmarks where metric='Wet to saleable conversion') as industry_average_pct,
  case
    when s.conversion_pct = max(s.conversion_pct) over (partition by s.room) then 'BEST MONTH for this room'
    when s.conversion_pct = min(s.conversion_pct) over (partition by s.room) then 'WORST MONTH for this room'
    else 'middle of the range' end as standing,
  round((s.wet_g/453.592 * (max(s.conversion_pct) over (partition by s.room) - s.conversion_pct)/100.0)::numeric,1) as pounds_lost_versus_room_best,
  round((s.wet_g/453.592 * (max(s.conversion_pct) over (partition by s.room) - s.conversion_pct)/100.0
    * (select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1))::numeric,0) as dollars_lost_versus_room_best,
  'This room hit ' || max(s.conversion_pct) over (partition by s.room) || ' percent in its best month and '
    || s.conversion_pct || ' percent here. Same room, same equipment - the difference is drying time and trim practice, not the building.' as what_this_means,
  case when s.dry_days is not null then 'Average dry ran ' || s.dry_days || ' days this month.' else 'Dry duration not recorded for this month.' end as dry_evidence,
  s.month_date
from scored s
order by dollars_lost_versus_room_best desc nulls last;

create or replace view v_room_best_vs_worst as
select room,
  max(conversion_pct) filter (where standing = 'BEST MONTH for this room') as best_conversion,
  max(month) filter (where standing = 'BEST MONTH for this room') as best_month,
  max(grams_per_plant) filter (where standing = 'BEST MONTH for this room') as best_grams_per_plant,
  max(dry_days) filter (where standing = 'BEST MONTH for this room') as best_dry_days,
  min(conversion_pct) filter (where standing = 'WORST MONTH for this room') as worst_conversion,
  max(month) filter (where standing = 'WORST MONTH for this room') as worst_month,
  max(grams_per_plant) filter (where standing = 'WORST MONTH for this room') as worst_grams_per_plant,
  max(dry_days) filter (where standing = 'WORST MONTH for this room') as worst_dry_days,
  round((max(conversion_pct) filter (where standing = 'BEST MONTH for this room')
       - min(conversion_pct) filter (where standing = 'WORST MONTH for this room'))::numeric,1) as spread_points,
  round(sum(dollars_lost_versus_room_best)::numeric,0) as total_dollars_lost_versus_own_best,
  'This room is capable of ' || max(conversion_pct) filter (where standing = 'BEST MONTH for this room')
    || ' percent - it has already done it. Everything below that is practice, not capacity.' as what_this_means
from v_room_month_comparison
group by room
order by total_dollars_lost_versus_own_best desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Cultivation', (select category_order from nav_registry where category='Cultivation' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('FIX REPORT: Room Best vs Worst', 15, 'scale', 'room_best_vs_worst', 'v_room_best_vs_worst', 'The fix report: for every room, its best month against its worst - conversion, grams per plant, dry days and the spread - with what that gap has cost. If a room already hit a number once, it can hit it again.'),
  ('FIX REPORT: Room by Month', 16, 'gauge', 'room_month_comparison', 'v_room_month_comparison', 'Every room every month: conversion, grams per plant, average dry days, whether it was that room best or worst month, how far from the room average, and what the gap versus its own best cost in pounds and dollars.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select room, best_month, best_conversion, worst_month, worst_conversion, spread_points, total_dollars_lost_versus_own_best from v_room_best_vs_worst limit 6;;
