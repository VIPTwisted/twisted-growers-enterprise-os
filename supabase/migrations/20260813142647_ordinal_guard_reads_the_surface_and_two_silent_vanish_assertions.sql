/* ============================================================================
 * THE GUARD WAS MEASURING A NEIGHBOURING POPULATION. Agent W, 13 Aug 2026.
 *
 * Agent V brought me a defect in my own assertion and it holds. I re-measured
 * every claim independently before touching anything; all of it reconciles.
 *
 * WHAT WAS WRONG WITH harvest.ordinal_match_in_step
 *
 *   td as (... from v_harvest_takedown where takedown_start >= '2026-01-01')
 *
 * Two faults in one CTE:
 *   1. A hardcoded literal year -- the same trap DBI-114 removed from the views,
 *      still alive in the guard that watches them.
 *   2. No is_material filter, while both surfaces filter on it. The assertion and
 *      the surface therefore disagreed about what the word "takedown" denotes.
 *
 * Neither costs a figure today: from the plan floor there are 13 material
 * takedowns and 13 takedowns total, and the only non-material cluster in all of
 * v_harvest_takedown is F4, 6 Jun 2024, 18 plants -- two years outside the era.
 * Both faults are latent, and both fail in the expensive direction.
 *
 * MEASURED, sweeping early_allowance_days 0..30 against live data, read-only:
 *
 *   ea 0-13   published 210 days late   guard silent   (max divergence 26)
 *   ea 14     published 150 days late   guard silent   <-- MISSED
 *   ea 28     published  94 days late   guard silent   <-- MISSED
 *
 * At 14 the facility-wide floor reaches back to 29 Dec 2025, F2's December
 * takedown of 1,049 plants claims F2's first ordinal slot, and every later F2
 * pull shifts one position. Sixty days of lateness disappear. The guard could not
 * see it because its population was anchored to a January literal and therefore
 * did not move when the view's did.
 *
 * WHY THIS FIX IS NOT "DERIVE THE SAME FLOOR"
 *
 * That was the obvious repair and I rejected it. tmp_per_room_floor.sql -- written,
 * not applied, sitting untimestamped in this directory -- moves the floor PER ROOM
 * onto a new plan_match_floor_days key. A guard that re-derives today's floor would
 * drift again the day that lands, and I would be back here a third time.
 *
 * So the guard stops re-deriving the ordinal and READS THE SURFACE IT GUARDS.
 *   - the divergence limb reads v_schedule_compliance's own published pairs
 *   - the population limb compares v_harvest_takedown against what the view matched
 *   - neither mentions a floor, a year, or a tolerance key
 * It is correct under the facility-wide floor, under the per-room floor, and under
 * whatever replaces them. There were three implementations of the ordinal match in
 * this database and two of them were mine; now there is one, and the guard checks
 * its output rather than racing it.
 *
 * The population limb is anchored to "later than the room's own first matched
 * takedown" instead of a date. That is what makes it floor-free: pre-plan-era
 * history is excluded by construction, not by a constant someone has to maintain.
 *
 * TWO NEW ASSERTIONS, BOTH HANDED TO ME BY REVIEWERS, BOTH SILENT-VANISH FAULTS
 *
 * Agent X, via tmp_per_room_floor.sql: "is_material can itself vanish a real
 * takedown: a null PlantCount makes it false and drops the takedown from the match
 * silently -- precisely what the view comment claims it prevents. It still needs an
 * assertion rather than a margin. Agent W's lane, raised there." Correct, and the
 * margin is not the guard. 0 of 372 classified harvest rows carry a missing
 * PlantCount today; the assertion is what keeps that true.
 *
 * Agent V: when the materiality guard excludes a cluster inside the plan era,
 * nothing tells anyone. Adding is_material above creates exactly that blind spot,
 * so the two changes ship together. Severity watch, because a human must confirm
 * the excluded cluster really is scrap -- there are 179 unread critical alerts and
 * this is not the 180th.
 * ========================================================================== */

/* ---------------------------------------------------------------------------
 * FIXTURES. Relative dates throughout: a fixture pinned to literal dates rots as
 * "future" rows become past and starts proving something else unattended.
 * ------------------------------------------------------------------------- */

create schema if not exists tg_fx_pos_materiality;
create schema if not exists tg_fx_neg_materiality;
create schema if not exists tg_fx_pos_plantcount;
create schema if not exists tg_fx_neg_plantcount;

/* --- ordinal: the surface-reading rewrite -------------------------------- */

