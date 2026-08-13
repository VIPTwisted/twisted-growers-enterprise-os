/* THE ORDINAL FLOOR GOES PER ROOM, AND STOPS BORROWING A DISPLAY SETTING.
 * Agent X rejected DBI-114 and Agent V marked it needs_work, independently, for the
 * same reason. Full rationale in the repo file of the same version.
 *
 * WHAT I DID WRONG. Closing the "one filtered side, one unfiltered side" hole I gave
 * early_allowance_days - a VERDICT TOLERANCE - a second job SELECTING ROWS. Swept
 * 0..30 against live data: stable at 210 from 0 to 13, then 14 flips four pulls and
 * publishes 150, and 28 publishes 94 with eight pulls early. "Let them pull up to two
 * weeks early" is an ordinary owner instruction and it would have deleted sixty days
 * of lateness with no error, no null and no warning. The hardcoded year I removed was
 * immune to this.
 *
 * ROOT CAUSE: the floor was FACILITY-WIDE and the ordinal is PER ROOM. One floor
 * anchored to F3's 12 Jan pull, applied to F2 whose plan starts 23 Feb. Each room
 * carried an unguarded window equal to the gap between the facility's first pull and
 * its own - F3 3 days, F4 17, F1 30, F2 45 - so F2 broke first. Per room takes the
 * safe range from 0-13 to 0-54, F1 binding with 55 days of clearance.
 *
 * The tolerance also gets its own key. A parameter that selects rows must never be
 * the parameter that formats a verdict.
 *
 * pn NEEDS NO FILTER NOW - and V showed the one I wrote was a tautology that could
 * never exclude a row. Each room's ordinal runs over its own pulls and its takedown
 * floor is anchored to its own first pull, so both sides move together.
 *
 * ROOM GETS AN UNAMBIGUOUS PAIR BESIDE IT. I thought the choice was between
 * documenting the ambiguity and building a replacement view. V found the third
 * option: create or replace cannot rename or reorder but it CAN append. flower_room
 * and drying_location are appended, each null where it does not apply, room stays as
 * the documented supertype. Nothing drops, nothing renames, E1 untouched.
 *
 * FRESH-FROZEN HISTORY CORRECTED. I wrote that the FF lead began June 2026. It first
 * appears 30 Jun 2025 and again 22 Sep 2025 at ONE day, then becomes universal at
 * three days from 5 Jun 2026 - 0 of 16 takedowns in 2024, 2 of 19 in 2025, 4 of 13
 * in 2026. Those four are the only takedowns where the pull date depends on which
 * cut you call the start.
 *
 * NOT FIXED HERE, NAMED: a null PlantCount makes is_material false and drops a real
 * takedown from the match silently - what the view comment claims it prevents. All
 * 372 classified harvests carry a non-zero count today and every takedown is
 * 981-1,140 against a floor of 100, so the margin is wide. It needs an assertion,
 * not a margin. Agent W's lane, raised there. */

insert into public.harvest_alert_rules (rule_key, label, threshold, unit, severity, active, note)
select 'plan_match_floor_days',
       'Takedown match floor before the first planned pull',
       3,
       'days',
       'watch',
       true,
       'THIS PARAMETER SELECTS ROWS. It sets how far before a room''s OWN first planned pull a takedown may sit and still claim that room''s first ordinal slot. It is deliberately NOT early_allowance_days: that one formats a verdict, and a parameter that formats must never also select. Measured 13 Aug 2026 with a per-room floor, the headline is stable from 0 to 54 days; F1 is the binding room with 55 days of clearance. Under the earlier facility-wide floor it inverted at 14. Re-measure before changing it.'
 where not exists (select 1 from public.harvest_alert_rules
                    where rule_key = 'plan_match_floor_days');

create or replace view public.v_schedule_compliance as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), room_floor as (
  /* PER ROOM. A facility-wide floor anchored to the earliest room's first pull and
     applied to every other room is what let a tolerance change reorder F2. */
  select p.flower_room,
         min(p.harvest_date)
           - coalesce((select threshold from r where rule_key = 'plan_match_floor_days'), 3)::int as floor_date
    from public.harvest_pulls p
   group by p.flower_room
), td as (
  select t.flower_room, t.takedown_start, t.takedown_end, t.takedown_days,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
    from public.v_harvest_takedown t
    join room_floor f on f.flower_room = t.flower_room
   where t.is_material
     and t.takedown_start >= f.floor_date
), pn as (
  select p.pull_no,
         p.harvest_date,
         p.flower_room,
         p.cultivars,
         p.original_total_plants,
         p.proj_harvest_weight_lbs,
         p.facility_days_since_last_pull,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
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
     and td.seq_plan    = pn.seq_plan
)
select 'Pull'::text                                                       as event_type,
       pl.pull_no,
       pl.flower_room                                                     as room,
       pl.cultivars,
       pl.harvest_date                                                    as scheduled_date,
       pl.actual_date,
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
       pl.takedown_end,
       pl.takedown_days::int                                              as takedown_days,
       case when pl.actual_date is not null
            then 'room ' || pl.flower_room || ', material takedown ' || pl.seq_plan || ' of the plan era'
            else 'no material takedown yet for room ' || pl.flower_room end as matched_by,
       greatest(coalesce(pl.actual_date, current_date) - pl.harvest_date, 0)::int   as days_late,
       greatest(pl.harvest_date - coalesce(pl.actual_date, pl.harvest_date), 0)::int as days_early,
       case
         when pl.actual_date is null and pl.harvest_date < current_date
           then 'Open-ended. No takedown exists for this pull, so lateness is measured from today and grows daily.'
         when pl.actual_date is not null and pl.takedown_days > 1
           then 'Takedown ran ' || pl.takedown_days || ' days; measured from the first cut. The plan models the pull the same way - day2_replant_date is harvest_date + 1 on all 26 rows - so this is like for like, not leniency.'
       end                                                                as match_note,
       /* --- appended 13 Aug 2026: room is a supertype, these two never are --- */
       pl.flower_room,
       null::text                                                         as drying_location
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
       'NOT MEASURED - actual_date on a Dry row is harvest_start + dry_max_days, which is the deadline, not an observation'::text,
       null::int,
       null::int,
       'Drying has no measured completion date in Metrc. Any lateness shown here is derived from the deadline, not from an event.'::text,
       null::text,
       m.room
  from public.v_harvest_stage_map m
 where m.stage <> all (array['Finished', 'Archived']);

