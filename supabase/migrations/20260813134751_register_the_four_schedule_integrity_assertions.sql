/* The four schedule-integrity assertions themselves. Agent W, 13 Aug 2026.
   The 2026 lower bound is not mine — it mirrors, character for character, the
   window v_schedule_compliance and v_harvest_plan_vs_actual already use. An
   assertion that models the system differently from the system is the exact
   defect this lane exists to prevent, so the hardcoded year is inherited
   deliberately and raised separately as work for the view owner. */

insert into data_assertion (
  assertion_key, title, domain, severity, violation_sql,
  fixture_positive_schema, fixture_negative_schema, fixture_shadows,
  fixture_positive_case, fixture_negative_case,
  what_it_proves, why_it_matters, owner_agent, note)
values
(
  'harvest.ordinal_match_in_step',
  'The nth-pull-to-nth-takedown match has slipped out of step',
  'harvest', 'critical',
$sql$
with bound as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'ordinal_match_max_divergence_days' and har.active), 45)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq
  from v_harvest_takedown t where t.takedown_start >= '2026-01-01'
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq
  from harvest_pulls p
)
select r.flower_room as subject,
       format('room %s has %s takedown(s) but only %s pull(s) past due — %s extra. '
              'Every ordinal match after the extra one is shifted by one takedown.',
              r.flower_room, r.takedowns, r.past_due, r.takedowns - r.past_due) as detail
from (
  select f.flower_room,
    (select count(*) from harvest_pulls p2
      where p2.flower_room = f.flower_room and p2.harvest_date < current_date) as past_due,
    (select count(*) from v_harvest_takedown t2
      where t2.flower_room = f.flower_room and t2.takedown_start >= '2026-01-01') as takedowns
  from (select distinct p3.flower_room from harvest_pulls p3) f
) r
where r.takedowns > r.past_due
union all
select 'pull ' || p.pull_no as subject,
       format('room %s pull %s planned %s is matched to the takedown of %s at ordinal %s — '
              '%s days apart, past the %s-day bound. No room cycle observed is shorter than '
              '59 days and no real pull has ever diverged by more than 26, so a gap this '
              'wide is the ordinal having slipped, not late work.',
              p.flower_room, p.pull_no, p.harvest_date, t.takedown_start, p.seq,
              abs(t.takedown_start - p.harvest_date), b.d) as detail
from pn p
join td t on t.flower_room = p.flower_room and t.seq = p.seq
cross join bound b
where abs(t.takedown_start - p.harvest_date) > b.d
$sql$,
  'tg_fx_pos_ordinal', 'tg_fx_neg_ordinal',
  array['harvest_pulls','v_harvest_takedown','harvest_alert_rules'],
  'A room carrying three takedowns against two past-due pulls — one unplanned or duplicated '
  'takedown, which silently shifts every later pair by one. And a matched pair 60 days apart, '
  'which is a full room cycle and therefore an ordinal slip rather than lateness.',
  'A room with three past-due pulls and three takedowns diverging by 8, 20 and 26 days. '
  '26 days is the largest divergence that actually exists in production — real, legitimate '
  'lateness. And a room with four pulls of which two are still in the future against two '
  'takedowns, because more pulls than takedowns is the normal state of a plan year.',
  'That the positional plan-to-actual link still lines up: no room has produced more '
  'takedowns than it has past-due pulls, and no matched pair is further apart than a real '
  'delay could explain.',
  'Matching by ordinal replaced matching by date window, which understated lateness on '
  'every single pull — 43 published days against 210 real. Ordinal matching is correct but '
  'it has its own silent failure: one unplanned takedown shifts every later pull onto the '
  'wrong harvest, with no error raised anywhere. Nothing else in the platform would say so.',
  'Agent W',
  'The 2026 lower bound mirrors the production views verbatim rather than improving on it. '
  'When those views stop hardcoding the year, this assertion must follow in the same change.'
),
(
  'harvest.no_unmatched_takedown',
  'A room takedown belongs to no planned pull',
  'harvest', 'elevated',
$sql$
with td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq
  from v_harvest_takedown t where t.takedown_start >= '2026-01-01'
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq
  from harvest_pulls p
)
select t.flower_room || ' takedown ' || t.seq as subject,
       format('room %s came down on %s at ordinal %s, and the room has only %s planned '
              'pull(s) in total. This is real harvested material with no plan behind it. '
              'It is not swallowed by the join; it is named here.',
              t.flower_room, t.takedown_start, t.seq,
              (select count(*) from harvest_pulls p2 where p2.flower_room = t.flower_room)) as detail