create or replace view tg_fx_pos_ordinal.harvest_alert_rules as
  select * from (values ('ordinal_match_max_divergence_days',45::numeric,true),
                        ('pull_overdue_days',2::numeric,true))
  as t(rule_key, threshold, active);
create or replace view tg_fx_neg_ordinal.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;

create or replace view tg_fx_pos_ordinal.v_schedule_compliance as
  select * from (values
    /* F1: two pulls matched, both plausible. The DEFECT is on the takedown side. */
    ('Pull', 1,          'F1', current_date-100, current_date-95),
    ('Pull', 2,          'F1', current_date-20,  current_date-20),
    /* F2: a published pair 56 days apart -- an ordinal slip, not late work.
       This is F2 pull 4 against the 29 Dec takedown, to scale. */
    ('Pull', 3,          'F2', current_date-158, current_date-214),
    /* A Dry row with a wide gap. actual_date on a Dry row is a DEADLINE, not an
       observation, so it must be ignored even here where everything else fires. */
    ('Dry',  null::int,  'Cure Vault', current_date-70, current_date-5))
  as t(event_type, pull_no, room, scheduled_date, actual_date);

create or replace view tg_fx_pos_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-95,  true,  1000::numeric),
    /* THE UNCLAIMED TAKEDOWN: material, inside F1's matched era, matched by nothing.
       It consumes an ordinal and shifts every later pair. */
    ('F1', current_date-60,  true,   980::numeric),
    ('F1', current_date-20,  true,  1010::numeric),
    ('F2', current_date-214, true,  1049::numeric))
  as t(flower_room, takedown_start, is_material, plants);

create or replace view tg_fx_neg_ordinal.v_schedule_compliance as
  select * from (values
    /* 26 days apart -- the largest divergence that actually exists in production.
       Real, legitimate lateness. If this half ever goes red because someone
       tightened the bound, the bound is wrong and not the data. */
    ('Pull', 1,          'F1', current_date-100, current_date-74),
    /* Past due, never harvested. In flight, not a discrepancy. NULL actual_date
       must not be arithmetic. */
    ('Pull', 2,          'F1', current_date-40,  null::date),
    /* Still in the future. */
    ('Pull', 3,          'F2', current_date+30,  null::date),
    /* Dry rows, one of them 64 days wide. Drop the event_type filter and this
       fires immediately -- the filter is load-bearing, so it is tested. */
    ('Dry',  null::int,  'Cure Vault', current_date-70, current_date-6),
    ('Dry',  null::int,  'Dry Room #2', current_date-20, current_date-4))
  as t(event_type, pull_no, room, scheduled_date, actual_date);

create or replace view tg_fx_neg_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-74,  true,  1100::numeric),
    /* A SCRAP CLUSTER inside the matched era. Excluded by is_material. Without
       that filter this reads as an unclaimed takedown and the assertion cries
       wolf on a healthy room -- which is precisely what the old SQL did. */
    ('F1', current_date-30,  false,   18::numeric),
    /* Material, real, and BEFORE the room's first matched takedown: ordinary
       pre-plan-era history. A date-anchored check flags this; the floor-free
       anchor does not. */
    ('F1', current_date-200, true,  1040::numeric),
    ('F2', current_date-150, true,  1050::numeric))
  as t(flower_room, takedown_start, is_material, plants);

/* --- materiality exclusion ------------------------------------------------ */

create or replace view tg_fx_pos_materiality.v_schedule_compliance as
  select * from (values
    ('Pull', 1, 'F3', current_date-100, current_date-95),
    ('Pull', 2, 'F3', current_date-40,  current_date-38))
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_pos_materiality.v_harvest_takedown as
  select * from (values
    ('F3', current_date-95, true,  1088::numeric),
    /* 18 plants, INSIDE the matched era. Silently excluded from every schedule
       surface. Somebody has to confirm it is scrap. */
    ('F3', current_date-60, false,   18::numeric),
    ('F3', current_date-38, true,  1140::numeric))
  as t(flower_room, takedown_start, is_material, plants);
create or replace view tg_fx_pos_materiality.harvest_alert_rules as
  select * from (values ('takedown_min_plants',100::numeric,true))
  as t(rule_key, threshold, active);

