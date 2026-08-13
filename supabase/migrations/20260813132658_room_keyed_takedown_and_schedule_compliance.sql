/* ROOM-KEYED HARVEST TAKEDOWN, AND THE SCHEDULE COMPLIANCE VIEW REBUILT ON IT.
 *
 * WHAT WAS WRONG. v_schedule_compliance matched a scheduled pull to a real harvest
 * like this:
 *
 *     select min(h.harvest_start) from metrc_harvests h
 *      where coalesce(h.raw->>'DryingLocationName','') <> ''
 *        and h.harvest_start between p.harvest_date - 5 and p.harvest_date + 21
 *
 * There is no room in that predicate. Four flower rooms rotate on a ~13-day
 * facility cadence, so a 27-day window around any scheduled pull contains one or
 * two OTHER rooms' takedowns - and min() takes the earliest of them. The error
 * therefore runs in the LENIENT direction every single time: it reports the
 * nearest room that DID come down, in place of the room that did not.
 *
 * Measured 13 Aug 2026, against the 15 pulls scheduled on or before today:
 *
 *     published (no room)   43 days late over 7 pulls
 *     room-keyed           210 days late over 13 pulls, plus 52 still accruing
 *
 * Five pulls were published as EARLY that are 18 to 26 days LATE. Under the
 * owner's rule early needs no explanation, so the view was waving through its own
 * worst violations. Pull 14 (F4, scheduled 13 Jul) read "3 days early"; F4 has not
 * come down since 8 Jun and is 31 days overdue with no harvest at all - which the
 * old +21 ceiling could not represent even in principle.
 *
 * The last date on which the old view was correct is 8 Feb 2026.
 *
 * THE SECOND DEFECT, WHICH IS THE REAL ONE. "Which flower room did this harvest
 * come from" had THREE definitions in the database and "when did the room actually
 * come down" had THREE MORE:
 *
 *     v_harvest_report      substring(regexp_replace(upper(name),'\s','','g'),'F[1-4]')
 *     v_harvest_pull_link   'F' || substring(regexp_replace(name,'^.*\d{8}',''),'[fF] ?([1-4])')
 *     v_schedule_compliance (none - the defect above)
 *
 *     v_schedule_compliance   min() in a -5/+21 window, no room
 *     v_harvest_plan_vs_actual join on a -4/+10 window, grouped by DryingLocationName
 *                              - which is the DRY room, not the flower room
 *     v_harvest_pull_link      nearest date within +/-7, room reported as a note only
 *
 * That is the countable test the owner set: more than one definition of a
 * primitive IS the defect. This migration collapses both to one.
 *
 * WHICH PARSE SURVIVED, AND WHY NOT A NEW ONE. All three parses were run against
 * all 305 harvests. They agree on 304. The single disagreement is
 * "TG Blueberry Muffin #4 - 2025102 F2 FF" - a seven-digit date typo - where
 * v_harvest_pull_link's parse still resolves F2 and a stricter one does not. So the
 * best definition already existed in production and is PROMOTED here rather than
 * replaced. A fourth parse would have been the same mistake again.
 *
 * WHY DryingLocationName IS NOT THE ROOM. It holds Cure Vault, Dry Room #2,
 * Pre Trim Storage Room, Freezer/Biomass Storage, Fulfillment Vault. Those are
 * post-harvest locations. The flower room is carried only in the harvest NAME,
 * after the date token: "TG Blue Dream - 20260727 F3".
 *
 * WHY A TAKEDOWN IS A CLUSTER AND NOT A DATE. A room comes down over two to four
 * days, and since June 2026 the fresh-frozen batch is cut three days ahead of the
 * dried batch. Six Metrc harvest rows across four dates are ONE takedown. Rows are
 * therefore grouped per room whenever consecutive dates are within
 * takedown_cluster_gap_days. A room cycle is 56 days at plan and 64.4 observed, so
 * no gap this small can ever fuse two genuine takedowns.
 *
 * WHY THE MATCH IS ORDINAL AND NOT A WINDOW. Any date window is guessing. Within
 * one room the plan is a sequence and reality is a sequence, so the nth planned
 * pull of a room is the nth takedown of that room. This is the only rule that can
 * represent a room that is 31 days overdue, because the nth takedown simply does
 * not exist yet - there is no window to fall outside of.
 *
 * WHICH DATE COUNTS AS THE TAKEDOWN. The START of the cluster, compared against the
 * scheduled date. This is the reading most generous to the crew: it credits them
 * from the first plant cut, not the last. It still produces 210 days.
 *
 * THE TOLERANCES ARE NOT HARDCODED HERE. The old view compared against a literal
 * +2/-2. The owner's rule is asymmetric - "HARVEST CAN BE TAKEN DOWN FEW DAYS EARLY
 * BUT NOT LATE" - and harvest_alert_rules already held it as
 * early_allowance_days = 3 and late_tolerance_days = 0. The literals were a fourth
 * duplicate definition and are now read from the table, which also means this view
 * finally enforces zero late tolerance rather than the two days it was granting.
 *
 * NOTHING IS DROPPED AND NOTHING IS REORDERED. v_schedule_compliance keeps all
 * thirteen existing columns, in order, at their existing types; the six new ones
 * are appended. create or replace view cannot do otherwise.
 *
 * NOT FIXED HERE, AND NAMED SO IT IS NOT LOST. The Dry half of this view sets
 * actual_date to harvest_start + dry_max_days, which is the deadline wearing an
 * actual's name - drying is NOT MEASURED. It is left byte-identical rather than
 * half-corrected in a migration about pulls. Tracked separately.
 */

