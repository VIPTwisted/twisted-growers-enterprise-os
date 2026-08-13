/* ============================================================================
 * DBI-116 on the watchdog side. Agent W, 13 Aug 2026.
 *
 * Agent V and Agent X found the same defect in my assertion independently and it
 * holds. My harvest.* assertions RESTATED the plan-match floor instead of
 * deriving it, and restated the superseded DBI-114 formula at that: one
 * facility-wide date keyed on early_allowance_days, with no group by flower_room.
 *
 *   room   view floor    my floor
 *   F1     2026-02-05    2026-01-09
 *   F2     2026-02-20    2026-01-09
 *   F3     2026-01-09    2026-01-09
 *   F4     2026-01-23    2026-01-09
 *
 * The counts agreed, so it passed — BY COINCIDENCE. No material takedown happens
 * to fall in the gap. It fails in both directions the moment anything moves:
 * raise plan_match_floor_days and the view drops to 154 while the guard stays
 * silent; raise early_allowance_days and the guard fires on F1 at 55 days while
 * the view does not move at all. At critical with max_allowed 0 that second one
 * is a false fire that blocks the whole gate chain.
 *
 * A guard that agrees with what it guards for unrelated reasons is not a guard.
 *
 * WHY NOT SIMPLY READ v_schedule_compliance, which was the other proposal.
 * Because a guard that reads the thing it guards can only ever agree with it.
 * The migration applied at 20260813142647 did exactly that to this assertion —
 * it pointed the divergence limb at v_schedule_compliance's own published pairs
 * and DELETED the population limb entirely, which was the limb that detects an
 * extra takedown. If the ordinal slips, the view publishes the slipped pair and a
 * check reading that pair inherits the slip. Agent X named this failure himself
 * when he discarded "the two surfaces agree on 26 of 26" as evidence, and it is
 * already on the register as check_defect 40.
 *
 * SO: share the FLOOR, derive the MATCH. Both limbs are restored and both join
 * v_plan_room_floor, which is now the one definition. The guard reads no surface
 * it is guarding, and it cannot drift from the floor again because there is only
 * one floor to drift from.
 *
 * THE NEGATIVE FIXTURE NOW DISCRIMINATES PER-ROOM, which the old one could not.
 * tg_fx_neg_ordinal gains room F3: first pull 40 days ago, so its own floor is 43
 * days ago, and a takedown 100 days ago that sits BELOW it. Under the correct
 * per-room floor that takedown is out of scope and the half stays quiet. Under a
 * facility-wide floor it is admitted, F3 shows two takedowns against one past-due
 * pull, and the half goes red. Reverting to a single floor now breaks a fixture
 * instead of passing by luck.
 *
 * The fixture takedown views carry a `plants` column added by a concurrent
 * session for the materiality assertions; it is preserved here rather than
 * dropped, which is also why CREATE OR REPLACE is the right instrument.
 * ========================================================================== */

create or replace view tg_fx_pos_ordinal.v_plan_room_floor as
  select * from (values ('F1', current_date-143), ('F2', current_date-143))
  as t(flower_room, floor_date);

create or replace view tg_fx_neg_ordinal.v_plan_room_floor as
  select * from (values ('F1', current_date-163), ('F2', current_date-153),
                        ('F3', current_date-43))    -- F3's OWN floor, 43 days back
  as t(flower_room, floor_date);

create or replace view tg_fx_neg_ordinal.harvest_pulls as
  select * from (values
    (1, current_date-160,'F1'), (2, current_date-100,'F1'), (3, current_date-40,'F1'),
    (4, current_date-150,'F2'), (5, current_date-90,'F2'),
    (6, current_date+20, 'F2'), (7, current_date+80, 'F2'),
    (8, current_date-40, 'F3'))
  as t(pull_no, harvest_date, flower_room);

create or replace view tg_fx_neg_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-152, true, 1000::numeric), ('F1', current_date-80, true, 1000::numeric),
    ('F1', current_date-14,  true, 1000::numeric),
    ('F2', current_date-145, true, 1000::numeric), ('F2', current_date-70, true, 1000::numeric),
    /* THE PER-ROOM DISCRIMINATOR. F3's own floor is 43 days back, so this one is
       out of scope and must not be counted. A facility-wide floor would admit it,
       F3 would show 2 takedowns against 1 past-due pull, and this half would go
       red — which is exactly what should happen if anyone collapses the floor
       back to a single date. */
    ('F3', current_date-100, true, 1000::numeric),
    ('F3', current_date-20,  true, 1000::numeric))
  as t(flower_room, takedown_start, is_material, plants);

create or replace view tg_fx_pos_unmatched.v_plan_room_floor as
  select * from (values ('F1', current_date-103)) as t(flower_room, floor_date);
create or replace view tg_fx_neg_unmatched.v_plan_room_floor as
  select * from (values ('F1', current_date-103)) as t(flower_room, floor_date);
create or replace view tg_fx_pos_standing.v_plan_room_floor as
  select * from (values ('F4', current_date-94)) as t(flower_room, floor_date);
create or replace view tg_fx_neg_standing.v_plan_room_floor as
  select * from (values ('F1', current_date+27), ('F2', current_date-4),
                        ('F3', current_date-103))
  as t(flower_room, floor_date);