from td t
left join pn p on p.flower_room = t.flower_room and p.seq = t.seq
where p.pull_no is null
$sql$,
  'tg_fx_pos_unmatched', 'tg_fx_neg_unmatched',
  array['harvest_pulls','v_harvest_takedown'],
  'A room with one planned pull and two takedowns. The second takedown matches no ordinal '
  'and under a plain inner join would simply vanish from every surface.',
  'A room with four planned pulls, two of them still in the future, against two takedowns. '
  'Every takedown has a pull; the surplus is on the PLAN side, which is what an unfinished '
  'year looks like. A check that merely compared the two counts would fire on all four '
  'rooms every day until December.',
  'That every takedown the facility recorded is attached to a planned pull, so harvested '
  'material cannot disappear between the plan and the actuals.',
  'The ordinal join is a LEFT JOIN from the plan side. A takedown with no pull at its '
  'ordinal is silently dropped: the material exists, it was harvested, and no surface in '
  'the platform mentions it. That is the same class of invisibility as the original defect.',
  'Agent W', null
),
(
  'harvest.no_room_stands_past_its_pull',
  'A flower room is past its scheduled pull with no takedown at all',
  'harvest', 'critical',
$sql$
with od as (
  select coalesce((select har.threshold from harvest_alert_rules har
                    where har.rule_key = 'pull_overdue_days' and har.active), 2)::int as d
), td as (
  select t.flower_room, t.takedown_start,
         row_number() over (partition by t.flower_room order by t.takedown_start) as seq
  from v_harvest_takedown t where t.takedown_start >= '2026-01-01'
), pn as (
  select p.pull_no, p.harvest_date, p.flower_room,
         row_number() over (partition by p.flower_room order by p.harvest_date) as seq
  from harvest_pulls p
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
left join td t on t.flower_room = p.flower_room and t.seq = p.seq
cross join od
where t.takedown_start is null
  and p.harvest_date < current_date - od.d
$sql$,
  'tg_fx_pos_standing', 'tg_fx_neg_standing',
  array['harvest_pulls','v_harvest_takedown','harvest_alert_rules'],
  'A room 31 days past its scheduled pull with no takedown at that ordinal — F4''s exact '
  'position on 13 Aug 2026, which the old view published as "3 days early".',
  'Three rooms that legitimately have no takedown: one whose pull is still in the future, '
  'one a single day past and inside the owner''s two-day tolerance, and one a hundred days '
  'back that DID come down, 26 days late. None is a crisis and none may be reported as one.',
  'That no room is standing past its scheduled pull without a harvest, and that the age of '
  'any such room is stated and escalates as it grows.',
  'This is the single most expensive fact in the data and no instrument was watching for it. '
  'F4 was 31 days overdue with zero harvests and the published surface read "3 days early", '
  'because a date-window join found another room''s takedown and min() took the earliest. '
  'A room that never comes down costs a full cycle of capacity and says nothing.',
  'Agent W',
  'The threshold and the critical severity are both the owner''s own recorded values on the '
  'pull_overdue_days rule, not this agent''s judgement. The escalation bands sit in the '
  'detail text so one room, one finding — not a new critical alert per room per day.'
),
(
  'harvest.compliance_surfaces_agree',
  'v_schedule_compliance and v_harvest_plan_vs_actual disagree about a pull',
  'harvest', 'critical',
$sql$
select coalesce(sc.pull_no, pva.pull_no)::text as subject,
       format('pull %s — v_schedule_compliance: room %s, planned %s, actual %s. '
              'v_harvest_plan_vs_actual: room %s, planned %s, actual %s. '
              'Two surfaces built on the same primitives are telling the owner different things.',
              coalesce(sc.pull_no, pva.pull_no),
              coalesce(sc.room, '(pull absent)'),
              coalesce(sc.scheduled_date::text, 'NULL'), coalesce(sc.actual_date::text, 'NULL'),
              coalesce(pva.flower_room, '(pull absent)'),
              coalesce(pva.planned_date::text, 'NULL'), coalesce(pva.actual_date::text, 'NULL')) as detail
from (select s.pull_no, s.room, s.scheduled_date, s.actual_date
        from v_schedule_compliance s where s.event_type = 'Pull') sc
full join (select a.pull_no, a.flower_room, a.planned_date, a.actual_date
             from v_harvest_plan_vs_actual a) pva on pva.pull_no = sc.pull_no
where sc.pull_no is null
   or pva.pull_no is null
   or sc.room           is distinct from pva.flower_room
   or sc.scheduled_date is distinct from pva.planned_date
   or sc.actual_date    is distinct from pva.actual_date
$sql$,
  'tg_fx_pos_surfaces', 'tg_fx_neg_surfaces',
  array['v_schedule_compliance','v_harvest_plan_vs_actual'],
  'One pull whose actual date differs by six days between the two surfaces, and one pull '
  'that exists on the compliance surface and not on the plan-vs-actual surface at all.',
  'Two pulls agreeing exactly, one of them carrying NULL actual_date on BOTH sides — two '
  'NULLs are agreement, not a difference. Plus the Dry rows: v_schedule_compliance is a '
  'UNION of Pull rows and Dry rows and every Dry row has a NULL pull_no, so dropping the '
  'event_type filter would report a wall of phantom disagreements while all 26 pulls agree.',
  'That the two surfaces stay reconciled pull for pull — same room, same planned date, '
  'same actual date — and not merely that they were reconciled once on the day they were '
  'rebuilt.',
  'Both surfaces were rebuilt on 13 Aug 2026 to read the same primitives and they agree on '
  'all 26 pulls today. They also agreed once before and then drifted, which is how one of '
  'them came to publish 43 late days while the other could have shown 210. Agreement on the '
  'day of the fix proves nothing about tomorrow; only a standing assertion does.',
  'Agent W', null
);
;
