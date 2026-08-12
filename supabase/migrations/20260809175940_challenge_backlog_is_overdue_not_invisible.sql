/* THE CHALLENGER IS A CAPABILITY WITH NO SCHEDULE, WHICH IS WHY 97 ACCUMULATED.

   Agent F, 9 August 2026, after challenging the first finding in this platform's
   history: "Nothing forces a challenge. There's no cron for it, no
   expected_every_mins, nothing marks an unchallenged critical as overdue. Your
   sentinel now watches 43 jobs; the Challenger isn't one of them, because it
   isn't a job."

   Right, and the same shape as everything else found today: the machinery
   exists, nothing makes it run, and silence reads as health.

   WHAT CANNOT BE AUTOMATED, SAID PLAINLY. A challenge is judgement. No cron can
   attack a claim, and a job that marked findings "challenged" without
   challenging them would be the exact false green this exists to remove.

   WHAT CAN. The DEADLINE. An unchallenged critical finding is not neutral - it
   is a claim nobody has tested, and past a deadline it is a claim allowed to
   stand unexamined. The brain's own index already says it: "an unchallenged
   finding has earned nothing."

   NOTHING IS WEAKENED. Owner, 9 August: "never weaken agents or guards, we always
   enhance improve and fortify ability." No check disabled, no threshold relaxed,
   no finding closed. A deadline is added to a queue that had none.

   observed_at is joined from watchdog_findings because v_unchallenged_findings
   does not carry it - and a deadline needs a start, or it is a label. */
create or replace view v_challenge_overdue as
select u.id,
       u.severity,
       left(u.what, 90)                                                   as what,
       w.observed_at,
       round(extract(epoch from (now() - w.observed_at)) / 3600)::int      as hours_old,
       case u.severity when 'critical' then 24 when 'elevated' then 72 else 168 end as owed_within_hours,
       round(extract(epoch from (now() - w.observed_at)) / 3600)::int
         - case u.severity when 'critical' then 24 when 'elevated' then 72 else 168 end as hours_overdue,
       (u.the_arithmetic is null)                                          as has_no_arithmetic,
       case
         when extract(epoch from (now() - w.observed_at)) / 3600
              <= case u.severity when 'critical' then 24 when 'elevated' then 72 else 168 end
           then 'within the window'
         when u.severity = 'critical' then 'OVERDUE - a critical claim nobody has tested'
         else 'overdue'
       end                                                                 as standing
from v_unchallenged_findings u
join watchdog_findings w on w.id = u.id
order by
  (extract(epoch from (now() - w.observed_at)) / 3600
   > case u.severity when 'critical' then 24 when 'elevated' then 72 else 168 end) desc,
  case u.severity when 'critical' then 0 when 'elevated' then 1 else 2 end,
  w.observed_at;

comment on view v_challenge_overdue is
  'Findings nobody has attacked, with a deadline on each. A challenge is JUDGEMENT and cannot be automated - no cron can refute a claim, and a job that marked findings challenged without challenging them would be the false green this removes. What IS automated is the deadline: critical claims owed a challenge within 24 hours, elevated within 72, the rest within a week. has_no_arithmetic flags the ones Agent F showed are unfalsifiable by construction - an elevated finding with null arithmetic can be neither acted on nor disproved. On 9 Aug 2026 this platform held 97 findings and had challenged none, because nothing made the silence visible.';

grant select on v_challenge_overdue to authenticated;

insert into agent_registry
  (agent_key, display_name, kind, what_it_watches, why_it_matters, owner, expected_every_mins, evidence_table, enabled)
select 'review:challenger',
       'The Challenger',
       'review',
       'Every finding raised by any agent. It attacks the claim rather than confirming it, and defaults to REFUTED so a finding must earn survival.',
       'Built 7 Aug 2026 because five conclusions were overturned in one day and EVERY catch was accidental. It then never ran: 97 findings accumulated unchallenged, and on 9 Aug the first three ever attacked produced two that did not survive as written - a room-capacity check that could not fail, and a critical "201 packages lost" that was 77% transfers in transit. A finding nobody has tested is not evidence, it is a claim.',
       'Vincent',
       1440,
       'watchdog_findings',
       true
where not exists (select 1 from agent_registry where agent_key = 'review:challenger');;