create or replace view tg_fx_neg_materiality.v_schedule_compliance as
  select * from (values
    ('Pull', 1, 'F4', current_date-100, current_date-95),
    ('Pull', 2, 'F4', current_date-40,  current_date-38))
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_neg_materiality.v_harvest_takedown as
  select * from (values
    ('F4', current_date-95,  true,  1049::numeric),
    ('F4', current_date-38,  true,  1036::numeric),
    /* The real F4 scrap pull of 6 Jun 2024: 18 plants, two years before the plan
       era. Reporting it would put a permanent finding on the board for something
       nobody can act on, and the assertion would be ignored inside a week. */
    ('F4', current_date-800, false,   18::numeric),
    /* A room with no matched pulls at all -- min() over an empty set is NULL, and
       a careless comparison against NULL flags every one of its takedowns. */
    ('F9', current_date-50,  false,   12::numeric))
  as t(flower_room, takedown_start, is_material, plants);
create or replace view tg_fx_neg_materiality.harvest_alert_rules as
  select * from tg_fx_pos_materiality.harvest_alert_rules;

/* --- plant count present -------------------------------------------------- */

create or replace view tg_fx_pos_plantcount.metrc_harvests as
  select * from (values
    (1, 'TG Blue Dream - 20260210 F1', 'F1', current_date-100,
     '{"TotalWetWeight": 4000}'::jsonb),                       -- key absent entirely
    (2, 'TG Gelato - 20260212 F1',     'F1', current_date-98,
     '{"PlantCount": null}'::jsonb),                           -- present and null
    (3, 'TG Runtz - 20260214 F2',      'F2', current_date-96,
     '{"PlantCount": "N/A"}'::jsonb),                          -- present, not a number
    (4, 'TG Zkittlez - 20260216 F2',   'F2', current_date-94,
     '{"PlantCount": "0"}'::jsonb))                            -- present, zero
  as t(id, name, flower_room, harvest_start, raw);

create or replace view tg_fx_neg_plantcount.metrc_harvests as
  select * from (values
    (1, 'TG Blue Dream - 20260210 F1', 'F1', current_date-100,
     '{"PlantCount": 1140}'::jsonb),                           -- ordinary integer
    (2, 'TG Gelato - 20260212 F1',     'F1', current_date-98,
     '{"PlantCount": "0018"}'::jsonb),                         -- leading zeros, still 18
    (3, 'TG Runtz - 20260214 F2',      'F2', current_date-96,
     '{"PlantCount": 287.5}'::jsonb),                          -- fractional, still a count
    /* THE ROW THAT MATTERS. Eight 2024 harvests carry no room at all: the
       generator returns NULL and they are outside the schedule match entirely.
       Their PlantCount is irrelevant and flagging them would be eight permanent
       false alarms. */
    (4, 'TG Unknown Legacy Harvest',   null,  current_date-800,
     '{"TotalWetWeight": 900}'::jsonb),
    /* Classified but never started -- no harvest_start, so it is in no cluster. */
    (5, 'TG Pending - F3',             'F3',  null::date,
     '{"PlantCount": null}'::jsonb))
  as t(id, name, flower_room, harvest_start, raw);

do $mig$
declare s text; r text;
begin
  foreach s in array array['tg_fx_pos_ordinal','tg_fx_neg_ordinal',
                           'tg_fx_pos_materiality','tg_fx_neg_materiality',
                           'tg_fx_pos_plantcount','tg_fx_neg_plantcount'] loop
    execute format('revoke all on schema %I from anon, authenticated', s);
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname = s loop
      execute format('revoke all on %I.%I from anon, authenticated', s, r);
    end loop;
  end loop;
end $mig$;

/* ---------------------------------------------------------------------------
 * THE REWRITTEN ASSERTION.
 * ------------------------------------------------------------------------- */

update public.data_assertion set
  what_it_proves =
    'That the ordinal plan-to-actual link the surfaces publish still holds: every material '
    'takedown inside a room''s matched era is claimed by exactly one pull, and no published '
    'pair is further apart than a real delay could explain. It reads what v_schedule_compliance '
    'actually published rather than re-deriving the match, so it cannot drift away from the '
    'surface it guards.',
  why_it_matters =
    'Ordinal matching replaced a room-blind date window that understated lateness on every pull '
    '-- 43 published days against 210 real. It is correct but it has its own silent failure: one '
    'unplanned takedown, or one takedown pulled into the era by a tolerance change, shifts every '
    'later pull onto the wrong harvest with no error raised anywhere. Measured 13 Aug 2026: '
    'moving early_allowance_days from 3 to 14 drops the published total from 210 days to 150 and '
    'flips four pulls from LATE to EARLY. The earlier version of this assertion stayed silent '
    'through that, because its population was anchored to a hardcoded January literal and did not '
    'move when the view''s did.',
  violation_sql = $sql$
