-- GROK-WHY: Owner 8 Sep 2026. v_canopy_two_size dropped cult_room_plant_snapshot.taken_on.
-- L6: source HAS a date. Expose as_of at the END (cannot rename first column). No DROP. Cycle 56.
-- E6: grant to authenticated only. Do not grant to anon.

create or replace view public.v_canopy_two_size as
select
  g.code as room,
  case when g.code in ('F1','F3') then 'LARGE' else 'SMALL' end as size,
  g.plant_capacity as cap,
  g.tables,
  g.plants_per_table,
  s.plants as plants_now,
  case when g.plant_capacity is null or s.plants is null then null
       else g.plant_capacity - s.plants end as short_by,
  case
    when s.plants is null then 'NO SNAPSHOT'
    when g.plant_capacity is null then 'NO CAP'
    when s.plants < g.plant_capacity then 'SHORT'
    else 'FULL'
  end as verdict,
  'conversion_factors.room_capacity MATCH grow_rooms. 1150 is labor, not cap.'::text as law,
  (select max(taken_on) from public.cult_room_plant_snapshot) as as_of
from public.grow_rooms g
left join (
  select room_key, sum(plants)::bigint as plants
  from public.cult_room_plant_snapshot
  where taken_on = (select max(taken_on) from public.cult_room_plant_snapshot)
    and phase = 'Flowering'
  group by room_key
) s on s.room_key = g.code
where g.code in ('F1','F2','F3','F4');

grant select on public.v_canopy_two_size to authenticated;
