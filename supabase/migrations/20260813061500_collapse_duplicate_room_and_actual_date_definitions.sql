/* COLLAPSING THE DUPLICATES THAT LET THE SCHEDULE DEFECT LIVE FOR SIX MONTHS.
 *
 * The previous migration fixed v_schedule_compliance. On its own that would have
 * been the same mistake in a new place: three OTHER views still carried their own
 * answer to the same two questions, and two of them were still wrong.
 *
 * "WHICH FLOWER ROOM DID THIS HARVEST COME FROM" had three parses:
 *   v_harvest_report      substring(regexp_replace(upper(name),'\s','','g'),'F[1-4]')
 *   v_harvest_pull_link   'F' || substring(regexp_replace(name,'^.*\d{8}',''),'[fF] ?([1-4])')
 *   v_schedule_compliance  none at all - the defect
 *
 * "WHEN DID THE ROOM ACTUALLY COME DOWN" had three rules:
 *   v_schedule_compliance    min() in a -5/+21 window, no room          [fixed]
 *   v_harvest_plan_vs_actual join on -4/+10, grouped by DryingLocationName
 *   v_harvest_pull_link      nearest plan date within +/-7, room noted but not keyed
 *
 * v_harvest_plan_vs_actual matters most of the three: it publishes a "timing"
 * column reading "Late by N days" computed the same broken way, so the wrong figure
 * the owner was given had a second home. It also groups by DryingLocationName -
 * Cure Vault, Dry Room #2, Freezer/Biomass Storage - which is where the flower went
 * AFTER the cut, not the room it came out of, so one pull fanned out into several
 * rows each claiming to be the actual.
 *
 * All three now read metrc_harvests.flower_room and v_harvest_takedown. There is
 * one definition of each primitive, which is the countable test: more than one is
 * the defect.
 *
 * NOT RENAMED, DELIBERATELY. v_harvest_plan_vs_actual.actual_room keeps holding the
 * DRYING location, because that is what it has always held and create or replace
 * cannot rename a column anyway. Its meaning is now stated in a comment instead of
 * being guessed at from the name. The flower room is in flower_room, one column to
 * its left, and under room-keyed matching the two can no longer contradict.
 *
 * ROW COUNT FALLS ON PURPOSE. v_harvest_plan_vs_actual emitted one row per
 * (date, drying room) pair that fell inside the window. It now emits one row per
 * planned pull, which is what a plan-versus-actual is.
 */

-- ---------------------------------------------------------------------------
-- One definition of "is this a fresh frozen harvest", too.
-- ---------------------------------------------------------------------------

create or replace function public.f_harvest_is_fresh_frozen(p_name text)
returns boolean
language sql
immutable
parallel safe
as $$
  /* Word-boundaried on purpose. A bare '%ff%' also matches "fresh froZEN" and
     "Muffin", and a bare '%zen%' once attributed all 418.3 lb of fresh frozen to
     the Zen licence. */
  select p_name ~* '(^|[^a-z])FF([^a-z]|$)'
$$;

comment on function public.f_harvest_is_fresh_frozen(text) is
  'The single definition of whether a Metrc harvest is the fresh-frozen cut. Metrc has no flag for it; it is carried in the harvest name.';

-- ---------------------------------------------------------------------------
-- v_harvest_report: stop parsing the room, read it.
-- ---------------------------------------------------------------------------

create or replace view public.v_harvest_report as
select h.name                                                              as harvest,
       h.harvest_start                                                     as cut_date,
       h.flower_room                                                       as room,
       coalesce(nullif(h.raw ->> 'SourceStrainNames', ''), '(not recorded)') as strain,
       (h.raw ->> 'PlantCount')::integer                                   as plants,
       round(h.wet_weight / 453.592, 1)                                    as wet_lb,
       round(((h.raw ->> 'TotalPackagedWeight')::numeric) / 453.592, 1)    as packaged_lb,
       round(((h.raw ->> 'TotalPackagedWeight')::numeric)
             / nullif((h.raw ->> 'PlantCount')::integer, 0)::numeric, 1)   as grams_per_plant,
       f_rule_at('harvest_goal_lb', h.harvest_start::timestamptz)          as goal_lb,
       round(((h.raw ->> 'TotalPackagedWeight')::numeric) / 453.592
             - f_rule_at('harvest_goal_lb', h.harvest_start::timestamptz), 1) as vs_goal_lb,
       case
         when (h.raw ->> 'FinishedDate') is null
           then 'STILL OPEN — cannot be judged yet'
         when public.f_harvest_is_fresh_frozen(h.name)
           or coalesce(h.raw ->> 'DryingLocationName', '') ilike '%freezer%'
           then 'Fresh frozen — not judged against the dried flower goal'
         when (((h.raw ->> 'TotalPackagedWeight')::numeric) / 453.592)
              >= f_rule_at('harvest_goal_lb', h.harvest_start::timestamptz)
           then 'MET the goal'
         else 'SHORT by ' || round(f_rule_at('harvest_goal_lb', h.harvest_start::timestamptz)
                                   - ((h.raw ->> 'TotalPackagedWeight')::numeric) / 453.592, 1) || ' lb'
       end                                                                 as verdict,
       (h.raw ->> 'FinishedDate')::date                                    as closed_on,
       coalesce(h.raw ->> 'DryingLocationName', '(not recorded)')          as dried_in
  from public.metrc_harvests h
 where h.wet_weight > 0;

