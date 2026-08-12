-- T3 — LINK HARVESTS TO PULLS. Owner-directed, 8 Aug 2026.
--
-- Metrc records HARVESTS. The business runs on PULLS. Nothing connected the two, so the
-- platform could not answer "what did pull 9 actually yield" at all. planned_pull was NULL
-- on every packaged harvest, a Metrc harvest averages 132 plants where a pull is ~1,140,
-- and mv_harvest_yields.room is a STORAGE room, not Flower Room 1-4.
--
-- HOW THE LINK IS MADE, and why not the obvious way:
--   Matching on ROOM FAILS. Only 16 of 95 harvests in 2026 sit in the room the plan
--   expected; the rotation has drifted. Room-matching produced offsets of 14, 21 and 22
--   days - exact multiples of the 14-day cadence, i.e. matching to the wrong cycle
--   entirely. So the room is REPORTED, never used to join.
--   Matching on DATE works. All 95 harvests fall within +/-7 days of a planned pull, and
--   since pulls are 14 days apart, +/-7 partitions the year with no overlap.
--
-- WET AND DRY ARE NOT MIXED (rule B3). The "FF" suffix in the harvest name marks fresh
-- frozen, which is packaged WET. Freezer/Biomass shows 277-417 g/plant precisely because
-- it is water; dried material runs 46-113. Averaging them is the error that once produced
-- a finding wrong by a factor of six.

create or replace view public.v_harvest_pull_link as
with h as (
  select
    mh.id, mh.name, mh.harvest_start, mh.wet_weight, mh.waste_weight, mh.package_count,
    substring(mh.name from '(\d{8})')                                   as name_date_token,
    'F' || substring(regexp_replace(mh.name,'^.*\d{8}','') from '[fF] ?([1-4])') as room_actual,
    (mh.name ~* '(^|[^a-z])FF([^a-z]|$)')                               as is_fresh_frozen
  from metrc_harvests mh
)
select
  h.id                    as harvest_id,
  h.name                  as harvest_name,
  h.harvest_start         as takedown_date,
  h.room_actual,
  p.flower_room           as room_planned,
  h.is_fresh_frozen,
  p.pull_no,
  p.harvest_date          as pull_planned_date,
  (h.harvest_start - p.harvest_date) as days_from_planned_pull,
  p.planned_plants,
  p.projected_flower_after_ff_lb,
  h.wet_weight,
  h.package_count,
  /* Rule A3 - absence is explained, never blank. Every harvest says why it is or is not
     attached to a pull, and no harvest is silently dropped. */
  case
    when p.pull_no is not null and h.room_actual is null
      then 'Linked on date. Room unknown - the name carries no room, which is true of all 2024 harvests, before the naming convention existed.'
    when p.pull_no is not null and h.room_actual is distinct from p.flower_room
      then 'Linked on date. ROOM DRIFTED - the plan expected ' || p.flower_room || ', the harvest name says ' || h.room_actual || '. The rotation has moved; the date is what actually happened.'
    when p.pull_no is not null
      then 'Linked on date, and the room agrees with the plan.'
    when h.harvest_start < date '2026-01-01'
      then 'Not linked - harvest_plan_2026 covers 2026 only. This harvest predates the plan and no pull exists to attach it to.'
    when h.harvest_start > (select max(harvest_date) from harvest_plan_2026)
      then 'Not linked - takedown is after the last planned pull of 2026.'
    else 'NOT LINKED - no planned pull within 7 days. Investigate: either a pull happened off-calendar, or the takedown date is wrong.'
  end as link_note,
  /* The name also carries a date. Where it disagrees with Metrc's own harvest_start,
     harvest_start wins - it is the state record - but the disagreement is reported, not
     hidden. One 2025 name carries a seven-digit date and cannot be read at all. */
  case
    when h.name_date_token is null then 'Name carries no readable 8-digit date'
    when to_date(h.name_date_token,'YYYYMMDD') <> h.harvest_start
      then 'Name says ' || h.name_date_token || ', Metrc says ' || h.harvest_start || ' - Metrc wins'
    else null
  end as name_date_disagreement
from h
left join lateral (
  select p2.* from harvest_plan_2026 p2
  where abs(h.harvest_start - p2.harvest_date) <= 7
  order by abs(h.harvest_start - p2.harvest_date), p2.pull_no
  limit 1
) p on true;

comment on view public.v_harvest_pull_link is
  'T3, 8 Aug 2026. One row per Metrc harvest, attached to the planned pull it belongs to. '
  'Joined on DATE within 7 days, never on room: only 16 of 95 harvests in 2026 are in the '
  'room the plan expected, so room-matching lands on the wrong cycle. The room is reported '
  'and its drift flagged. is_fresh_frozen comes from the FF suffix in the harvest name and '
  'MUST be respected - fresh frozen is packaged wet (rule B3).';;
