/* THE PLANT MIRROR MUST BALANCE AGAINST METRC'S OWN REPORT, AND NOTHING CHECKED IT.
 *
 * Owner, 13 Aug 2026: "FIX PLANT LINK THAT SHOULD BALANCE."
 *
 * WHAT WENT WRONG. metrc_plants is fed by the API sync. metrc_rpt_point_in_time is
 * loaded from Metrc's own point-in-time report - a separate path, same legal source.
 * They should agree on how many plants are standing in each room. Measured today:
 *
 *     room               Metrc report   our mirror    gap
 *     Flower Room #1          1,140        1,022      -118
 *     Flower Room #2          1,050            0    -1,050
 *     Flower Room #3          1,140        1,140         0
 *     Flower Room #4          1,050        1,050         0
 *
 * The mirror is short 1,168 tracked plants - 26% of what Metrc holds - and every
 * one of F2's. Nothing compared the two, so the platform showed F2 as an empty room
 * and that was escalated to the owner as an operational emergency: "29 days empty,
 * the longest turnaround on record, walk the room today." The room was full. Metrc's
 * own report refuted it. The alarm came from our own hole.
 *
 * THE CAUSE, WHICH IS IN THE SYNC AND IS FIXED SEPARATELY. runSpec marked a run "ok"
 * if ANY sub-state answered, and the caller then advanced the delta cursor past the
 * whole window. The sub-states that errored were never asked for again - a delta
 * returns what changed SINCE the cursor, and those records changed before it. So the
 * hole could not heal itself, and three "full" runs on 6, 7 and 8 Aug returned ZERO
 * records in under five seconds and were each recorded as a success.
 *
 * WHY A VIEW AND NOT JUST A FIX. The sync will break again - it is a network call to
 * someone else's API on a 15-minute cron. What must not happen again is breaking
 * SILENTLY. This is the balance: two independent paths to the same fact, differenced,
 * with the answer stated in words on every row.
 *
 * IT IS HONEST ABOUT ITS OWN STALENESS. The report clones are imported on their own
 * schedule and were 7 days old when this was written. A gap against a stale report is
 * not the same claim as a gap against a fresh one, so report_age_days is on every row
 * and the verdict says so rather than letting a reader assume.
 */

create or replace view public.v_plant_mirror_balance as
with rpt_day as (
  select max(as_of_date) as d from public.metrc_rpt_point_in_time
), rpt as (
  select p.location as room, count(*) as metrc_report_plants
    from public.metrc_rpt_point_in_time p, rpt_day
   where p.as_of_date = rpt_day.d
     and p.status_current = 'Flowering'
   group by p.location
), mirror as (
  select coalesce(p.raw ->> 'LocationName', '(no location on the record)') as room,
         count(*) as our_mirror_plants,
         max(p.synced_at) as last_synced
    from public.metrc_plants p
   where p.source_state = 'flowering'
   group by 1
)
select coalesce(r.room, m.room)                                   as room,
       coalesce(r.metrc_report_plants, 0)                         as metrc_report_plants,
       coalesce(m.our_mirror_plants, 0)                           as our_mirror_plants,
       coalesce(m.our_mirror_plants, 0) - coalesce(r.metrc_report_plants, 0) as gap,
       (select d from rpt_day)                                    as report_as_of,
       (current_date - (select d from rpt_day))                   as report_age_days,
       m.last_synced,
       case
         when coalesce(m.our_mirror_plants, 0) = coalesce(r.metrc_report_plants, 0)
           then 'BALANCED'
         when coalesce(m.our_mirror_plants, 0) = 0
           then 'THE MIRROR HOLDS NONE OF THIS ROOM. Metrc reports ' || r.metrc_report_plants
                || ' plants standing here. Do NOT read this room as empty - read it as unsynced. '
                || 'This exact state was escalated as an operational emergency on 13 Aug 2026 and the room was full.'
         when coalesce(m.our_mirror_plants, 0) < coalesce(r.metrc_report_plants, 0)
           then 'MIRROR SHORT by ' || (r.metrc_report_plants - m.our_mirror_plants)
                || ' plants. The sync has not fetched them; they are not missing from the facility.'
         else 'MIRROR OVER by ' || (m.our_mirror_plants - r.metrc_report_plants)
                || ' plants - the mirror holds plants the report does not. Either the report is older than a takedown, or a tag was not retired.'
       end                                                        as verdict,
       case
         when (current_date - (select d from rpt_day)) > 2
           then 'The report side is ' || (current_date - (select d from rpt_day))
                || ' days old, so a small gap may simply be movement since. A gap the size of a whole room is not.'
       end                                                        as staleness_note
  from rpt r
  full join mirror m on m.room = r.room
 where coalesce(r.room, m.room) ilike 'Flower Room%';

comment on view public.v_plant_mirror_balance is
  'The balance the owner asked for on 13 Aug 2026: our plant mirror against Metrc''s own point-in-time report, per flower room. Nothing compared these two before, which is how the mirror came to be short 1,168 plants - all of F2 and 118 of F1 - and how an empty-looking room reached the owner as an operational emergency when the room was full. A gap here means the SYNC is short, not that the facility is. Read report_age_days before quoting any gap.';;
