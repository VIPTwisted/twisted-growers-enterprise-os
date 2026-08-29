-- v_plant_mirror_balance: stop calling a harvested-and-replanted room an emergency.
--
-- Implements OPTION (b) of docs/tickets/PLANT_MIRROR_PHASE.md (merged on main at
-- 1a8481a). Not option (a).
--
-- THE DEFECT
-- The view compares Metrc's plants-by-room report against our live plant mirror.
-- Both sides were flowering-only, and the two sides are not the same instant:
--   report  = Inventory Point in Time export, as-of 2026-08-06
--   mirror  = live metrc_plants, as of now
-- A room cut inside that window does not become empty, it becomes VEGETATIVE. The
-- flowering-only mirror side then reads 0 and the view emitted:
--   "THE MIRROR HOLDS NONE OF THIS ROOM ... escalated as an operational emergency"
-- against a perfectly healthy room. Measured 29 Aug 2026: Flower Room #4 report
-- 1,050 Flowering as-of 6 Aug, mirror 1,050 VEGETATIVE today, harvested 10-11 Aug
-- (4 batches, 907 plants), replanted 4-17 Aug. Nothing was missing.
-- Left alone this fires on every room after every harvest, once per 56-day cycle,
-- which trains the reader to ignore the one time it is real.
--
-- WHAT OPTION (b) DOES
-- Keep the flowering comparison. Detect whether a harvest for that room sits
-- between report_as_of and today. If one does, the two sides are measuring
-- different populations and the view says so: verdict NOT COMPARABLE, naming the
-- batches. It does not guess, does not net, and does not raise an emergency.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--  * It does NOT widen flowering into vegetative for the flower rooms. That would
--    net Flower Room #4 to zero by coincidence and would hide a genuine flowering
--    shortfall behind a vegetative surplus. FR4 still shows report 1,050 /
--    mirror 0 / gap -1,050 as plain numbers; only the VERDICT changes.
--  * It does NOT touch the 143 open on the ticket (1,050 flowering reported on
--    6 Aug vs 907 on the harvest batches). That stays open there and is not
--    absorbed here.
--  * It invents no plants anywhere.
--
-- ROOMS OUTSIDE THE FLOWER ROOMS - AN INTERPRETATION, FLAG IT IF WRONG
-- The owner asked that Mother Room -3 stay "a number on the page, not invented to
-- 33". A flowering-only, Flower-Room-only view cannot show it at all: Mother Room
-- is vegetative. So the scope now also emits any OTHER cultivation room the report
-- holds, at that room's own reported phase, as its own row. Mother Room therefore
-- appears as Vegetative, report 33, mirror 30, gap -3, MIRROR SHORT.
-- This is NOT the prohibited widening: no flower room gains a vegetative row, so
-- FR4 cannot net to zero. If the intent was to leave the view flower-rooms-only
-- and keep Mother Room on the ticket alone, drop the second leg of `scope`.
--
-- KEPT EXACTLY: report_as_of, report_age_days, staleness_note, and the original
-- verdict wording for rooms that ARE comparable - including the emergency text,
-- which is correct when a room is genuinely unsynced and no harvest explains it.
-- Column names, order and types are unchanged; four columns are appended.
--
-- Licence fencing is unchanged: company_licenses kind='cultivation', on both
-- sides, with the literal fallback so the view can never silently empty itself.
-- Room name mapping comes from cult_cycle_policy (mirror_room_name <->
-- metrc_room_code), not from a CASE buried in the view.
--
-- MEASURED ON PRODUCTION BEFORE WRITING (read-only, nothing applied):
--   Flower Room #1  Flowering  1140 / 1140  gap 0      BALANCED
--   Flower Room #2  Flowering  1050 / 1050  gap 0      BALANCED
--   Flower Room #3  Flowering  1140 / 1140  gap 0      BALANCED
--   Flower Room #4  Flowering  1050 /    0  gap -1050  NOT COMPARABLE (5 batches)
--   Mother Room     Vegetative   33 /   30  gap -3     MIRROR SHORT
-- Note metrc_rpt_point_in_time.licence is now licence_number on main.

