/* THE PLAN-MATCH FLOOR HAD THREE DEFINITIONS BY LUNCHTIME.
 *
 * I spent this morning collapsing three parses of "which flower room" and three
 * rules for "when did the room come down" into one each. Then I introduced a new
 * primitive - the per-room floor at which a takedown may claim a room's first
 * ordinal slot - and wrote it out THREE TIMES within two hours:
 *
 *     room_floor  inside v_schedule_compliance
 *     room_floor  inside v_harvest_plan_vs_actual
 *     plan_floor  inside Agent W's harvest.ordinal_match_in_step assertion
 *
 * Agent V found it. W had corrected the literal-year trap properly across all five
 * harvest.* assertions - is_material filtered, fixtures still proving both halves -
 * but W RESTATED the formula rather than deriving it, and DBI-115 then changed the
 * formula underneath. W's copy is the old DBI-114 floor: facility-wide, keyed on
 * early_allowance_days.
 *
 *     room   view floor    watchdog floor
 *     F1     2026-02-05    2026-01-09
 *     F2     2026-02-20    2026-01-09
 *     F3     2026-01-09    2026-01-09
 *     F4     2026-01-23    2026-01-09
 *
 * The takedown counts agree, so the assertion passes - BY COINCIDENCE, because no
 * material takedown happens to fall in the gap. And it now fails in both directions:
 * raise plan_match_floor_days and the view drops to 154 while the watchdog stays
 * silent; raise early_allowance_days and the watchdog fires on F1 at 55 days while
 * the view does not move at all. A guard that agrees with the thing it guards for
 * reasons unrelated to either is not a guard.
 *
 * WHAT THIS IS REALLY ABOUT. The lesson of the morning was "count the definitions of
 * a primitive; more than one is the defect". I then created a primitive and, in the
 * act of fixing it twice, made three copies - the second and third written by me and
 * by the agent building the check for exactly this failure class. Copying the formula
 * a fourth time under the new name would work until the next migration.
 *
 * So the floor is exposed ONCE, as a view, and every consumer joins it. It also
 * publishes first_planned_pull and floor_days separately, so a reader can see WHY a
 * room's floor is where it is without re-deriving anything.
 */

create or replace view public.v_plan_room_floor as
select p.flower_room,
       min(p.harvest_date)                                                        as first_planned_pull,
       coalesce((select threshold from public.harvest_alert_rules
                  where rule_key = 'plan_match_floor_days' and active), 3)::int   as floor_days,
       min(p.harvest_date)
         - coalesce((select threshold from public.harvest_alert_rules
                      where rule_key = 'plan_match_floor_days' and active), 3)::int as floor_date
  from public.harvest_pulls p
 where p.flower_room is not null
 group by p.flower_room;

comment on view public.v_plan_room_floor is
  'THE one definition of how far before a room''s own first planned pull a takedown may sit and still claim that room''s first ordinal slot. Every consumer joins this - v_schedule_compliance, v_harvest_plan_vs_actual and the harvest.* watchdog assertions - so a change to plan_match_floor_days moves the surfaces and the guards together. It was written out three separate times on 13 Aug 2026, twice by me, in the same day whose whole lesson was to count the definitions of a primitive. Measured that day: the headline is stable for floor_days 0 through 54, F1 binding.';

create or replace view public.v_schedule_compliance as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), td as (
  select t.flower_room, t.takedown_start, t.takedown_end, t.takedown_days,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
    from public.v_harvest_takedown t
    join public.v_plan_room_floor f on f.flower_room = t.flower_room
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

create or replace view public.v_harvest_plan_vs_actual as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), td as (
  select t.flower_room, t.takedown_start, t.takedown_end,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
    from public.v_harvest_takedown t
    join public.v_plan_room_floor f on f.flower_room = t.flower_room
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
 order by m.harvest_date desc;

insert into public.db_change_review
  (change_ref, domain, proposed_by, what_changes, why, rollback, reviewer)
select v.change_ref, 'inventory & seed-to-sale', 'Agent I', v.what_changes, v.why, v.rollback, r.reviewer
  from (values
    ('DBI-115', 'Per-room ordinal floor on both plan-versus-actual surfaces, plan_match_floor_days as its own key, flower_room and drying_location appended to v_schedule_compliance, fresh-frozen history corrected',
     'DBI-114 gave early_allowance_days - a verdict tolerance - a second job selecting rows. Swept 0..30 live: stable at 210 from 0 to 13, then 14 publishes 150 with four pulls flipped LATE to EARLY, 28 publishes 94 with eight. The floor was facility-wide while the ordinal is per room, so one floor anchored to F3''s 12 Jan pull was applied to F2 whose plan starts 23 Feb. Per room and on its own key, the headline is stable 0 through 54 with F1 binding.',
     'Restore both views by create-or-replace from git at the commit before 20260813141714, and delete the plan_match_floor_days rule row. The two appended columns cannot be taken off by create or replace and would need the views rebuilt.'),
    ('DBI-116', 'v_plan_room_floor - one definition of the plan-match floor, joined by both surfaces and by the harvest.* watchdog assertions',
     'Found by Agent V. The per-room floor was written out three times within two hours - twice by me, once restated rather than derived inside Agent W''s harvest.ordinal_match_in_step. W''s copy is the superseded DBI-114 formula, so the guard and the surface now disagree in both directions: raise plan_match_floor_days and the view falls to 154 while the watchdog stays silent; raise early_allowance_days and the watchdog fires on F1 while the view does not move. The counts agree today only because no material takedown falls in the gap. A guard that agrees with what it guards for unrelated reasons is not a guard.',
     'Restore both views by create-or-replace from git at the commit before this one, then retire v_plan_room_floor under the E1 escape since nothing else would read it. The watchdog assertion is Agent W''s to repoint and is not reverted by this.')
  ) as v(change_ref, what_changes, why, rollback)
  cross join (values ('Agent V'), ('Agent W'), ('Agent X')) as r(reviewer)
 where not exists (select 1 from public.db_change_review d
                    where d.change_ref = v.change_ref and d.reviewer = r.reviewer);;