with bound as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'ordinal_match_max_divergence_days' and har.active), 45)::int as d
), matched as (
  /* What the surface ACTUALLY published. Not a re-derivation of it. */
  select s.room, s.actual_date
  from v_schedule_compliance s
  where s.event_type = 'Pull' and s.actual_date is not null
)
select t.flower_room || ' ' || t.takedown_start as subject,
       format('room %s came down on %s (%s plants, material) INSIDE its own matched era, and no '
              'planned pull claims it. The room''s first matched takedown was %s. An unclaimed '
              'takedown consumes an ordinal position, so every later pull for this room is '
              'matched to the wrong harvest and the published lateness is wrong in both '
              'directions at once.',
              t.flower_room, t.takedown_start, t.plants,
              (select min(m.actual_date) from matched m where m.room = t.flower_room)) as detail
from v_harvest_takedown t
where t.is_material
  and t.takedown_start > (select min(m.actual_date) from matched m where m.room = t.flower_room)
  and not exists (select 1 from matched m
                   where m.room = t.flower_room and m.actual_date = t.takedown_start)
union all
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
  fixture_shadows = array['v_harvest_takedown','v_schedule_compliance','harvest_alert_rules'],
  fixture_positive_case =
    'A material takedown sitting inside a room''s matched era that no pull claims -- the shape an '
    'unplanned or corrective harvest takes, which shifts every later pair by one. And a published '
    'pair 56 days apart: F2 pull 4 against the 29 Dec 2025 takedown, to scale, which is the exact '
    'row that appears when early_allowance_days is moved from 3 to 14.',
  fixture_negative_case =
    'A pair 26 days apart -- the largest divergence that exists in production, real lateness. A '
    'past-due pull with a NULL actual_date (in flight, and NULL must not become arithmetic). A '
    'future pull. A material takedown BEFORE the room''s first matched one, which is ordinary '
    'pre-plan-era history and which any date-anchored version of this check flags. An 18-plant '
    'scrap cluster inside the era, which the old SQL counted as a takedown and cried wolf on. And '
    'two Dry rows, one 64 days wide: actual_date on a Dry row is a deadline and not an '
    'observation, so dropping the event_type filter turns this half red on its own.',
  fixture_proven_at = null,
  fixture_last_result = 'awaiting re-proof after rewrite',
  note =
    'READS THE SURFACE, DOES NOT RE-DERIVE IT. The earlier version re-implemented the ordinal '
    'match with its own floor, which made three implementations in the database and left the '
    'guard free to disagree with both surfaces. It did: a hardcoded ''2026-01-01'' and no '
    'is_material filter. The divergence limb now reads v_schedule_compliance''s published pairs '
    'and the population limb is anchored to the room''s own first matched takedown, so neither '
    'mentions a floor. This survives tmp_per_room_floor.sql moving the floor per room onto '
    'plan_match_floor_days, which the previous version would not have. '
    'MEASURED BAND for ordinal_match_max_divergence_days: the largest legitimate divergence in '
    'production is 26 days and the F2 ordinal slip presents at 56, so any value in [26, 55] both '
    'stays quiet today and catches that slip. 45 sits near the middle. Above 55 this limb goes '
    'blind to the exact failure it was written for -- the rule''s own note says 59, which is the '
    'room-cycle length and is four days too generous.'
where assertion_key = 'harvest.ordinal_match_in_step';

/* ---------------------------------------------------------------------------
 * NEW: the materiality guard's exclusions get a voice. Agent V's catch.
 * ------------------------------------------------------------------------- */

insert into public.data_assertion
  (assertion_key, title, domain, severity, violation_sql, max_allowed,
   fixture_positive_schema, fixture_negative_schema, fixture_shadows,
   fixture_positive_case, fixture_negative_case,
   what_it_proves, why_it_matters, owner_agent, added_by, accountable_to, note)
values (
  'harvest.materiality_exclusion_needs_confirmation',
  'A takedown inside the plan era was excluded as immaterial and nobody confirmed it',
  'harvest',
  'watch',
  $sql$
with matched as (
  select s.room, s.actual_date
  from v_schedule_compliance s
  where s.event_type = 'Pull' and s.actual_date is not null
), floor_plants as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'takedown_min_plants' and har.active), 100)::numeric as p
)
select t.flower_room || ' ' || t.takedown_start as subject,
       format('room %s came down on %s with %s plant(s), below the %s-plant materiality floor, '
              'and it sits INSIDE the room''s matched era (first matched takedown %s). Every '
              'schedule surface and every ordinal assertion excludes it, so this harvested '
              'material is invisible to the plan. Confirm it is scrap or a corrective pull. If it '
              'is a genuine small takedown, the ordinal match for room %s is already one position '
              'out and the published lateness for every later pull is wrong.',
              t.flower_room, t.takedown_start, t.plants, (select p from floor_plants),
              (select min(m.actual_date) from matched m where m.room = t.flower_room),
              t.flower_room) as detail