create or replace view v_plant_mirror_balance as
with rpt_day as (
  select max(as_of_date) as d from metrc_rpt_point_in_time
),
cult as (
  select coalesce(
           array_agg(upper(btrim(license))) filter (where active and kind = 'cultivation'),
           array['MC281714']) as lic
    from company_licenses
),
-- One row per (room, phase) this view is willing to speak about.
-- Leg 1: the flower rooms, flowering only - the original scope, unchanged.
-- Leg 2: every other cultivation room the report holds, at its own phase, so a
--        real difference like Mother Room -3 is a number on the page and not
--        silently outside the frame. No flower room gets a vegetative row.
scope as (
  select p.mirror_room_name as room,
         'Flowering'::text  as phase,
         p.metrc_room_code  as metrc_room_code,
         p.sort_order       as sort_order
    from cult_cycle_policy p
   where p.active
  union all
  select r.location, r.status_current, null::text, 100
    from metrc_rpt_point_in_time r, rpt_day, cult
   where r.as_of_date = rpt_day.d
     and r.record_type = 'Plant'
     and upper(btrim(r.licence_number)) = any (cult.lic)
     and not exists (select 1 from cult_cycle_policy p2
                      where p2.active and p2.mirror_room_name = r.location)
   group by 1, 2, 3, 4
),
rpt as (
  select r.location as room, r.status_current as phase, count(*) as n
    from metrc_rpt_point_in_time r, rpt_day, cult
   where r.as_of_date = rpt_day.d
     and r.record_type = 'Plant'
     and upper(btrim(r.licence_number)) = any (cult.lic)
   group by 1, 2
),
mir as (
  select coalesce(mp.raw ->> 'LocationName', '(no location on the record)') as room,
         initcap(mp.source_state) as phase,
         count(*) as n,
         max(mp.synced_at) as last_synced
    from metrc_plants mp, cult
   where mp.source_state in ('flowering', 'vegetative')
     and upper(btrim(mp.license)) = any (cult.lic)
   group by 1, 2
),
-- A harvest's ROOM comes from its own plants first, the name parse second.
-- metrc_harvests.flower_room is derived from the harvest NAME, and a name can
-- lose the room digit: "TG Jet Fuel Gelato - 20260810 f" ends " f" where its four
-- siblings end " f4", so its flower_room is NULL and every room-scoped query
-- silently dropped a real 143-plant F4 harvest. The plants on a harvest carry
-- LocationName themselves and cannot be defeated by a typo, so they lead.
-- Estate-wide 9 of 385 harvests have flower_room NULL. See
-- docs/tickets/F4_143_TAGS.md.
hroom as (
  select h.metrc_id,
         h.name,
         h.harvest_start,
         h.license,
         coalesce(
           (select mode() within group (order by pl.raw ->> 'LocationName')
              from metrc_plants pl
             where pl.raw ->> 'HarvestId' = h.metrc_id::text
               and nullif(pl.raw ->> 'LocationName', '') is not null),
           (select p.mirror_room_name
              from cult_cycle_policy p
             where p.active and p.metrc_room_code = h.flower_room)
         ) as room
    from metrc_harvests h
),
-- The whole point of option (b): did this room get cut between the report and now?
hv as (
  select s.room,
         count(*) as n,
         string_agg(hr.name || ' [' || hr.metrc_id || ']', '; ' order by hr.harvest_start, hr.name) as batches,
         min(hr.harvest_start) as first_cut,
         max(hr.harvest_start) as last_cut
    from scope s
    join hroom hr on hr.room = s.room,
         rpt_day, cult
   where upper(btrim(hr.license)) = any (cult.lic)
     and hr.harvest_start >  rpt_day.d
     and hr.harvest_start <= current_date
   group by s.room
)
select s.room,
       coalesce(r.n, 0::bigint) as metrc_report_plants,
       coalesce(m.n, 0::bigint) as our_mirror_plants,
       coalesce(m.n, 0::bigint) - coalesce(r.n, 0::bigint) as gap,
       (select rpt_day.d from rpt_day) as report_as_of,
       current_date - (select rpt_day.d from rpt_day) as report_age_days,
       m.last_synced,
       case
         -- A harvest sits between the two sides. They are measuring different
         -- populations, so no gap statement is honest. Say that, name the cut.
         when hv.n is not null
           then 'NOT COMPARABLE. ' || s.room || ' was cut between the report date ('
                || (select rpt_day.d from rpt_day) || ') and today: ' || hv.n
                || ' harvest batch(es) - ' || hv.batches
                || '. The report counts the crop that was standing before the cut; the mirror '
                || 'counts what is standing now. A room that has been harvested and replanted '
                || 'holds vegetative plants, which this flowering comparison does not see. '
                || 'This is NOT a sync gap and NOT an emergency. Compare again once a report '
                || 'dated after ' || hv.last_cut || ' is loaded.'
         when coalesce(m.n,0::bigint) = coalesce(r.n,0::bigint) then 'BALANCED'
         when coalesce(m.n,0::bigint) = 0
           then ('THE MIRROR HOLDS NONE OF THIS ROOM. Metrc reports ' || r.n)
                || ' plants standing here. Do NOT read this room as empty - read it as unsynced. '
                || 'No harvest for this room sits between the report and today, so a takedown '
                || 'does not explain it. This exact state was escalated as an operational '
                || 'emergency on 13 Aug 2026 and the room was full.'
         when coalesce(m.n,0::bigint) < coalesce(r.n,0::bigint)
           then ('MIRROR SHORT by ' || (r.n - m.n))
                || ' plants. The sync has not fetched them; they are not missing from the facility.'
         else ('MIRROR OVER by ' || (m.n - r.n))
              || ' plants - the mirror holds plants the report does not. Either the report is '
              || 'older than a takedown, or a tag was not retired.'
       end as verdict,
       case
         when (current_date - (select rpt_day.d from rpt_day)) > 2
           then 'The report side is ' || (current_date - (select rpt_day.d from rpt_day))
                || ' days old, so a small gap may simply be movement since. A gap the size of a '
                || 'whole room is not.'
         else null
       end as staleness_note,
       -- Appended, so create-or-replace stays valid and no dependent breaks.
       s.phase                                   as phase,
       (hv.n is null)                            as comparable,
       coalesce(hv.n, 0)                         as harvests_since_report,
       hv.batches                                as harvest_batches
  from scope s
  left join rpt r  on r.room = s.room and r.phase = s.phase
  left join mir m  on m.room = s.room and m.phase = s.phase
  left join hv     on hv.room = s.room
 order by s.sort_order, s.room;

comment on view v_plant_mirror_balance is
  'Per-room balance of Metrc''s plants-by-room report against our live plant '
  'mirror. The two sides are different instants: the report is an as-of export, '
  'the mirror is now. When a harvest for the room sits between them the verdict is '
  'NOT COMPARABLE and the batches are named - a cut room becomes vegetative, not '
  'empty, and calling that an emergency once per cycle would train people to '
  'ignore the real one. Flowering only for the flower rooms, deliberately: '
  'widening to vegetative would net a harvested room to zero and hide a genuine '
  'shortfall behind a replant. Other cultivation rooms appear at their own phase '
  'so a real difference is on the page. Both sides fenced to company_licenses '
  'kind=cultivation. report_as_of and report_age_days state the export date on '
  'every row.';

grant select on v_plant_mirror_balance to authenticated;
