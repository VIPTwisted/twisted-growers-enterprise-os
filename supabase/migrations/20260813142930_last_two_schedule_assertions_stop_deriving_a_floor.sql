/* Agent V, third pass: no_unmatched_takedown and no_room_stands_past_its_pull still
 * derive a GLOBAL floor from early_allowance_days, while DBI-115 moved the surfaces to
 * a PER-ROOM floor on plan_match_floor_days. Verified live and V is right. The counts
 * agree today only because no material takedown falls in the gap between the two floors.
 *
 * Not fixed by copying the new parameter name -- that works until the next migration.
 * Both now read what the surface published, like ordinal_match_in_step already does.
 *
 * AND A DUPLICATE I CREATED AN HOUR AGO IS REMOVED. Rewriting ordinal_match_in_step
 * to read the surface made its first limb identical to no_unmatched_takedown: same
 * predicate, two rows. By the countable duplicate test that is the defect, and it was
 * mine. The predicate stays in no_unmatched_takedown, whose name is what it detects.
 * ordinal_match_in_step keeps the divergence bound alone.
 */

create or replace view tg_fx_pos_unmatched.v_schedule_compliance as
  select * from (values
    ('Pull', 1, 'F1', current_date-100, current_date-95),
    ('Pull', 2, 'F1', current_date-25,  current_date-20))
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_pos_unmatched.v_harvest_takedown as
  select * from (values
    ('F1', current_date-95, true, 1000::numeric),
    ('F1', current_date-60, true,  980::numeric),
    ('F1', current_date-20, true, 1010::numeric))
  as t(flower_room, takedown_start, is_material, plants);

create or replace view tg_fx_neg_unmatched.v_schedule_compliance as
  select * from (values
    ('Pull', 1, 'F1', current_date-100, current_date-74),
    ('Pull', 2, 'F1', current_date-40,  null::date),
    ('Pull', 3, 'F2', current_date+30,  null::date))
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_neg_unmatched.v_harvest_takedown as
  select * from (values
    ('F1', current_date-74,  true,  1100::numeric),
    ('F1', current_date-30,  false,   18::numeric),
    ('F1', current_date-200, true,  1040::numeric),
    ('F2', current_date-150, true,  1050::numeric))
  as t(flower_room, takedown_start, is_material, plants);

create or replace view tg_fx_pos_standing.v_schedule_compliance as
  select * from (values
    ('Pull', 14, 'F4', current_date-31, null::date))
  as t(event_type, pull_no, room, scheduled_date, actual_date);

create or replace view tg_fx_neg_standing.v_schedule_compliance as
  select * from (values
    ('Pull', 1,         'F1', current_date+30,  null::date),
    ('Pull', 2,         'F2', current_date-1,   null::date),
    ('Pull', 3,         'F3', current_date-100, current_date-74),
    ('Dry',  null::int, 'Cure Vault', current_date-90, null::date))
  as t(event_type, pull_no, room, scheduled_date, actual_date);

do $mig$
declare s text; r text;
begin
  foreach s in array array['tg_fx_pos_unmatched','tg_fx_neg_unmatched',
                           'tg_fx_pos_standing','tg_fx_neg_standing'] loop
    execute format('revoke all on schema %I from anon, authenticated', s);
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname = s loop
      execute format('revoke all on %I.%I from anon, authenticated', s, r);
    end loop;
  end loop;
end $mig$;

update public.data_assertion set
  violation_sql = $sql$
with matched as (
  select s.room, s.actual_date
  from v_schedule_compliance s
  where s.event_type = 'Pull' and s.actual_date is not null
)
select t.flower_room || ' ' || t.takedown_start as subject,
       format('room %s came down on %s (%s plants, material) INSIDE its own matched era, and no '
              'planned pull claims it. The room''s first matched takedown was %s. This is real '
              'harvested material with no plan behind it, and it consumes an ordinal position, so '
              'every later pull for this room is matched to the wrong harvest. It is not swallowed '
              'by the join; it is named here.',
              t.flower_room, t.takedown_start, t.plants,
              (select min(m.actual_date) from matched m where m.room = t.flower_room)) as detail