from v_harvest_takedown t
where not t.is_material
  and t.takedown_start > (select min(m.actual_date) from matched m where m.room = t.flower_room)
$sql$,
  0,
  'tg_fx_pos_materiality', 'tg_fx_neg_materiality',
  array['v_harvest_takedown','v_schedule_compliance','harvest_alert_rules'],
  'An 18-plant cluster inside a room''s matched era, between two real 1,000-plant takedowns -- '
  'the exact shape of the 6 Jun 2024 F4 scrap pull, relocated into the plan era where it would '
  'silently consume an ordinal if it were ever counted, and silently disappear because it is not.',
  'The real F4 scrap pull two years before the plan era, which must stay quiet because nobody can '
  'act on it and a permanent finding gets the assertion ignored. Two material takedowns inside '
  'the era, which are not exclusions at all. And a room with no matched pulls whatsoever: min() '
  'over an empty set is NULL, and a careless comparison against NULL flags every takedown that '
  'room ever had.',
  'That when the materiality guard removes a harvest cluster from the schedule match, a human is '
  'told. The guard working correctly and the guard hiding a real takedown look identical from '
  'every surface in the platform.',
  'Adding is_material to the schedule match is correct and it creates a blind spot: material that '
  'falls below the floor is excluded from every surface with no trace. Today exactly one cluster '
  'in 48 falls below it and it is two years outside the plan era, so this is quiet by design. '
  'The day it is not quiet, the question -- scrap, or a real takedown we just deleted from the '
  'plan? -- is a judgement no query can make, which is why this is watch and not critical.',
  'Agent W', 'Agent W',
  'Cultivation, to confirm the cluster is scrap; Agent I if it is not',
  'Severity is WATCH deliberately. When this fires the guard is WORKING -- it is a request for '
  'confirmation, not an incident. There are 179 unread critical alerts on this platform and the '
  'fastest way to make a check worthless is to file it as the 180th. Raised by Agent V, 13 Aug '
  '2026, while reviewing the is_material change that creates the blind spot.')
on conflict (assertion_key) do nothing;

/* ---------------------------------------------------------------------------
 * NEW: the way is_material can vanish a real takedown. Agent X's catch,
 * assigned to this lane in tmp_per_room_floor.sql and unaddressed until now.
 * ------------------------------------------------------------------------- */

insert into public.data_assertion
  (assertion_key, title, domain, severity, violation_sql, max_allowed,
   fixture_positive_schema, fixture_negative_schema, fixture_shadows,
   fixture_positive_case, fixture_negative_case,
   what_it_proves, why_it_matters, owner_agent, added_by, accountable_to, note)
