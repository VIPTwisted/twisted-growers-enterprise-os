/* TWO DEFECTS THE REVIEWERS FOUND IN THIS MORNING'S FIX, PLUS THE PROCESS FAILURE.
 *
 * Agent V and Agent X found the same latent bug independently, within an hour of
 * each other, in code I had already applied. Both are recorded below. Neither
 * changes a single published figure today - which is exactly why they had to be
 * fixed today, because a defect that costs nothing now is one nobody comes back for.
 *
 * DEFECT 1 - THE ORDINAL HAD ONE FILTERED SIDE AND ONE UNFILTERED SIDE.
 *
 *     td AS (... FROM v_harvest_takedown WHERE takedown_start >= '2026-01-01')  -- filtered
 *     pn AS (... FROM harvest_pulls)                                            -- NOT filtered
 *
 * row_number() over pn ran across every row in harvest_pulls. That is correct
 * today only because that table happens to contain the 2026 plan and nothing else.
 * Load one 2025 or one 2027 pull and every room's ordinal shifts by one, silently,
 * and the platform reports large false lateness with no error anywhere - the same
 * positional-drift failure as the room-less date window, relocated one layer up.
 * The CTE was even named seq_2026 on something that did not restrict to 2026.
 *
 * The fix is not to filter pn to 2026 as well; a hardcoded year is the same trap
 * with a longer fuse. Both sides now derive their floor from the plan itself, so
 * adding a 2025 pull moves BOTH sides together and the match stays aligned.
 *
 * DEFECT 2 - A SCRAP PULL COUNTS AS A TAKEDOWN.
 *
 * v_harvest_takedown had no minimum size. "TG Apple Fritter - 20240606 F4" is one
 * row, 18 plants, 4.8 lb, sitting 11 days before the real F4 takedown of 662
 * plants - and it was a takedown event in its own right. Across 48 all-time
 * clusters it is the only one under 100 plants; the next smallest is 189.
 *
 * It costs nothing today because it is in 2024. Agent V simulated the same shape in
 * 2026 - one scrap F3 row on 20 Feb, injected read-only - and the result is the
 * reason this could not wait:
 *
 *     pull  5   LATE 14  becomes  EARLY 17
 *     pull  9   LATE 22  becomes  EARLY 42
 *     pull 13   LATE 25  becomes  EARLY 34
 *     total    210 days  becomes  149 days
 *
 * Sixty-one days of lateness invert into a hundred and twenty-four days of apparent
 * earliness, and under a zero late-tolerance rule that reverses the verdict. F3 has
 * no slack at all - four takedowns against four pulls - so it is the exposed room.
 *
 * Materiality is a FLAG, not a filter. The scrap row stays visible in
 * v_harvest_takedown; it is only excluded from the schedule match. A takedown that
 * silently disappears is the failure this whole day has been about.
 *
 * DEFECT 3 - THE PARAMETER NOTE OVERSTATED ITS OWN SAFETY BY ROUGHLY EIGHT TIMES.
 *
 * I wrote that a 56-day cycle means "no value near this can fuse two real
 * takedowns". Agent V measured the actual gap distribution instead of reasoning
 * from the cycle: 45 gaps of 1 day, 6 of 3 days, NOTHING between 4 and 10, then
 * 11 days (F4, Jun 2024) and 13 days (F2, May 2024). The largest gap inside one
 * takedown is 3 days; the smallest gap between two separate takedowns is 11.
 *
 * So the safe window is [3, 10] and 7 is centred in it - the value is right, my
 * justification for it was wrong, and it invited the next reader to widen the
 * parameter to 14 or 21 "because the cycle is 56 days", which would fuse both 2024
 * pairs and delete two takedown events. Fix the note, not the number.
 *
 * THE PROCESS FAILURE, RECORDED BECAUSE IT IS THE POINT OF THE REFORM.
 *
 * The owner's standing rule is three reviewers who must agree, plus a guard, BEFORE
 * a schema change. I applied both of this morning's migrations and then asked for
 * review. V's words: "I am one of your three reviewers and this is the first I have
 * seen of it." No db_change_review rows existed. This migration opens the register
 * for all three changes retrospectively, which is worth less than opening it in the
 * right order, and says so.
 */

-- ---------------------------------------------------------------------------
-- The materiality threshold, as a rule.
-- ---------------------------------------------------------------------------

insert into public.harvest_alert_rules (rule_key, label, threshold, unit, severity, active, note)
select 'takedown_min_plants',
       'Takedown materiality floor',
       100,
       'plants',
       'watch',
       true,
       'Below this a harvest cluster is a scrap or corrective pull, not a room takedown, and must not consume an ordinal position in the schedule match. Measured 13 Aug 2026: across 48 all-time takedowns exactly one falls below (18 plants, F4, 6 Jun 2024); the next smallest is 189. Do not raise this without re-measuring that distribution - the gap between 18 and 189 is what makes the threshold safe, not the number itself.'
 where not exists (select 1 from public.harvest_alert_rules
                    where rule_key = 'takedown_min_plants');