comment on view public.v_schedule_compliance is
  'Schedule adherence, keyed on the ROOM. Each planned pull is matched to the nth MATERIAL takedown of its own room, never to a date window. The takedown floor is PER ROOM - that room''s own first planned pull minus plan_match_floor_days - so both sides of the ordinal move together and no facility-wide anchor can reorder a room whose plan starts later. The room column is the SUPERTYPE and is ambiguous by construction: flower rooms on Pull rows, drying locations on Dry rows. Do not read it where the distinction matters - read flower_room or drying_location, appended for exactly that reason, each null on the rows it does not apply to. Averaging days_late across all rows is wrong; the future pulls contribute 0.';

comment on view public.v_harvest_takedown is
  'One row per room takedown. A room comes down over two to four days and the fresh-frozen cut can run ahead of the dried cut, so several Metrc harvest rows across several dates are ONE event. MEASURED 13 Aug 2026: the FF lead first appears 30 Jun 2025 and again 22 Sep 2025 at ONE day, then becomes universal at THREE days from 5 Jun 2026 - 0 of 16 takedowns in 2024, 2 of 19 in 2025, 4 of 13 in 2026. An earlier version of this comment said the practice began in June 2026; that was wrong, and it matters because those four takedowns are the only ones where the pull date depends on which cut you call the start. is_material is FALSE for scrap and corrective pulls below takedown_min_plants; they stay visible here and are excluded only from the schedule match, because a takedown that vanishes is the failure this view exists to prevent.';

create or replace view public.v_harvest_plan_vs_actual as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), room_floor as (
  select p.flower_room,
         min(p.harvest_date)
           - coalesce((select threshold from r where rule_key = 'plan_match_floor_days'), 3)::int as floor_date
    from public.harvest_pulls p
   group by p.flower_room
), td as (
  select t.flower_room, t.takedown_start, t.takedown_end,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
    from public.v_harvest_takedown t
    join room_floor f on f.flower_room = t.flower_room
   where t.is_material
     and t.takedown_start >= f.floor_date
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room, p.cultivars,
         p.original_total_plants, p.proj_harvest_weight_lbs, p.dry_day_14,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
    from public.harvest_pulls p
), m as (
  select pn.*, td.takedown_start, td.takedown_end
    from pn
    left join td on td.flower_room = pn.flower_room and td.seq_plan = pn.seq_plan
), a as (
  select m.pull_no,
         string_agg(distinct nullif(coalesce(h.raw ->> 'DryingLocationName', ''), ''), ', ') as dry_rooms,
         string_agg(distinct h.name, ', ')                                     as harvests,
         sum((h.raw ->> 'PlantCount')::numeric)                                as actual_plants,
         sum(coalesce((h.raw ->> 'TotalWetWeight')::numeric, 0))               as wet_g,
         sum(coalesce((h.raw ->> 'TotalPackagedWeight')::numeric, 0))          as pkg_g,
         sum(coalesce((h.raw ->> 'TotalWasteWeight')::numeric, 0))             as waste_g
    from m
    join public.metrc_harvests h
      on h.flower_room = m.flower_room
     and h.harvest_start between m.takedown_start and m.takedown_end
   group by m.pull_no
)
select m.pull_no,
       m.harvest_date                                    as planned_date,
       m.flower_room,
       m.cultivars,
       m.original_total_plants                           as planned_plants,
       round(m.proj_harvest_weight_lbs, 1)               as planned_lbs,
       m.takedown_start                                  as actual_date,
       a.dry_rooms                                       as actual_room,
       a.harvests,
       a.actual_plants,
       round(a.wet_g / 453.592, 1)                       as actual_wet_lbs,
       round(a.pkg_g / 453.592, 1)                       as actual_packaged_lbs,
       round(a.waste_g / 453.592, 1)                     as actual_waste_lbs,
       case
         when m.takedown_start is null and m.harvest_date >= current_date
           then 'Scheduled'
         when m.takedown_start is null
           then 'NOT HARVESTED - ' || (current_date - m.harvest_date)
                || ' days past schedule, room ' || m.flower_room || ' still standing'
         when m.takedown_start - m.harvest_date > (select threshold from r where rule_key = 'late_tolerance_days')::int
           then 'Late by ' || (m.takedown_start - m.harvest_date) || ' days'
         when m.harvest_date - m.takedown_start > (select threshold from r where rule_key = 'early_allowance_days')::int
           then 'Early by ' || (m.harvest_date - m.takedown_start) || ' days'
         else 'On plan'
       end                                               as timing,
       case when a.actual_plants is not null and m.original_total_plants > 0
            then round(100.0 * a.actual_plants / m.original_total_plants, 1) end as plants_pct_of_plan,
       case when a.pkg_g > 0 and m.proj_harvest_weight_lbs > 0
            then round(100.0 * (a.pkg_g / 453.592) / m.proj_harvest_weight_lbs, 1) end as weight_pct_of_plan,
       m.dry_day_14                                      as dry_deadline
  from m
  left join a on a.pull_no = m.pull_no
 order by m.harvest_date desc;;