values (
  'harvest.takedown_plant_count_is_usable',
  'A classified harvest carries no usable PlantCount, so its takedown can vanish from the plan',
  'harvest',
  'critical',
  $sql$
select h.id::text as subject,
       format('%s (room %s, started %s) carries PlantCount %s. is_material is computed from the '
              'SUM of PlantCount across the whole cluster and coalesces a missing sum to zero, so '
              'a missing or unparseable count drags the cluster toward zero and can flip '
              'is_material to FALSE. A false is_material removes the takedown from both schedule '
              'surfaces with no error anywhere -- the view comment states that a takedown never '
              'vanishes, and this is the one way it can.',
              h.name, h.flower_room, h.harvest_start,
              coalesce('"' || (h.raw ->> 'PlantCount') || '"', 'ABSENT')) as detail
from metrc_harvests h
where h.flower_room is not null
  and h.harvest_start is not null
  and coalesce(
        case when btrim(coalesce(h.raw ->> 'PlantCount', '')) ~ '^[0-9]+(\.[0-9]+)?$'
             then (h.raw ->> 'PlantCount')::numeric end, 0) <= 0
$sql$,
  0,
  'tg_fx_pos_plantcount', 'tg_fx_neg_plantcount',
  array['metrc_harvests'],
  'Four ways the count goes missing, all of which coalesce to zero and none of which raises an '
  'error: the key absent from raw entirely, the key present and JSON null, the key holding "N/A", '
  'and the key holding "0". A check testing only for NULL catches one of the four.',
  'A plain integer, a count with leading zeros ("0018" is 18, not a defect), and a fractional '
  'count, all legitimate. An unclassified 2024 harvest with no flower_room -- the eight legacy '
  'rows the room generator returns NULL for are in no cluster and no schedule match, so their '
  'count is irrelevant and flagging them would be eight permanent false alarms. And a classified '
  'row with no harvest_start, which belongs to no takedown cluster either.',
  'That every harvest row which can influence a takedown''s materiality actually carries a count '
  'that can be read as a number greater than zero.',
  'is_material decides whether a takedown is matched to the plan at all. It is derived from '
  'PlantCount with a coalesce to zero, so absent data and a genuinely tiny harvest are '
  'indistinguishable to it, and the failure is silent in the direction that deletes a real '
  'takedown from the schedule. Agent X raised this while rejecting DBI-114 and named it as this '
  'lane''s to fix. Measured 13 Aug 2026: 0 of the classified harvest rows are affected and every '
  'takedown runs 981-1,140 plants against a floor of 100, so the margin is wide today. A wide '
  'margin is not a guard -- that was the argument for the date window too.',
  'Agent W', 'Agent W',
  'Agent M (Ledger & Imports) for the sync that writes raw; Agent I if the shape has changed',
  'The cast is guarded by a regex tested in the same CASE expression rather than relying on '
  'left-to-right evaluation, which Postgres does not promise. Written as a source-row assertion '
  'rather than a cluster assertion on purpose: by the time the cluster reads zero the individual '
  'row that caused it is no longer identifiable, and a finding nobody can act on is a finding '
  'nobody actions.')
on conflict (assertion_key) do nothing;

/* ---------------------------------------------------------------------------
 * The registry mirror. Both halves named, per trg_require_fixture.
 * ------------------------------------------------------------------------- */

insert into public.checker_registry
  (checker_key, title, tier, runs_where, expected_interval, subject_kind,
   fixture_proves_it_fails, fixture_selftest_fn, fixture_positive_case, fixture_negative_case,
   enabled, note)
values
  ('assert.harvest.materiality_exclusion_needs_confirmation',
   'A takedown excluded as immaterial inside the plan era is reported for confirmation',
   'detect', 'cron assert-run', interval '1 hour', 'data', true,
   'f_prove_data_assertion(''harvest.materiality_exclusion_needs_confirmation'')',
   'An 18-plant cluster inside a room''s matched era, between two real takedowns.',
   'The real 2024 scrap pull outside the plan era; two material takedowns inside it; and a room '
   'with no matched pulls at all, where min() returns NULL.',
   true,
   'Watch severity by design: when this fires the guard is working and a human is being asked to '
   'confirm, not alerted to an incident.'),
  ('assert.harvest.takedown_plant_count_is_usable',
   'Every classified harvest carries a PlantCount that reads as a positive number',
   'detect', 'cron assert-run', interval '1 hour', 'data', true,
   'f_prove_data_assertion(''harvest.takedown_plant_count_is_usable'')',
   'PlantCount absent, JSON null, "N/A" and "0" -- four routes to a zero sum, none of them an error.',
   'Plain, leading-zero and fractional counts; the eight unclassified legacy harvests with no '
   'room; and a classified row with no harvest_start.',
   true,
   'Closes the silent-vanish route Agent X named in tmp_per_room_floor.sql: a missing count makes '
   'is_material false and drops a real takedown from the schedule match with no error.')
on conflict (checker_key) do nothing;

update public.checker_registry set
  fixture_positive_case =
    'A material takedown inside a room''s matched era that no pull claims, and a published pair 56 '
    'days apart -- the row that appears when early_allowance_days moves from 3 to 14.',
  fixture_negative_case =
    'A 26-day divergence (the largest real one in production), a NULL actual_date, a future pull, '
    'pre-plan-era history, an 18-plant scrap cluster, and two Dry rows one of which is 64 days wide.',
  note =
    'Reads v_schedule_compliance''s published pairs rather than re-deriving the ordinal match. '
    'Measured band for the divergence bound is [26, 55]: 26 is the largest legitimate divergence '
    'in production and the F2 ordinal slip presents at 56. 45 sits near the middle. The rule''s '
    'own note says the ceiling is 59, which is the room-cycle length and four days too generous.'
where checker_key = 'assert.harvest.ordinal_match_in_step';