comment on view public.v_harvest_report is
  'Per-harvest yield against goal. room reads metrc_harvests.flower_room - it no longer carries its own parse. dried_in is the post-cut location and is NOT the room the flower grew in; those two were conflated across the platform until 13 Aug 2026.';

-- ---------------------------------------------------------------------------
-- v_harvest_pull_link: stop parsing the room, read it.
-- ---------------------------------------------------------------------------

create or replace view public.v_harvest_pull_link as
with h as (
  select mh.id,
         mh.name,
         mh.harvest_start,
         mh.wet_weight,
         mh.waste_weight,
         mh.package_count,
         substring(mh.name, '(\d{8})')                as name_date_token,
         mh.flower_room                               as room_actual,
         public.f_harvest_is_fresh_frozen(mh.name)    as is_fresh_frozen
    from public.metrc_harvests mh
)
select h.id                                           as harvest_id,
       h.name                                         as harvest_name,
       h.harvest_start                                as takedown_date,
       h.room_actual,
       p.flower_room                                  as room_planned,
       h.is_fresh_frozen,
       p.pull_no,
       p.harvest_date                                 as pull_planned_date,
       h.harvest_start - p.harvest_date               as days_from_planned_pull,
       p.planned_plants,
       p.projected_flower_after_ff_lb,
       h.wet_weight,
       h.package_count,
       case
         when p.pull_no is not null and h.room_actual is null
           then 'Linked on date. Room unknown - the name carries no room, which is true of all 2024 harvests, before the naming convention existed.'
         when p.pull_no is not null and h.room_actual is distinct from p.flower_room
           then 'Linked on date. ROOM DRIFTED - the plan expected ' || p.flower_room
                || ', the harvest came out of ' || h.room_actual
                || '. This link is by DATE ONLY and is therefore not evidence of adherence; v_schedule_compliance keys on the room and is the answer for that.'
         when p.pull_no is not null
           then 'Linked on date, and the room agrees with the plan.'
         when h.harvest_start < date '2026-01-01'
           then 'Not linked - harvest_plan_2026 covers 2026 only. This harvest predates the plan and no pull exists to attach it to.'
         when h.harvest_start > (select max(harvest_date) from public.harvest_plan_2026)
           then 'Not linked - takedown is after the last planned pull of 2026.'
         else 'NOT LINKED - no planned pull within the '
              || coalesce(f_rule('pull_link_window_days')::text, '?')
              || '-day matching window. Investigate: either a pull happened off-calendar, or the takedown date is wrong.'
       end                                            as link_note,
       case
         when h.name_date_token is null then 'Name carries no readable 8-digit date'
         when to_date(h.name_date_token, 'YYYYMMDD') <> h.harvest_start
           then 'Name says ' || h.name_date_token || ', Metrc says ' || h.harvest_start || ' - Metrc wins'
       end                                            as name_date_disagreement
  from h
  left join lateral (
    select p2.pull_no, p2.harvest_date, p2.flower_room,
           p2.planned_plants, p2.projected_flower_after_ff_lb
      from public.harvest_plan_2026 p2
     where abs(h.harvest_start - p2.harvest_date)::numeric
           <= coalesce(f_rule('pull_link_window_days'), 7)
     order by abs(h.harvest_start - p2.harvest_date), p2.pull_no
     limit 1
  ) p on true;