from v_harvest_takedown t
where t.is_material
  and t.takedown_start > (select min(m.actual_date) from matched m where m.room = t.flower_room)
  and not exists (select 1 from matched m
                   where m.room = t.flower_room and m.actual_date = t.takedown_start)
$sql$,
  fixture_shadows = array['v_harvest_takedown','v_schedule_compliance'],
  fixture_positive_case =
    'A material takedown sitting between two matched ones, claimed by no pull -- an unplanned or '
    'corrective harvest, which under a plain inner join simply vanishes from every surface.',
  fixture_negative_case =
    'A matched takedown. An 18-plant scrap cluster inside the era, excluded by is_material. A '
    'material takedown BEFORE the room''s first matched one, which is ordinary pre-plan-era '
    'history that any date-anchored version flags. A past-due pull with NULL actual_date and a '
    'future pull, because more pulls than takedowns is the normal state of a plan year. And a '
    'room with NO matched pulls at all, where min() over an empty set is NULL -- a careless '
    'comparison against NULL flags every takedown that room ever had.',
  fixture_proven_at = null,
  fixture_last_result = 'awaiting re-proof after floor removal',
  note =
    'Reads what v_schedule_compliance published rather than re-deriving the ordinal. The previous '
    'version derived a GLOBAL floor from early_allowance_days while DBI-115 moved the surfaces to '
    'a PER-ROOM floor on plan_match_floor_days; the two agreed only because no material takedown '
    'falls in the gap between them. Anchoring to the room''s own first matched takedown means '
    'there is no floor here to go stale. Raised by Agent V, 13 Aug 2026.'
where assertion_key = 'harvest.no_unmatched_takedown';

update public.data_assertion set
  violation_sql = $sql$
with od as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'pull_overdue_days' and har.active), 2)::int as d
)
select s.room || ' pull ' || s.pull_no as subject,
       format('room %s is %s days past its scheduled pull of %s with NO takedown recorded. %s',
              s.room, current_date - s.scheduled_date, s.scheduled_date,
              case
                when current_date - s.scheduled_date > 28 then
                  'ESCALATED — beyond four weeks. The room is holding a full cycle of capacity '
                  'and the plan behind it has already moved on.'
                when current_date - s.scheduled_date > 14 then
                  'ESCALATED — beyond two weeks past plan.'
                else 'Past the owner''s overdue tolerance, and growing by one day every day.'
              end) as detail
from v_schedule_compliance s
cross join od
where s.event_type = 'Pull'
  and s.actual_date is null
  and s.scheduled_date < current_date - od.d
$sql$,
  fixture_shadows = array['v_schedule_compliance','harvest_alert_rules'],
  fixture_positive_case =
    'A room 31 days past its scheduled pull with no takedown against it — F4''s exact position on '
    '13 Aug 2026, which the pre-DBI-112 view published as "3 days early".',
  fixture_negative_case =
    'Three rooms that legitimately have no takedown: one whose pull is still in the future, one a '
    'single day past and inside the owner''s two-day tolerance, and one a hundred days back that '
    'DID come down, 26 days late. Plus a Dry row with a null actual_date and a 90-day-old '
    'scheduled date: Dry rows carry a deadline and not an observation, so dropping the event_type '
    'filter turns this half red on its own.',
  fixture_proven_at = null,
  fixture_last_result = 'awaiting re-proof after floor removal',
  note =
    'The threshold and the critical severity are both the owner''s own recorded values on the '
    'pull_overdue_days rule, not this agent''s judgement. The escalation bands sit in the detail '
    'text so one room is one finding — not a new critical alert per room per day. Now reads the '
    'surface: the previous version derived a global floor from early_allowance_days, which DBI-115 '
    'replaced with a per-room floor on plan_match_floor_days. Raised by Agent V, 13 Aug 2026.'
