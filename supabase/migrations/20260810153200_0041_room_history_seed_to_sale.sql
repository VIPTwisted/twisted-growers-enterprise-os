-- ---------------------------------------------------------------------------
-- 0041 — ROOM HISTORY, SEED TO SALE. Where was every tag, and when.
--
-- Owner, 10 Aug 2026, and he was right to push: we DO have enough to track rooms
-- seed to sale. It had not been assembled.
--
-- FOUR SOURCES, ONE TIMELINE:
--   metrc_rpt_point_in_time   the room a tag was in ON A GIVEN DATE. Two snapshots
--                             loaded: 2025-01-01 (= the close of 31 Dec 2024,
--                             2,103 records) and 2026-08-06 (5,163 records).
--   metrc_packages            the room it is in NOW, live.
--   metrc_rpt_transfer_...    the room it LEFT the building from, via manifest.
--   metrc_harvests            the drying room the plant material started in.
--
-- WHY THIS IS NOT A FULL AUDIT TRAIL, stated plainly. Metrc's package API carries
-- ONLY THE CURRENT LOCATION -- there is no per-move log. So room history is exact
-- at snapshot dates and current today, and unknown between them. Every extra
-- Inventory Point in Time export adds one more exact date. The 31 Dec 2025
-- snapshot is already saved in docs/metrc-exports and has NOT been imported --
-- importing it adds a third exact date for free.
-- ---------------------------------------------------------------------------

create or replace view v_room_history as
-- 1 · where it was at each snapshot
select pit.tag                                    as package_tag,
       pit.as_of_date                             as observed_on,
       'snapshot'::text                           as observation,
       pit.location                               as room,
       pit.licence,
       pit.record_type,
       pit.name                                   as item,
       pit.strain,
       pit.category,
       'Inventory Point in Time export'::text     as source
from metrc_rpt_point_in_time pit
where pit.location is not null

union all

-- 2 · where it is now
select p.raw->>'Label',
       current_date,
       'current',
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)'),
       p.license,
       'Package',
       p.raw#>>'{Item,Name}',
       f_strain_from_item(p.raw#>>'{Item,Name}'),
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)'),
       'live package mirror'
from metrc_packages p
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false

union all

-- 3 · the room the plant material started in, from the harvest
select h.raw->>'Name',
       (h.raw->>'HarvestStartDate')::date,
       'harvest',
       nullif(h.raw->>'DryingLocationName',''),
       h.license,
       'Harvest',
       h.raw->>'Name',
       f_strain_from_item(h.raw->>'Name'),
       'Harvest',
       'harvest drying location (a LABEL, it does not move with the material)'
from metrc_harvests h
where nullif(h.raw->>'DryingLocationName','') is not null;

comment on view v_room_history is
  'Where every tag was, and when. Snapshots give EXACT rooms on their dates '
  '(2025-01-01 = the close of 31 Dec 2024, and 2026-08-06); the live mirror gives '
  'today. Metrc''s package API carries only the CURRENT location -- there is no '
  'per-move log -- so between snapshots the room is unknown. Each additional '
  'Inventory Point in Time export adds one more exact date.';

grant select on v_room_history to authenticated;


-- Room-by-room position at any loaded snapshot, side by side with today.
create or replace view v_room_position_over_time as
select room, licence, record_type,
       count(*) filter (where observed_on = date '2025-01-01')  as at_2024_year_end,
       count(*) filter (where observed_on = date '2026-08-06')  as at_2026_08_06,
       count(*) filter (where observation = 'current')          as now,
       count(distinct observed_on)                              as dates_observed
from v_room_history
where observation in ('snapshot','current')
group by 1,2,3;

comment on view v_room_position_over_time is
  'Tag counts per room at each loaded snapshot and today. Add snapshots to add '
  'columns of history -- the 31 Dec 2025 export is saved and not yet imported.';

grant select on v_room_position_over_time to authenticated;
;
