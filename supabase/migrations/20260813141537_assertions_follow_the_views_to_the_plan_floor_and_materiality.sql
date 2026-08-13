/* ============================================================================
 * The assertions follow Agent I's ordinal fix. Agent W, 13 Aug 2026.
 *
 * Migration 20260813135922 replaced the hardcoded 2026 window with
 *     plan_floor = min(harvest_pulls.harvest_date) - early_allowance_days
 * applied to BOTH sides of the ordinal, and excluded immaterial clusters
 * (under takedown_min_plants = 100 plants) from consuming an ordinal position.
 *
 * My assertions still carried '2026-01-01' and no materiality filter. I wrote in
 * 20260813134751 that inheriting the hardcoded year was deliberate and that "when
 * those views stop hardcoding the year, this assertion must follow in the same
 * change". It did not follow in the same change, because the two changes were made
 * by two agents an hour apart. This is that change.
 *
 * It mattered less than it could have: min(harvest_date) is 2026-01-12, so the new
 * floor is 2026-01-09 and today both windows admit exactly the same takedowns.
 * That is luck, not agreement — and an assertion that agrees with its subject by
 * coincidence is the thing I am here to prevent, not an acceptable outcome.
 *
 * MATERIALITY, AND THE ONE RESIDUAL RISK, STATED PLAINLY
 * Excluding a sub-100-plant cluster from the match is right: exactly one such
 * cluster exists in 48 all-time takedowns (18 plants, F4, June 2024) and the next
 * smallest is 189. But it creates a new way for a real takedown to leave the
 * schedule quietly — if a genuine room takedown were ever recorded with a low
 * plant count, it would drop out of the match and assertion 3 would no longer
 * name it. The 18-to-189 gap is what makes that safe today, and it is a property
 * of the data, not of the rule.
 *
 * NOTE ON THE FIXTURE EDITS BELOW: the first draft of this migration used DROP
 * VIEW on the fixture relations and the SQL guard refused it under rule E1. The
 * guard was right and the statement was wrong — is_material appends at the END of
 * the column list, which is exactly the case CREATE OR REPLACE VIEW supports. No
 * escape was used and nothing was loosened.
 * ========================================================================== */

create or replace view tg_fx_pos_ordinal.harvest_alert_rules as
  select * from (values ('ordinal_match_max_divergence_days',45::numeric,true),
                        ('pull_overdue_days',2::numeric,true),
                        ('early_allowance_days',3::numeric,true))
  as t(rule_key, threshold, active);
create or replace view tg_fx_neg_ordinal.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_pos_standing.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_neg_standing.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_pos_unmatched.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_neg_unmatched.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;

create or replace view tg_fx_pos_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-135, true), ('F1', current_date-75, true),
    ('F1', current_date-15,  true),   -- THE UNPLANNED THIRD TAKEDOWN
    ('F2', current_date-138, true),
    ('F2', current_date-10,  true))   -- ordinal 2 of F2, pull 4 planned 60 days earlier
  as t(flower_room, takedown_start, is_material);

create or replace view tg_fx_neg_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-152, true), ('F1', current_date-80, true), ('F1', current_date-14, true),
    ('F2', current_date-145, true), ('F2', current_date-70, true))
  as t(flower_room, takedown_start, is_material);

create or replace view tg_fx_pos_unmatched.v_harvest_takedown as
  select * from (values ('F1', current_date-95, true),
                        ('F1', current_date-20, true))  -- material, no plan behind it
  as t(flower_room, takedown_start, is_material);

create or replace view tg_fx_neg_unmatched.v_harvest_takedown as
  select * from (values
    ('F1', current_date-95, true),
    ('F1', current_date-35, true),
    /* THE NEW NEGATIVE CASE, from Agent I's materiality rule: a scrap pull under
       100 plants. It is deliberately excluded from the schedule match, so it must
       NOT be reported as a takedown belonging to no pull — that would be a false
       alarm on a rule working exactly as designed. */
    ('F1', current_date-10, false))
  as t(flower_room, takedown_start, is_material);

create or replace view tg_fx_pos_standing.v_harvest_takedown as
  select * from (values ('F4', current_date-85, true)) as t(flower_room, takedown_start, is_material);

