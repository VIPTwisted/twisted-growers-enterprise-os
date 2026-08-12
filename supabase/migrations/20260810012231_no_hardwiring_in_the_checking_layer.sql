-- OWNER, 9 Aug 2026: "NO HARDWIRING." Rule G1, and I broke it inside the very machinery
-- built to enforce the standard. Two literals were frozen into code where a person may
-- reasonably need to change them:
--
--   tg_verification_checks_sane()  v_runs >= 10   how many runs before "never agreed"
--                                                 counts as CANNOT PASS
--   v_challenge_overdue            24 / 72 / 168  the challenge SLA per severity
--
-- Neither is a law of nature. If a check runs hourly, ten runs is half a day; if it runs
-- weekly, ten runs is two months. And a business that wants criticals challenged within
-- four hours cannot say so without a deploy. Config is rows, never code.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('check_cannot_pass_min_runs', 10, 'runs',
   'Runs before a never-agreeing check is called broken',
   'How many times a verification check must run without ever agreeing before the auditor calls it CANNOT PASS. Below this it may simply be a bad week rather than a broken check.',
   'Chosen 9 Aug 2026 to be long enough to distinguish a persistent structural condition from a run of genuine failures. Ten runs of a 20-minute check is a few hours; of a nightly check, a fortnight.',
   'Agent - owner may change', 'owner_set',
   'Raise it if checks are being called broken too eagerly; lower it to catch a permanently-red check sooner.'),
  ('challenge_sla_critical_hours', 24, 'hours',
   'Hours to challenge a CRITICAL finding',
   'How long a critical finding may stand unchallenged before it is overdue. An unchallenged finding is a claim, not a fact.',
   'Owner-set default carried in v_challenge_overdue since it was written; moved out of the view into a row on 9 Aug 2026 per the no-hardwiring rule.',
   'Owner (Vinny)', 'owner_set',
   'On 7 Aug 2026 five conclusions were overturned within hours and every catch was accidental. This is how long we accept being wrong in public.'),
  ('challenge_sla_elevated_hours', 72, 'hours',
   'Hours to challenge an ELEVATED finding',
   'How long an elevated finding may stand unchallenged before it is overdue.',
   'Owner-set default carried in v_challenge_overdue; moved to a row 9 Aug 2026.',
   'Owner (Vinny)', 'owner_set', 'Three days.'),
  ('challenge_sla_default_hours', 168, 'hours',
   'Hours to challenge any other finding',
   'The challenge window for findings below elevated severity.',
   'Owner-set default carried in v_challenge_overdue; moved to a row 9 Aug 2026.',
   'Owner (Vinny)', 'owner_set', 'One week.')
on conflict (key) do update set
  value = excluded.value, unit = excluded.unit, label = excluded.label,
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  set_by = excluded.set_by, evidence_status = excluded.evidence_status,
  evidence_note = excluded.evidence_note, updated_at = now();

-- The view now reads the SLA from rows. Same columns, same order, same meaning.
create or replace view public.v_challenge_overdue as
with sla as (
  select coalesce(f_rule('challenge_sla_critical_hours'), 24)  as crit,
         coalesce(f_rule('challenge_sla_elevated_hours'),  72)  as elev,
         coalesce(f_rule('challenge_sla_default_hours'),  168)  as other
)
select u.id,
  u.severity,
  left(u.what, 90) as what,
  w.observed_at,
  round(extract(epoch from now() - w.observed_at) / 3600::numeric)::integer as hours_old,
  (case u.severity when 'critical' then s.crit when 'elevated' then s.elev else s.other end)::integer
    as owed_within_hours,
  (round(extract(epoch from now() - w.observed_at) / 3600::numeric)
    - case u.severity when 'critical' then s.crit when 'elevated' then s.elev else s.other end)::integer
    as hours_overdue,
  u.the_arithmetic is null as has_no_arithmetic,
  case
    when (extract(epoch from now() - w.observed_at) / 3600::numeric)
         <= case u.severity when 'critical' then s.crit when 'elevated' then s.elev else s.other end
      then 'within the window'
    when u.severity = 'critical'
      then 'OVERDUE - a critical claim nobody has tested'
    else 'overdue'
  end as standing
from v_unchallenged_findings u
join watchdog_findings w on w.id = u.id
cross join sla s
order by
  ((extract(epoch from now() - w.observed_at) / 3600::numeric)
    > case u.severity when 'critical' then s.crit when 'elevated' then s.elev else s.other end) desc,
  case u.severity when 'critical' then 0 when 'elevated' then 1 else 2 end,
  w.observed_at;

comment on view public.v_challenge_overdue is
  'Unchallenged findings against the challenge SLA. The SLA is read from conversion_factors '
  'via f_rule() - challenge_sla_critical_hours / _elevated_hours / _default_hours - and is NOT '
  'frozen into this view (rule G1, owner: "NO HARDWIRING", 9 Aug 2026). The standing column '
  'separates genuinely overdue findings from those still inside their window; reading the row '
  'count alone overstates the problem.';;
