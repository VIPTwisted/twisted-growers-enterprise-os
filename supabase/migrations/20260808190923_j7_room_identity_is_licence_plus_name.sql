-- CORRECTED, same day. The first version was WRONG and the owner caught it.
--
-- It flagged "Pre-Trim Storage" and "Pre Trim Storage Room" as one room under two
-- spellings. The owner: "we have two rooms for pre trim storage." He is right, and Metrc
-- says so plainly:
--
--   Pre Trim Storage Room   MC281714 (cultivation)    metrc_id 586309
--   Pre-Trim Storage        MP281909 (manufacturing)  metrc_id 814201
--
-- Two licences, two facilities, two Metrc location ids. I assumed a data-quality problem
-- where there was a business fact - exactly what rule A5 forbids: never assume business
-- practice, ask.
--
-- THE CORRECTION EXPOSED SOMETHING WORSE THAN MY ERROR. ELEVEN room names exist under BOTH
-- licences - Finish Vault, Fulfillment Vault, Cure Vault, Dry Room #1 and #2,
-- Freezer/Biomass Storage, Grind Room, Packaging Room, Quarantine, Shipping & Receiving,
-- BDA/Storage Room. Each pair is two physically different rooms sharing a name. Grouping
-- by NAME silently merges them: "Finish Vault" holds 308 packages across two separate
-- vaults in two separate facilities, and no total by name is trustworthy.
--
-- ROOM IDENTITY IS LICENCE + NAME. Metrc's own location id is the key, never the name.
-- Column order preserved and new columns appended only (rule E1).
create or replace view public.v_inventory_room_proof as
with held as (
  select
    p.tag,
    p.license,
    nullif(btrim(p.raw->>'LocationName'), '')    as room,
    nullif(btrim(p.raw->>'SublocationName'), '') as sublocation,
    p.raw#>>'{Item,ProductCategoryName}'         as category,
    f_to_pounds((p.raw->>'Quantity')::numeric, p.raw->>'UnitOfMeasureAbbreviation') as lb,
    (p.raw->>'Quantity')::numeric                as qty,
    p.raw->>'UnitOfMeasureAbbreviation'          as uom
  from metrc_packages p
  where coalesce((p.raw->>'Quantity')::numeric, 0) > 0
    and coalesce((p.raw->>'IsFinished')::boolean, false) = false
),
shared_names as (
  select name from metrc_locations group by name having count(distinct license) > 1
)
select
  h.tag,
  h.room,
  h.sublocation,
  h.category,
  round(h.lb, 2) as lb,
  h.qty,
  h.uom,
  case
    when h.room is null
      then 'FAILS J7 - NO ROOM RECORDED. We hold this and cannot say where it is. Massachusetts law requires Metrc to carry the current room for every tagged package, so this is a recording failure or unaccounted material.'
    when loc.metrc_id is null
      then 'FAILS J7 - room "' || h.room || '" is not listed in metrc_locations for licence ' || coalesce(h.license,'?') ||
           '. The package names a room Metrc does not hold under that licence, so its location cannot be confirmed against the state record.'
    when sn.name is not null
      then 'ROOM CONFIRMED - "' || h.room || '" under licence ' || h.license || ', Metrc id ' || loc.metrc_id ||
           '. NOTE: this name exists under BOTH licences and is TWO physically different rooms. Never total this room by name alone.'
    when h.sublocation is null
      then 'ROOM CONFIRMED - "' || h.room || '" under licence ' || h.license || ', Metrc id ' || loc.metrc_id ||
           '. No sublocation recorded: the room is known, the shelf is not. A physical count needs the shelf (A3).'
    else 'PASSES J7 - room and shelf both confirmed against Metrc.'
  end as room_proof,
  (h.room is null or loc.metrc_id is null) as fails_j7,
  /* Retained name, corrected meaning. It never meant "misspelt"; it means the name alone
     does not identify the room, which is true of 11 names across the two licences. */
  (sn.name is not null) as ambiguous_room,
  -- appended 8 Aug 2026 --
  h.license,
  h.room || ' (' || coalesce(h.license, 'licence unknown') || ')' as room_qualified,
  loc.metrc_id as room_metrc_id
from held h
left join metrc_locations loc on loc.name = h.room and loc.license = h.license
left join shared_names sn on sn.name = h.room;

comment on view public.v_inventory_room_proof is
  'Rule J7, corrected 8 Aug 2026 after the owner caught a false positive. ROOM IDENTITY IS '
  'LICENCE + NAME, never the name alone: ELEVEN names exist under both MC281714 and '
  'MP281909 as physically different rooms with different Metrc ids, so a total by name is '
  'a total across two facilities. Pre Trim Storage Room (MC281714) and Pre-Trim Storage '
  '(MP281909) are two real rooms, not one misspelt one. `where fails_j7` must return zero: '
  'it catches a package with no room at all, or one naming a room Metrc does not list '
  'under its licence.';;