create or replace view tg_fx_neg_standing.v_harvest_takedown as
  select * from (values ('F3', current_date-74, true)) as t(flower_room, takedown_start, is_material);

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
with r as (select har.rule_key, har.threshold from harvest_alert_rules har where har.active),
plan_floor as (
  select (min(p.harvest_date)
          - (coalesce((select r.threshold from r where r.rule_key = 'early_allowance_days'),
                      3))::integer) as d
  from harvest_pulls p
), bound as (
  select coalesce((select r.threshold from r
                    where r.rule_key = 'ordinal_match_max_divergence_days'), 45)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  where t.is_material and t.takedown_start >= (select d from plan_floor)
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  where p.harvest_date >= (select d from plan_floor)
)
select r2.flower_room as subject,
       format('room %s has %s material takedown(s) but only %s pull(s) past due — %s extra. '
              'Every ordinal match after the extra one is shifted by one takedown.',
              r2.flower_room, r2.takedowns, r2.past_due, r2.takedowns - r2.past_due) as detail
from (
  select f.flower_room,
    (select count(*) from pn p2
      where p2.flower_room = f.flower_room and p2.harvest_date < current_date) as past_due,
    (select count(*) from td t2 where t2.flower_room = f.flower_room) as takedowns
  from (select distinct p3.flower_room from pn p3) f
) r2
where r2.takedowns > r2.past_due
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
note = 'Follows v_schedule_compliance exactly: plan_floor = min(harvest_pulls.harvest_date) '
       '- early_allowance_days, applied to both sides, with immaterial clusters excluded from '
       'the ordinal. Updated 13 Aug 2026 to track Agent I''s migration 20260813135922.'
where assertion_key = 'harvest.ordinal_match_in_step';

update data_assertion set violation_sql = $sql$
with r as (select har.rule_key, har.threshold from harvest_alert_rules har where har.active),
plan_floor as (
  select (min(p.harvest_date)
          - (coalesce((select r.threshold from r where r.rule_key = 'early_allowance_days'),
                      3))::integer) as d
  from harvest_pulls p
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  where t.is_material and t.takedown_start >= (select d from plan_floor)
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  where p.harvest_date >= (select d from plan_floor)
)
select t.flower_room || ' takedown ' || t.seq_plan as subject,
       format('room %s came down on %s at ordinal %s and is material, yet the room has only '
              '%s planned pull(s) in the plan window. This is real harvested material with no '
              'plan behind it. It is not swallowed by the join; it is named here.',
              t.flower_room, t.takedown_start, t.seq_plan,
              (select count(*) from pn p2 where p2.flower_room = t.flower_room)) as detail
from td t
left join pn p on p.flower_room = t.flower_room and p.seq_plan = t.seq_plan
where p.pull_no is null
$sql$,
fixture_shadows = array['harvest_pulls','v_harvest_takedown','harvest_alert_rules'],
fixture_negative_case =
  'A room with four planned pulls, two still in the future, against two takedowns — more '
  'pulls than takedowns is the normal state of a plan year. Plus a sub-100-plant scrap pull '
  'marked immaterial, which Agent I''s materiality rule deliberately excludes from the match '
  'and which must therefore never be reported as a takedown with no pull.',
note = 'Keyed on is_material from 13 Aug 2026, per Agent I. RESIDUAL RISK, stated rather than '
       'hidden: a genuine room takedown recorded with a low plant count would be excluded from '
       'the match and this assertion would no longer name it. Safe today only because exactly '
       'one of 48 all-time takedowns falls below 100 plants (18, F4, Jun 2024) and the next '
       'smallest is 189. That gap is a property of the data, not of the rule — re-measure it '
       'before moving takedown_min_plants.'
where assertion_key = 'harvest.no_unmatched_takedown';

update data_assertion set violation_sql = $sql$
with r as (select har.rule_key, har.threshold from harvest_alert_rules har where har.active),
plan_floor as (
  select (min(p.harvest_date)
          - (coalesce((select r.threshold from r where r.rule_key = 'early_allowance_days'),
                      3))::integer) as d
  from harvest_pulls p
), od as (
  select coalesce((select r.threshold from r where r.rule_key = 'pull_overdue_days'), 2)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq_plan
  from v_harvest_takedown t
  where t.is_material and t.takedown_start >= (select d from plan_floor)
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq_plan
  from harvest_pulls p
  where p.harvest_date >= (select d from plan_floor)
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
$sql$
where assertion_key = 'harvest.no_room_stands_past_its_pull';
;