where assertion_key = 'harvest.no_room_stands_past_its_pull';

update public.data_assertion set
  violation_sql = $sql$
with bound as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'ordinal_match_max_divergence_days' and har.active), 45)::int as d
)
select 'pull ' || s.pull_no as subject,
       format('room %s pull %s planned %s is published as matched to the takedown of %s -- '
              '%s days apart, past the %s-day bound. No room cycle observed is shorter than 59 '
              'days and no real pull has ever diverged by more than 26, so a gap this wide is '
              'the ordinal having slipped, not late work.',
              s.room, s.pull_no, s.scheduled_date, s.actual_date,
              abs(s.actual_date - s.scheduled_date), b.d) as detail
from v_schedule_compliance s
cross join bound b
where s.event_type = 'Pull'
  and s.actual_date is not null
  and abs(s.actual_date - s.scheduled_date) > b.d
$sql$,
  fixture_shadows = array['v_schedule_compliance','harvest_alert_rules'],
  fixture_positive_case =
    'A published pair 56 days apart: F2 pull 4 against the 29 Dec 2025 takedown, to scale, which '
    'is the exact row that appears when the match floor reaches back far enough to pull that '
    'takedown into F2''s first ordinal slot.',
  fixture_negative_case =
    'A pair 26 days apart -- the largest divergence that exists in production, real lateness. A '
    'past-due pull with a NULL actual_date (in flight, and NULL must not become arithmetic). A '
    'future pull. And two Dry rows, one 64 days wide: actual_date on a Dry row is a deadline and '
    'not an observation, so dropping the event_type filter turns this half red on its own.',
  fixture_proven_at = null,
  fixture_last_result = 'awaiting re-proof after duplicate removal',
  note =
    'ONE LIMB, DELIBERATELY. An earlier version today carried a second limb for material takedowns '
    'claimed by no pull. Rewriting it to read the surface made that limb identical to '
    'harvest.no_unmatched_takedown -- same predicate, two rows, which is the countable duplicate '
    'defect and it was self-inflicted. The predicate lives in no_unmatched_takedown, whose name is '
    'what it detects. This one owns the divergence bound alone. '
    'MEASURED BAND for ordinal_match_max_divergence_days: the largest legitimate divergence in '
    'production is 26 days and the F2 ordinal slip presents at 56, so any value in [26, 55] both '
    'stays quiet today and catches that slip. 45 sits near the middle. Above 55 this goes blind to '
    'the exact failure it was written for -- the rule''s own note says the ceiling is 59, which is '
    'the room-cycle length and four days too generous.'
where assertion_key = 'harvest.ordinal_match_in_step';

update public.checker_registry set
  fixture_positive_case = 'A published pair 56 days apart — F2 pull 4 against the 29 Dec 2025 takedown, to scale.',
  fixture_negative_case = 'A 26-day divergence (the largest real one in production), a NULL actual_date, a future pull, and two Dry rows one of which is 64 days wide.',
  note = 'Divergence bound only; the unclaimed-takedown predicate moved to assert.harvest.no_unmatched_takedown to keep one definition. Measured band for the bound is [26, 55].'
where checker_key = 'assert.harvest.ordinal_match_in_step';

update public.checker_registry set
  note = 'Reads v_schedule_compliance''s published pairs; anchored to the room''s own first matched takedown so there is no floor to go stale. Owns the unclaimed-takedown predicate.'
where checker_key = 'assert.harvest.no_unmatched_takedown';

update public.checker_registry set
  note = 'Reads v_schedule_compliance directly. The previous version derived a global floor from early_allowance_days, which DBI-115 replaced with a per-room floor on plan_match_floor_days.'
where checker_key = 'assert.harvest.no_room_stands_past_its_pull';;