do $$
declare s text; r text;
begin
  foreach s in array array['tg_fx_pos_ordinal','tg_fx_neg_ordinal','tg_fx_pos_unmatched',
                           'tg_fx_neg_unmatched','tg_fx_pos_standing','tg_fx_neg_standing'] loop
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname = s loop
      execute format('revoke all on %I.%I from anon, authenticated', s, r);
    end loop;
  end loop;
end $$;

update data_assertion set violation_sql = $sql$
with bound as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'ordinal_match_max_divergence_days' and har.active),
                  45)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  join v_plan_room_floor f on f.flower_room = t.flower_room
  where t.is_material and t.takedown_start >= f.floor_date
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  join v_plan_room_floor f on f.flower_room = p.flower_room
  where p.harvest_date >= f.floor_date
)
select x.flower_room as subject,
       format('room %s has %s material takedown(s) in its plan era but only %s pull(s) past '
              'due — %s extra. Every ordinal match after the extra one is shifted by one '
              'takedown, and the published lateness for every later pull of this room is wrong.',
              x.flower_room, x.takedowns, x.past_due, x.takedowns - x.past_due) as detail
from (
  select f.flower_room,
         (select count(*) from pn p2
           where p2.flower_room = f.flower_room and p2.harvest_date < current_date) as past_due,
         (select count(*) from td t2 where t2.flower_room = f.flower_room) as takedowns
  from v_plan_room_floor f
) x
where x.takedowns > x.past_due
union all
select 'pull ' || p.pull_no as subject,
       format('room %s pull %s planned %s is matched to the takedown of %s at ordinal %s — '
              '%s days apart, past the %s-day bound. No room cycle observed is shorter than '
              '59 days and no real pull has ever diverged by more than 26, so a gap this '
              'wide is the ordinal having slipped, not late work.',
              p.flower_room, p.pull_no, p.harvest_date, t.takedown_start, p.seq_plan,
              abs(t.takedown_start - p.harvest_date), b.d) as detail
from pn p
join td t on t.flower_room = p.flower_room and t.seq_plan = p.seq_plan
cross join bound b
where abs(t.takedown_start - p.harvest_date) > b.d
$sql$,
fixture_shadows = array['harvest_pulls','v_harvest_takedown','harvest_alert_rules','v_plan_room_floor'],
fixture_negative_case =
  'Divergences of 8, 20 and 26 days — 26 is the largest that exists in production. A room with '
  'four pulls of which two are still in the future. AND, since DBI-116, a room whose own plan '
  'floor is 43 days back carrying a takedown 100 days back: correct under the per-room floor, '
  'and this half goes red if anyone collapses the floor to a single facility-wide date.',
note = 'DBI-116. Joins v_plan_room_floor for the floor and DERIVES the ordinal itself. It does '
       'not read v_schedule_compliance: a guard that reads the surface it guards can only agree '
       'with it, which is check_defect 40. Both limbs present — the population limb detects an '
       'extra takedown and is the one an earlier rewrite deleted.'
where assertion_key = 'harvest.ordinal_match_in_step';

update data_assertion set violation_sql = $sql$
with td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  join v_plan_room_floor f on f.flower_room = t.flower_room
  where t.is_material and t.takedown_start >= f.floor_date
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  join v_plan_room_floor f on f.flower_room = p.flower_room
  where p.harvest_date >= f.floor_date
)
select t.flower_room || ' takedown ' || t.seq_plan as subject,
       format('room %s came down on %s at ordinal %s and is material, yet the room has only '
              '%s planned pull(s) in its plan era. This is real harvested material with no '
              'plan behind it. It is not swallowed by the join; it is named here.',
              t.flower_room, t.takedown_start, t.seq_plan,
              (select count(*) from pn p2 where p2.flower_room = t.flower_room)) as detail
from td t
left join pn p on p.flower_room = t.flower_room and p.seq_plan = t.seq_plan
where p.pull_no is null
$sql$,
fixture_shadows = array['harvest_pulls','v_harvest_takedown','v_plan_room_floor']
where assertion_key = 'harvest.no_unmatched_takedown';

update data_assertion set violation_sql = $sql$
with od as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'pull_overdue_days' and har.active), 2)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  join v_plan_room_floor f on f.flower_room = t.flower_room
  where t.is_material and t.takedown_start >= f.floor_date
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  join v_plan_room_floor f on f.flower_room = p.flower_room
  where p.harvest_date >= f.floor_date
)
select p.flower_room || ' pull ' || p.pull_no as subject,
       format('room %s is %s days past its scheduled pull of %s with NO takedown recorded. %s',
              p.flower_room, current_date - p.harvest_date, p.harvest_date,
              case
                when current_date - p.harvest_date > 28 then
                  'ESCALATED — beyond four weeks. The room is holding a full cycle of capacity '
                  'and the plan behind it has already moved on.'
                when current_date - p.harvest_date > 14 then
                  'ESCALATED — beyond two weeks past plan.'
                else 'Past the owner''s overdue tolerance, and growing by one day every day.'
              end) as detail
from pn p
left join td t on t.flower_room = p.flower_room and t.seq_plan = p.seq_plan
cross join od
where t.takedown_start is null
  and p.harvest_date < current_date - od.d
$sql$,
fixture_shadows = array['harvest_pulls','v_harvest_takedown','harvest_alert_rules','v_plan_room_floor']
where assertion_key = 'harvest.no_room_stands_past_its_pull';
;
