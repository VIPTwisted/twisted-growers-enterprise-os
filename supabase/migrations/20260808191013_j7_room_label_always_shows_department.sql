-- Owner, 8 Aug 2026: "mark this so user always sees" / "yes two different departments."
-- A bare room name is never shown again. room_qualified now carries the DEPARTMENT, read
-- from company_licenses (rule G2 - licences come from the table, never a literal), so the
-- label survives a licence being renamed or added.
--
-- 557 of 862 held packages - 65% - sit in a room whose name exists under both licences.
-- 15 physically distinct rooms wear only 13 distinct names. Showing a bare name is showing
-- the wrong room two thirds of the time.
create or replace view public.v_inventory_room_proof as
with held as (
  select
    p.tag, p.license,
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
  h.tag, h.room, h.sublocation, h.category,
  round(h.lb, 2) as lb, h.qty, h.uom,
  case
    when h.room is null
      then 'FAILS J7 - NO ROOM RECORDED. We hold this and cannot say where it is. Massachusetts law requires Metrc to carry the current room for every tagged package, so this is a recording failure or unaccounted material.'
    when loc.metrc_id is null
      then 'FAILS J7 - room "' || h.room || '" is not listed in metrc_locations for licence ' || coalesce(h.license,'?') ||
           '. The package names a room Metrc does not hold under that licence, so its location cannot be confirmed against the state record.'
    when sn.name is not null
      then 'ROOM CONFIRMED - ' || h.room || ', ' || coalesce(initcap(cl.kind), h.license) || ' department (' || h.license || '), Metrc id ' || loc.metrc_id ||
           '. THIS NAME EXISTS IN BOTH DEPARTMENTS and is two physically different rooms. Never show or total it without the department.'
    when h.sublocation is null
      then 'ROOM CONFIRMED - ' || h.room || ', ' || coalesce(initcap(cl.kind), h.license) || ' department (' || h.license || '), Metrc id ' || loc.metrc_id ||
           '. No sublocation recorded: the room is known, the shelf is not. A physical count needs the shelf (A3).'
    else 'PASSES J7 - room and shelf both confirmed against Metrc.'
  end as room_proof,
  (h.room is null or loc.metrc_id is null) as fails_j7,
  (sn.name is not null) as ambiguous_room,
  h.license,
  /* THE LABEL TO SHOW THE USER, EVERYWHERE. Never the bare room name. */
  h.room || ' — ' || coalesce(initcap(cl.kind), 'licence ' || coalesce(h.license,'unknown')) as room_qualified,
  loc.metrc_id as room_metrc_id,
  -- appended 8 Aug 2026 --
  cl.kind  as department,
  cl.label as licence_label
from held h
left join metrc_locations loc on loc.name = h.room and loc.license = h.license
left join shared_names sn     on sn.name = h.room
left join company_licenses cl on cl.license = h.license;

comment on view public.v_inventory_room_proof is
  'Rule J7, corrected 8 Aug 2026 after the owner caught a false positive. ROOM IDENTITY IS '
  'LICENCE + NAME. Eleven names exist in BOTH departments as physically different rooms '
  'with different Metrc ids; 557 of 862 held packages sit in one. Pre Trim Storage Room '
  '(cultivation) and Pre-Trim Storage (manufacturing) are two real rooms, not one misspelt '
  'one. ALWAYS display room_qualified, never the bare room name - a bare name shows the '
  'wrong room two thirds of the time. Department comes from company_licenses (G2). '
  '`where fails_j7` must return zero.';;
