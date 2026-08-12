-- RULE J7, owner-set 8 Aug 2026: "all inventory in our possession we must know exactly
-- what room it is in." Extends C0b from untested items to EVERYTHING we hold, owned or
-- not - custody is the test, not ownership.
--
-- Measured on creation: 862 packages held, ZERO with no room. That is the good news and it
-- should stay true. What is NOT true is that the rooms are cleanly named.
create or replace view public.v_inventory_room_proof as
with held as (
  select
    p.tag,
    nullif(btrim(p.raw->>'LocationName'), '')     as room_raw,
    nullif(btrim(p.raw->>'SublocationName'), '')  as sublocation,
    p.raw#>>'{Item,ProductCategoryName}'          as category,
    f_to_pounds((p.raw->>'Quantity')::numeric, p.raw->>'UnitOfMeasureAbbreviation') as lb,
    (p.raw->>'Quantity')::numeric                 as qty,
    p.raw->>'UnitOfMeasureAbbreviation'           as uom
  from metrc_packages p
  where coalesce((p.raw->>'Quantity')::numeric, 0) > 0
    and coalesce((p.raw->>'IsFinished')::boolean, false) = false
),
/* Collapse case, punctuation and the word "room" so two spellings of one place can be
   seen as one. This DETECTS the collision; it deliberately does not merge them, because
   whether they are the same physical room is the owner's call, not a guess (rule A5). */
norm as (
  select *,
    regexp_replace(lower(coalesce(room_raw,'')), '[^a-z0-9]', '', 'g')                    as room_key_strict,
    regexp_replace(regexp_replace(lower(coalesce(room_raw,'')), '\yroom\y', '', 'g'),
                   '[^a-z0-9]', '', 'g')                                                  as room_key_loose
  from held
),
collisions as (
  select room_key_loose, count(distinct room_raw) as spellings,
         string_agg(distinct room_raw, ' | ' order by room_raw) as names
  from norm where room_key_loose <> '' group by room_key_loose having count(distinct room_raw) > 1
)
select
  n.tag, n.room_raw as room, n.sublocation, n.category,
  round(n.lb, 2) as lb, n.qty, n.uom,
  case
    when n.room_raw is null
      then 'FAILS J7 - NO ROOM RECORDED. We hold this and cannot say where it is. Massachusetts law requires Metrc to carry the current room for every tagged package, so this is a recording failure or unaccounted material.'
    when c.room_key_loose is not null
      then 'AMBIGUOUS ROOM - "' || n.room_raw || '" collides with: ' || c.names ||
           '. These are probably one physical room under ' || c.spellings ||
           ' spellings, so any total for it is wrong from either name. Room names need a controlled vocabulary (G1), not free text.'
    when n.sublocation is null
      then 'ROOM KNOWN, SHELF UNKNOWN - "' || n.room_raw || '" is recorded but no sublocation is. Permitted, but a physical count needs the shelf, and absence must be stated rather than implied (A3).'
    else 'PASSES J7 - room and sublocation both recorded.'
  end as room_proof,
  (n.room_raw is null) as fails_j7,
  (c.room_key_loose is not null) as ambiguous_room
from norm n
left join collisions c on c.room_key_loose = n.room_key_loose;

comment on view public.v_inventory_room_proof is
  'Rule J7, 8 Aug 2026: every item in our possession has a known room - owned, bought-in, '
  'tolled or consigned, because custody is the test and not ownership. `where fails_j7` '
  'must return zero rows. Also detects room-name COLLISIONS: on 8 Aug "Pre-Trim Storage" '
  'and "Pre Trim Storage Room" held 574 lb between them under two spellings of what is '
  'probably one room, so any total for it was wrong from either name. Collisions are '
  'reported, never merged - whether two names are one room is the owner''s call (A5).';;
