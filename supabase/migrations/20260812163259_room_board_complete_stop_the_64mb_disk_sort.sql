-- Agent I, 12 Aug 2026. DBI-058. Performance repair of my own DBI-053 work.
--
-- OWNER: "you have to wait 15s or more for command to load again its horrible."
--
-- MEASURED, not guessed. explain(analyze,buffers) on v_room_board_complete:
--   Execution Time: 1,170 ms
--   Sort Method: external merge  Disk: 64,432 kB
--   Seq Scan on metrc_plants: 55,402 rows at width=1,194
-- The standing-plants CTE grouped by raw->>'LocationName' across the WHOLE table while dragging
-- each row's entire jsonb payload through the sort. 64 MB written to disk and read back, to
-- count plants in six rooms. 890 of the 1,170 ms sat in that one sort.
--
-- THE FIX. Filter to the states we actually count BEFORE aggregating - only vegetative and
-- flowering rows matter, roughly 3,245 of 55,402 - and project the two fields we need instead of
-- carrying the payload. Same numbers out: coalesce keeps a genuinely empty plant room at 0
-- rather than letting it fall to NULL when the filter removes all its rows, so F2 still reads 0
-- and still gets its between-cycles sentence.
--
-- VERIFY AFTER APPLY: plants_now must still be F1 1022, F2 0, F3 1140, F4 1050, and every
-- non-plant room NULL. If any of those move, this migration is wrong and must be reverted.
-- UNDO: restore the view body from room_alias_metrc_names_and_honest_plant_counts.

create or replace view public.v_room_board_complete as
with held as (
  select o.room,
         max(o.department) as department, max(o.room_role) as room_role, max(o.licence) as licence,
         round(sum(o.lb),1) as lb_held, sum(o.tags) as tags_held, sum(o.units) as units_held,
         round(sum(o.lb) filter (where o.ownership not ilike '%our%'),1) as third_party_lb,
         sum(o.failed) as failed_tags, sum(o.no_coa) as tags_without_coa,
         count(distinct o.category) as categories
  from v_onhand_by_room_stage o group by o.room
),
standing as (
  -- Narrow projection + state filter in the scan. Was 55,402 wide rows through a disk sort;
  -- now only the standing plants, two columns, hash-aggregated in memory.
  select metrc_location,
         count(*)::numeric                   as plants_standing,
         count(distinct strain_name)::text   as strains_standing
  from (
    select coalesce(nullif(p.raw->>'LocationName',''),'(none)') as metrc_location,
           p.raw->>'StrainName'                                 as strain_name
    from metrc_plants p
    where p.source_state in ('vegetative','flowering')
  ) x
  group by metrc_location
)
select coalesce(h.room, r.room)                                       as room,
       coalesce(h.department, 'UNASSIGNED')                           as department,
       coalesce(h.room, r.room) || ' — ' || coalesce(h.department,'UNASSIGNED') as room_qualified,
       coalesce(h.room_role, r.room_type, 'Unclassified')             as room_role,
       h.licence                                                      as licence,
       coalesce(a.holds_plants, false)                                as is_flower_room,
       case when coalesce(a.holds_plants,false)
            then coalesce(s.plants_standing, 0) end                   as plants_now,
       case when coalesce(a.holds_plants,false)
            then coalesce(s.strains_standing, '0') end                as strains_now,
       r.cycle_days, r.next_event, r.next_event_date, r.days_until,
       h.lb_held, h.tags_held, h.units_held, h.third_party_lb,
       h.failed_tags, h.tags_without_coa, h.categories,
       case
         when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until < 0
              then 'OVER — ' || abs(r.days_until)::int || ' days past'
         when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until <= 7
              then 'PULLING — ' || r.days_until::int || ' days'
         when coalesce(a.holds_plants,false) and coalesce(s.plants_standing,0) > 0 then 'ON PLAN'
         when coalesce(a.holds_plants,false)                                       then 'TURNING'
         when coalesce(h.lb_held,0) > 0                                            then 'HOLDING STOCK'
         else 'EMPTY'
       end                                                            as state,
       case when coalesce(h.failed_tags,0) > 0 then 'bad'
            when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until < 0 then 'bad'
            when coalesce(a.holds_plants,false) and r.days_until is not null and r.days_until <= 7 then 'watch'
            else 'good' end                                           as tone,
       a.metrc_name                                                   as metrc_room_name,
       coalesce(a.holds_plants, false)                                as room_holds_plants,
       case when not coalesce(a.holds_plants,false) then
              'Metrc holds no plants in this room by design — it is a ' ||
              lower(coalesce(h.room_role, r.room_type, 'post-harvest area')) ||
              '. Material here is tracked by package tag, not by plant.'
            when coalesce(s.plants_standing,0) = 0 then
              'Metrc shows no vegetative or flowering plant in ' || a.metrc_name ||
              ' right now — an empty room between cycles is the normal state after a pull.'
       end                                                            as why_no_plants
from held h
full join v_room_board r on r.room = h.room
left join room_alias  a on a.our_name = coalesce(h.room, r.room)
left join standing    s on s.metrc_location = a.metrc_name;;
