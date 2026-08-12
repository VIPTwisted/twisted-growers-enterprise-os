-- Agent I, 12 Aug 2026. DBI-065.
--
-- THE OPEN QUESTION, SETTLED. Agent X found the trap that would have made the room fix WORSE:
-- metrc_plants where LocationName = 'Flower Room #1' returns 13,552 rows, so a one-line repoint
-- from "F1" to "Flower Room #1" would have replaced "0 plants" with a 13x OVERSTATEMENT. X asked
-- whether a currency column exists and left the ruling to me. It does:
--
--     Flower Room #1  inactive   12,530
--     Flower Room #1  flowering   1,022   <- exactly the tile figure
--
-- source_state IS the currency discriminator. The mirror accumulates every plant that ever stood
-- in the room and marks the departed ones inactive. A plant is STANDING when source_state is
-- 'vegetative' or 'flowering', and that is the only definition any surface may use.
--
-- WHY THIS IS A VIEW AND NOT A NOTE TO AGENT B. A rule written in prose gets applied by whoever
-- read the prose. The next person queries metrc_plants directly and ships the 13x figure. The
-- filter belongs in ONE relation that every plant drill selects from, so the wrong number is not
-- reachable by accident. Same reasoning as room_alias: the registry must be the only door.
--
-- OWNER RULE SERVED: "this needs drill down every room seperately and grand total all weight;
-- fully detailed every tag as we do forensically." Every standing plant, one row, by tag.
--
-- UNDO: drop view v_room_plants_drill.

create or replace view public.v_room_plants_drill as
select a.our_name                                    as room,
       a.metrc_name                                  as metrc_room_name,
       p.raw->>'Label'                               as plant_tag,
       p.raw->>'StrainName'                          as strain,
       p.raw->>'GrowthPhase'                         as growth_phase,
       p.source_state                                as state,
       nullif(p.raw->>'PlantedDate','')::date        as planted_on,
       nullif(p.raw->>'VegetativeDate','')::date     as vegetative_on,
       nullif(p.raw->>'FloweringDate','')::date      as flowering_on,
       case when nullif(p.raw->>'FloweringDate','') is not null
            then current_date - (p.raw->>'FloweringDate')::date end as days_in_flower,
       nullif(p.raw->>'SublocationName','')          as sublocation,
       p.raw->>'PlantBatchName'                      as plant_batch,
       coalesce((p.raw->>'IsOnHold')::boolean,false)          as on_hold,
       coalesce((p.raw->>'IsOnInvestigation')::boolean,false) as on_investigation,
       nullif(p.raw->>'LastModified','')::timestamptz as metrc_last_modified
from metrc_plants p
join room_alias a
  on a.metrc_name = coalesce(nullif(p.raw->>'LocationName',''),'(none)')
where p.source_state in ('vegetative','flowering');

comment on view public.v_room_plants_drill is
 'EVERY STANDING PLANT, one row per tag, keyed by OUR room name so a tile can drill straight in. '
 'Built 12 Aug 2026 after two defects: the tile said "F1 — 1,022 plants" and its drill asked '
 'Metrc for a room called "F1" and got nothing, then explained the nothing; and the obvious fix '
 '(repoint to "Flower Room #1") would have returned 13,552 rows — a 13x overstatement — because '
 'the plant mirror keeps every plant that ever stood there. source_state IS the currency column: '
 'vegetative or flowering means standing, inactive means gone. That filter lives HERE and nowhere '
 'else, so no surface can reach the wrong population by querying metrc_plants directly.';;