-- ---------------------------------------------------------------------------
-- 1. ONE definition of the flower room a harvest came from.
-- ---------------------------------------------------------------------------

create or replace function public.f_flower_room_from_harvest_name(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  /* Promoted verbatim from v_harvest_pull_link, which had it right.
     Strip everything through the last 8-digit date token, then take the first
     F<1-4> in the tail. This is what makes "20260727f3", " aF3", " FF F4",
     " F3 1 FF" and " F4-FF" all resolve, and what makes a strain name containing
     a digit after an F unable to win, because it sits before the date. */
  select 'F' || substring(regexp_replace(p_name, '^.*\d{8}', ''), '[fF] ?([1-4])')
$$;

comment on function public.f_flower_room_from_harvest_name(text) is
  'The single definition of which flower room a Metrc harvest came from. Metrc has no field for it; it lives in the harvest name after the date token. Returns null for the nine 2024 harvests recorded before the naming convention existed - which is honest, not a gap to paper over.';

alter table public.metrc_harvests
  add column if not exists flower_room text
  generated always as (public.f_flower_room_from_harvest_name(name)) stored;

comment on column public.metrc_harvests.flower_room is
  'Derived, never synced. Metrc does not carry the flower room; this is parsed from the harvest name by f_flower_room_from_harvest_name. Adding it alters no Metrc fact - the legal record stays read-only.';

create index if not exists metrc_harvests_flower_room_start_idx
  on public.metrc_harvests (flower_room, harvest_start);

-- ---------------------------------------------------------------------------
-- 2. The clustering gap, as a rule and not a literal.
-- ---------------------------------------------------------------------------

insert into public.harvest_alert_rules (rule_key, label, threshold, unit, severity, active, note)
select 'takedown_cluster_gap_days',
       'Takedown grouping window',
       7,
       'days',
       'watch',
       true,
       'Metrc harvest rows for one room within this many days of each other are ONE takedown. A room comes down over 2-4 days and the fresh-frozen cut runs 3 days ahead of the dried cut. A room cycle is 56 days at plan and 64.4 observed, so no value near this can fuse two real takedowns.'
 where not exists (select 1 from public.harvest_alert_rules
                    where rule_key = 'takedown_cluster_gap_days');

-- ---------------------------------------------------------------------------
-- 3. ONE definition of a takedown event.
-- ---------------------------------------------------------------------------

create or replace view public.v_harvest_takedown as
with gap as (
  select coalesce((select threshold from public.harvest_alert_rules
                    where rule_key = 'takedown_cluster_gap_days' and active), 7)::int as d
), dates as (
  select distinct flower_room, harvest_start
    from public.metrc_harvests
   where flower_room is not null
     and harvest_start is not null
), edges as (
  select d.flower_room, d.harvest_start,
         case when d.harvest_start
                 - lag(d.harvest_start) over (partition by d.flower_room order by d.harvest_start)
                 <= (select d from gap)
              then 0 else 1 end as is_new_event
    from dates d
), grouped as (
  select flower_room, harvest_start,
         sum(is_new_event) over (partition by flower_room order by harvest_start) as event_no
    from edges
), ev as (
  select flower_room,
         min(harvest_start) as takedown_start,
         max(harvest_start) as takedown_end
    from grouped
   group by flower_room, event_no
)
select ev.flower_room,
       row_number() over (partition by ev.flower_room order by ev.takedown_start) as takedown_seq_all_time,
       ev.takedown_start,
       ev.takedown_end,
       (ev.takedown_end - ev.takedown_start) + 1                                  as takedown_days,
       count(h.id)                                                                as harvest_records,
       count(h.id) filter (where h.name ~* '(^|[^a-z])FF([^a-z]|$)')              as fresh_frozen_records,
       round(sum(coalesce(h.wet_weight, 0)) / 453.592, 1)                         as wet_lb,
       string_agg(distinct h.name, ', ' order by h.name)                          as harvests
  from ev
  join public.metrc_harvests h
    on h.flower_room = ev.flower_room
   and h.harvest_start between ev.takedown_start and ev.takedown_end
 group by ev.flower_room, ev.takedown_start, ev.takedown_end;

comment on view public.v_harvest_takedown is
  'One row per room takedown. A room comes down over two to four days and the fresh-frozen cut runs three days ahead of the dried cut, so several Metrc harvest rows across several dates are ONE event. Rows are grouped per room while consecutive dates stay within takedown_cluster_gap_days; a room cycle is 56 days at plan and 64.4 observed, so this can never fuse two real takedowns.';

-- ---------------------------------------------------------------------------
-- 4. v_schedule_compliance, rebuilt on the room.
-- ---------------------------------------------------------------------------

create or replace view public.v_schedule_compliance as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), td as (
  select flower_room, takedown_start, takedown_end, takedown_days,
         row_number() over (partition by flower_room order by takedown_start) as seq_2026
    from public.v_harvest_takedown
   where takedown_start >= date '2026-01-01'
), pn as (
  select p.pull_no,
         p.harvest_date,
         p.flower_room,
         p.cultivars,
         p.original_total_plants,
         p.proj_harvest_weight_lbs,
         p.facility_days_since_last_pull,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_2026
    from public.harvest_pulls p
), pulls as (
  select pn.*,
         td.takedown_start as actual_date,
         td.takedown_end,
         td.takedown_days,
         (select threshold from r where rule_key = 'early_allowance_days')::int as early_ok,
         (select threshold from r where rule_key = 'late_tolerance_days')::int  as late_ok
    from pn
    left join td
      on td.flower_room = pn.flower_room
     and td.seq_2026    = pn.seq_2026
)
select 'Pull'::text                                                       as event_type,
       pl.pull_no,
       pl.flower_room                                                     as room,
       pl.cultivars,
       pl.harvest_date                                                    as scheduled_date,
       pl.actual_date,
       /* Signed, as before: positive is late, negative is early. A pull whose room
          has not come down and whose date has passed counts from today and keeps
          counting, which is the only way an open-ended overdue can be true. */
       (case when pl.actual_date is not null then pl.actual_date - pl.harvest_date
             when pl.harvest_date < current_date then current_date - pl.harvest_date
        end)::int                                                         as days_off_schedule,
       case
         when pl.actual_date is null and pl.harvest_date >= current_date
           then 'Scheduled'
         when pl.actual_date is null
           then 'NOT HARVESTED - ' || (current_date - pl.harvest_date)
                || ' days past schedule, room ' || pl.flower_room || ' still standing'
         when pl.actual_date - pl.harvest_date > pl.late_ok
           then 'LATE by ' || (pl.actual_date - pl.harvest_date) || ' days'
         when pl.harvest_date - pl.actual_date > pl.early_ok
           then 'Early by ' || (pl.harvest_date - pl.actual_date) || ' days'
         else 'On schedule'
       end                                                                as compliance,
       pl.original_total_plants                                           as planned_plants,
       round(coalesce(pl.proj_harvest_weight_lbs, 0), 1)                  as planned_lbs,
       pl.facility_days_since_last_pull                                   as planned_gap_days,
       null::text                                                         as room_now,
       null::numeric                                                      as days_in_dry,
       /* --- appended 13 Aug 2026; everything above keeps its position and type --- */
       pl.takedown_end,
       pl.takedown_days::int                                              as takedown_days,
       case when pl.actual_date is not null
            then 'room ' || pl.flower_room || ', takedown ' || pl.seq_2026 || ' of 2026'
            else 'no takedown yet for room ' || pl.flower_room end        as matched_by,
       greatest(coalesce(pl.actual_date, current_date) - pl.harvest_date, 0)::int as days_late,
       greatest(pl.harvest_date - coalesce(pl.actual_date, pl.harvest_date), 0)::int as days_early,
       case
         when pl.actual_date is null and pl.harvest_date < current_date
           then 'Open-ended. No takedown exists for this pull, so lateness is measured from today and grows daily.'
         when pl.actual_date is not null and pl.takedown_days > 1
           then 'Takedown ran ' || pl.takedown_days || ' days; measured from the first cut, which is the reading most generous to the crew.'
       end                                                                as match_note
  from pulls pl