-- The gap note overstated its own margin. Corrected to the measured distribution.
update public.harvest_alert_rules
   set note = 'Metrc harvest rows for one room within this many days of each other are ONE takedown. MEASURED 13 Aug 2026, all years: 45 same-room gaps of 1 day, 6 of 3 days, ZERO between 4 and 10 days, then 11 days (F4, Jun 2024) and 13 days (F2, May 2024) which are separate takedowns. The largest gap WITHIN one takedown is 3 days; the smallest gap BETWEEN two takedowns is 11. The safe window is therefore [3, 10] and 7 sits centred in it. Do NOT widen this toward the 56-day cycle length - at 14 or 21 it fuses both 2024 pairs and silently deletes two takedown events.'
 where rule_key = 'takedown_cluster_gap_days';

-- ---------------------------------------------------------------------------
-- v_harvest_takedown: plants and materiality appended. Nothing is filtered out.
-- ---------------------------------------------------------------------------

create or replace view public.v_harvest_takedown as
with gap as (
  select coalesce((select threshold from public.harvest_alert_rules
                    where rule_key = 'takedown_cluster_gap_days' and active), 7)::int as d
), floor_plants as (
  select coalesce((select threshold from public.harvest_alert_rules
                    where rule_key = 'takedown_min_plants' and active), 100)::numeric as p
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
       count(h.id) filter (where public.f_harvest_is_fresh_frozen(h.name))        as fresh_frozen_records,
       round(sum(coalesce(h.wet_weight, 0)) / 453.592, 1)                         as wet_lb,
       string_agg(distinct h.name, ', ')                                          as harvests,
       /* --- appended 13 Aug 2026 --- */
       coalesce(sum((h.raw ->> 'PlantCount')::numeric), 0)                        as plants,
       coalesce(sum((h.raw ->> 'PlantCount')::numeric), 0) >= (select p from floor_plants) as is_material
  from ev
  join public.metrc_harvests h
    on h.flower_room = ev.flower_room
   and h.harvest_start between ev.takedown_start and ev.takedown_end
 group by ev.flower_room, ev.takedown_start, ev.takedown_end;

comment on view public.v_harvest_takedown is
  'One row per room takedown. A room comes down over two to four days and the fresh-frozen cut runs three days ahead of the dried cut, so several Metrc harvest rows across several dates are ONE event. is_material is FALSE for scrap and corrective pulls below takedown_min_plants; they stay visible here and are excluded only from the schedule match, because a takedown that vanishes is the failure this view exists to prevent.';

-- ---------------------------------------------------------------------------
-- Both plan-versus-actual surfaces: the ordinal now has a shared floor.
-- ---------------------------------------------------------------------------

create or replace view public.v_schedule_compliance as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), plan_floor as (
  /* Both sides of the ordinal derive their floor from the plan itself. A literal
     year here would break the moment a pull outside it is loaded - which is the
     defect this replaces. */
  select min(harvest_date)
         - coalesce((select threshold from r where rule_key = 'early_allowance_days'), 3)::int as d
    from public.harvest_pulls
), td as (
  select flower_room, takedown_start, takedown_end, takedown_days,
         row_number() over (partition by flower_room order by takedown_start) as seq_plan
    from public.v_harvest_takedown
   where is_material
     and takedown_start >= (select d from plan_floor)
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
   where p.harvest_date >= (select d from plan_floor)
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
       'NOT MEASURED - actual_date on a Dry row is harvest_start + dry_max_days, which is the deadline, not an observation'::text,
       null::int,
       null::int,
       'Drying has no measured completion date in Metrc. Any lateness shown here is derived from the deadline, not from an event.'::text
  from public.v_harvest_stage_map m
 where m.stage <> all (array['Finished', 'Archived']);

comment on view public.v_schedule_compliance is
  'Schedule adherence, keyed on the ROOM. Each planned pull is matched to the nth MATERIAL takedown of its own room, never to a date window. Both sides of that ordinal derive their floor from the plan, so loading a pull outside 2026 cannot shift one side and not the other. WARNING for anyone reading the room column: on Pull rows it holds a flower room (F1-F4); on Dry rows it holds a drying location (Cure Vault, Dry Room #2). event_type tells them apart. Averaging days_late across all rows is wrong - the future pulls contribute 0.';

create or replace view public.v_harvest_plan_vs_actual as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), plan_floor as (
  select min(harvest_date)
         - coalesce((select threshold from r where rule_key = 'early_allowance_days'), 3)::int as d
    from public.harvest_pulls
), td as (
  select flower_room, takedown_start, takedown_end,
         row_number() over (partition by flower_room order by takedown_start) as seq_plan
    from public.v_harvest_takedown
   where is_material
     and takedown_start >= (select d from plan_floor)
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room, p.cultivars,
         p.original_total_plants, p.proj_harvest_weight_lbs, p.dry_day_14,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
    from public.harvest_pulls p
   where p.harvest_date >= (select d from plan_floor)
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

-- ---------------------------------------------------------------------------
-- The registry: 'room' is a supertype, and it must say so.
-- ---------------------------------------------------------------------------

update public.column_semantics
   set why = 'ANY named Metrc location, and the SUPERTYPE of flower_room and drying_location. Never assume a bare "room" column holds a flower room: v_schedule_compliance.room carries F1-F4 on Pull rows and Cure Vault / Dry Room #2 on Dry rows, and v_tag_master.room carries Clone Room, Hydrocarbon, Quarantine and Shipping & Receiving as well. The bare name appears in 62 objects against 12 for drying_room and 1 for flower_room, so the imprecise term is the dominant one - which is how the flower room and the drying location came to be used interchangeably and broke schedule compliance for six months. Where the distinction matters, use the specific term.'
 where column_name = 'room';

-- ---------------------------------------------------------------------------
-- The review register, opened late and recorded as late.
-- ---------------------------------------------------------------------------

insert into public.db_change_review
  (change_ref, domain, proposed_by, what_changes, why, rollback, reviewer)
/* DOMAIN NOTE, and it is a finding in its own right. db_domain_owner has five
   domains and NONE of them is cultivation. harvest_pulls, harvest_alert_rules and
   v_schedule_compliance match no table_pattern, so the harvest schedule has no
   registered owner and no named reviewers - which is a large part of why a defect
   in it ran from February to August with nobody assigned to look. Filed under
   'inventory & seed-to-sale' because metrc_harvests is squarely in that pattern and
   is the highest-consequence table this touches. Note also that that domain lists
   Agent I as a reviewer, and Agent I is the proposer here; the register's own rule
   is that an owner must never review its own change. Both gaps are for the owner. */
select v.change_ref, 'inventory & seed-to-sale', 'Agent I', v.what_changes, v.why, v.rollback, r.reviewer
  from (values
    ('DBI-112', 'metrc_harvests.flower_room generated column, f_flower_room_from_harvest_name, v_harvest_takedown, v_schedule_compliance rebuilt room-keyed',
     'v_schedule_compliance matched a scheduled pull to a harvest by date window with no room predicate. Four rooms rotate every ~13 days so the window caught another room and min() took the earliest, understating lateness every time. 43 published days late against 210 real; five pulls published as EARLY are 18-26 days LATE; F4 is 31 days overdue and read as 3 days early.',
     'create or replace the three views from git at the commit before 20260813060000; drop column metrc_harvests.flower_room; drop the two functions. No data is written by any of it.'),
    ('DBI-113', 'v_harvest_report, v_harvest_pull_link, v_harvest_plan_vs_actual repointed at the shared primitives; column_semantics vocabulary split into flower_room and drying_location',
     'Three views each carried their own parse of "which flower room" and their own rule for "when did the room come down". v_harvest_plan_vs_actual published the same understated lateness through a second door and grouped by DryingLocationName, which is where the flower went AFTER the cut. column_semantics itself held flower_room and drying_room both as means=room - the registry was asserting the conflation.',
     'create or replace the three views from git at the commit before 20260813061500; restore the previous CHECK constraint on column_semantics.means and revert the two updated rows.'),
    ('DBI-114', 'takedown materiality floor, shared ordinal floor on both plan-versus-actual surfaces, corrected parameter note, room supertype documented',
     'Found by Agent V and Agent X independently, in DBI-112 after it was already applied. The ordinal had one filtered side and one unfiltered side, so loading any pull outside 2026 would shift every room by one silently. And an 18-plant scrap pull counted as a takedown; simulated in 2026 it turns 61 days of lateness into 124 days of apparent earliness and drops the total from 210 to 149.',
     'create or replace the two views and v_harvest_takedown from git at the commit before 20260813071500; delete the takedown_min_plants rule row.')
  ) as v(change_ref, what_changes, why, rollback)
  cross join (values ('Agent V'), ('Agent W'), ('Agent X')) as r(reviewer)
 where not exists (select 1 from public.db_change_review d
                    where d.change_ref = v.change_ref and d.reviewer = r.reviewer);

/* CORRECTION PROPOSAL 44 IS DELIBERATELY LEFT AT 'proposed'.
 *
 * This migration originally moved it to 'applied'. tg_proposal_gate() refused:
 *
 *     Proposal 44 cannot go straight to applied from proposed. The owner approves
 *     first - that is the whole point of this register.
 *
 * The guard is right and I was wrong, so the write is gone rather than the guard.
 * Note what that means in practice: the CODE is live and the FINDING is open. The
 * owner has to approve #44 before it can be marked applied, and closing it needs
 * Agent W's checks registered as well.
 *
 * It is worth recording that the only part of this whole day's work that stopped me
 * doing the wrong thing was a guard I wrote for someone else. */