comment on view public.v_harvest_pull_link is
  'Attaches each Metrc harvest to the nearest planned pull BY DATE, for yield reporting. It is deliberately not the adherence answer: a date-only link can attach a harvest to another room''s pull, and link_note now says so where the rooms disagree. Schedule adherence is v_schedule_compliance, which keys on the room. room_actual reads metrc_harvests.flower_room and no longer carries its own parse.';

-- ---------------------------------------------------------------------------
-- v_harvest_plan_vs_actual: rebuilt on the room, same columns in the same order.
-- ---------------------------------------------------------------------------

create or replace view public.v_harvest_plan_vs_actual as
with r as (
  select rule_key, threshold from public.harvest_alert_rules where active
), td as (
  select flower_room, takedown_start, takedown_end,
         row_number() over (partition by flower_room order by takedown_start) as seq_2026
    from public.v_harvest_takedown
   where takedown_start >= date '2026-01-01'
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room, p.cultivars,
         p.original_total_plants, p.proj_harvest_weight_lbs, p.dry_day_14,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_2026
    from public.harvest_pulls p
), m as (
  select pn.*, td.takedown_start, td.takedown_end
    from pn
    left join td on td.flower_room = pn.flower_room and td.seq_2026 = pn.seq_2026
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

comment on view public.v_harvest_plan_vs_actual is
  'One row per planned pull, matched to the nth takedown of its own room. It previously joined on a -4/+10 date window and grouped by DryingLocationName, which fanned one pull into several rows and substituted another room''s takedown; its timing column carried the same understated lateness as v_schedule_compliance. actual_room holds the DRYING location(s) the cut went into - not the flower room, which is in flower_room. timing reads the same tolerances from harvest_alert_rules as v_schedule_compliance, so the two surfaces cannot disagree.';

-- ---------------------------------------------------------------------------
-- The registry was asserting the very conflation that caused this.
--
-- column_semantics held BOTH flower_room AND drying_room as means = 'room'. Read
-- plainly, the platform's own dictionary of primitives said a flower room and a
-- drying room are the same thing. They are not: F1-F4 is where the plant grew,
-- Cure Vault / Dry Room #2 / Freezer/Biomass Storage is where the cut went. Every
-- view that used DryingLocationName as though it were the harvest's room had the
-- registry's blessing to do so.
--
-- ON WIDENING A CHECK CONSTRAINT. The house rule is never to widen a key or relax
-- a guard to make a check pass, and this does add two values to a CHECK list. It is
-- the opposite of a relaxation in effect: the vocabulary was too coarse to express a
-- distinction, so the guard could not catch the error, and every conflation passed.
-- Splitting the term makes the registry able to fail where it previously could not.
-- Flagged for review rather than done quietly.
-- ---------------------------------------------------------------------------

alter table public.column_semantics
  drop constraint if exists column_semantics_means_check;

alter table public.column_semantics
  add constraint column_semantics_means_check
  check (means = any (array[
    'package_tag', 'room', 'flower_room', 'drying_location',
    'licence', 'strain', 'manifest'
  ]));

update public.column_semantics
   set means = 'flower_room',
       why   = 'F1-F4, the room the plant GREW in. metrc_harvests.flower_room is generated from f_flower_room_from_harvest_name; harvest_pulls.flower_room is the planned side. Was filed under the generic ''room'' alongside drying_room until 13 Aug 2026, which is how the two came to be used interchangeably.'
 where column_name = 'flower_room';

update public.column_semantics
   set means = 'drying_location',
       why   = 'Where the cut flower WENT: Cure Vault, Dry Room #2, Pre Trim Storage Room, Freezer/Biomass Storage, Fulfillment Vault. Not a flower room. Metrc calls it DryingLocationName.'
 where column_name = 'drying_room';

insert into public.column_semantics (column_name, means, why, added_by)
select v.column_name, v.means, v.why, 'Agent I'
  from (values
    ('room_actual', 'flower_room',
     'v_harvest_pull_link''s name for it. Reads metrc_harvests.flower_room; it no longer carries its own parse.'),
    ('DryingLocationName', 'drying_location',
     'Metrc''s own field name. NOT the flower room. Reading it as one is what broke v_harvest_plan_vs_actual.'),
    ('dried_in', 'drying_location',
     'v_harvest_report''s name for the drying location.'),
    ('actual_room', 'drying_location',
     'v_harvest_plan_vs_actual''s name for the drying location. The name reads like a flower room and is not one; create or replace view cannot rename a column, so it is documented here instead.')
  ) as v(column_name, means, why)
 where not exists (select 1 from public.column_semantics c where c.column_name = v.column_name);