union all
select 'Dry'::text,
       null::int,
       m.room,
       m.strains,
       m.harvest_start,
       m.harvest_start + ((select threshold from r where rule_key = 'dry_max_days'))::int,
       case when m.stage like 'Drying%'
             and m.days_since_takedown > (select threshold from r where rule_key = 'dry_max_days')
            then (m.days_since_takedown - (select threshold from r where rule_key = 'dry_max_days'))::int
       end,
       case
         when m.stage not like 'Drying%' and m.stage <> 'Curing / Trim' then 'Dry complete'
         when m.days_since_takedown > (select threshold from r where rule_key = 'dry_max_days')
           then 'DRY DEADLINE BLOWN by '
                || (m.days_since_takedown - (select threshold from r where rule_key = 'dry_max_days'))::int
                || ' days'
         when m.days_since_takedown >= (select threshold from r where rule_key = 'dry_target_days')
           then 'At dry target - finish now'
         else 'On schedule'
       end,
       m.plants,
       round(coalesce(m.wet_weight, 0) / 453.592, 1),
       null::numeric,
       m.room,
       m.days_since_takedown,
       null::date,
       null::int,
       /* Named, not silently carried: this half compares a deadline to itself. */
       'NOT MEASURED - actual_date on a Dry row is harvest_start + dry_max_days, which is the deadline, not an observation'::text,
       null::int,
       null::int,
       'Drying has no measured completion date in Metrc. Any lateness shown here is derived from the deadline, not from an event.'::text
  from public.v_harvest_stage_map m
 where m.stage <> all (array['Finished', 'Archived']);

comment on view public.v_schedule_compliance is
  'Schedule adherence, keyed on the ROOM. Each planned pull is matched to the nth takedown of its own room, never to a date window - a window silently substitutes another room and always in the lenient direction. Late tolerance and early allowance are read from harvest_alert_rules, so the asymmetry the owner set (early acceptable, late never) is enforced from one place. The Dry half remains NOT MEASURED and says so on every row.';
