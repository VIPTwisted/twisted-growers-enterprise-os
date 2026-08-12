-- Agent I, 12 Aug 2026. DBI-062. Repair of my OWN DBI-053/058 work, found by Agent V's data lane.
--
-- DEFECT. The panel is titled "every room" and showed 19 of 22. The row set came from
-- held FULL JOIN v_room_board, so a room appeared only if it held packages or was in the grow-room
-- calendar. Mother Room, Veg A and Dry Room #1 are in neither: Mother holds 33 LIVING PLANTS and
-- appeared nowhere. Measured gap: sum(plants_now) 3,212 on the board vs 3,245 in Metrc, and the
-- flow strip on the same page prints 3,245 - so the page contradicted itself by 33 plants.
--
-- CAUSE, honestly. I built room_alias as the room registry and then did not use it as the spine.
-- A registry that some queries consult and others bypass is worse than no registry, because the
-- omission is invisible. The spine is now the UNION of all three sources, so a room registered
-- anywhere reaches the board.
--
-- Columns unchanged in name, order and type. Row set only.
-- VERIFY AFTER APPLY: sum(plants_now) must be 3,245 = F3 1,140 + F4 1,050 + F1 1,022 + Mother 33
-- + F2 0 + Veg A 0, and the board must carry 22 rooms.
-- UNDO: restore the body from room_board_complete_stop_the_64mb_disk_sort (reinstates the defect).

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
  select metrc_location,
         count(*)::numeric                 as plants_standing,
         count(distinct strain_name)::text as strains_standing
  from (
    select coalesce(nullif(p.raw->>'LocationName',''),'(none)') as metrc_location,
           p.raw->>'StrainName'                                 as strain_name
    from metrc_plants p
    where p.source_state in ('vegetative','flowering')
  ) x
  group by metrc_location
),
spine as (          -- every room known to ANY source. The registry is the spine, not an add-on.
  select room from held
  union select room from v_room_board
  union select our_name from room_alias
)
select sp.room                                                        as room,
       coalesce(h.department, 'UNASSIGNED')                           as department,
       sp.room || ' — ' || coalesce(h.department,'UNASSIGNED')        as room_qualified,
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
              'Metrc shows no vegetative or flowering plant in ' || coalesce(a.metrc_name, sp.room) ||
              ' right now — an empty room between cycles is the normal state after a pull.'
       end                                                            as why_no_plants
from spine sp
left join held         h on h.room = sp.room
left join v_room_board r on r.room = sp.room
left join room_alias   a on a.our_name = sp.room
left join standing     s on s.metrc_location = a.metrc_name;;
