-- RULE J4, owner-set 8 Aug 2026. Every alert carries Who, What, When, Where, Why, How,
-- SOLUTIONS and the guard's own FINAL RECOMMENDATION.
--
-- watchdog_findings already carried six of the eight: what, where_it_is,
-- who_is_accountable, when_it_started, why_it_matters, how_it_was_detected. Two were
-- missing, and they are the two that turn a report into something a person can act on.
--
-- WHY "SOLUTIONS" IS PLURAL, AND WHY IT IS NOT what_to_do. Rule C6b exists because the
-- watchdog's own advice read "remediate or destroy" and silently omitted selling the
-- material on for remediation - a legitimate third option worth real money. A single
-- what_to_do line reads as THE answer. A list of options makes the choice visible, and
-- makes an omitted option obvious.
alter table watchdog_findings
  add column if not exists solutions text[],
  add column if not exists guard_recommendation text;

comment on column watchdog_findings.solutions is
  'Rule J4. The available options, PLURAL where more than one exists. Not advice - a menu. '
  'C6b was born from a finding that said "remediate or destroy" and omitted selling on for '
  'remediation, steering the business away from a legitimate revenue path.';

comment on column watchdog_findings.guard_recommendation is
  'Rule J4. The guard''s own final recommendation, stated plainly, chosen from solutions. '
  'Separate from the options on purpose: the reader sees both what could be done and what '
  'the machine advises, and can disagree with the second without losing the first.';

-- Which findings are complete enough to send. Rule J4: a finding missing any element is
-- NOT FINISHED and must not go out. This names the gap per finding rather than failing
-- silently (A3).
create or replace view public.v_finding_alert_ready as
select
  f.id, f.fingerprint, f.severity, f.what, f.observed_at,
  (f.who_is_accountable   is not null and btrim(f.who_is_accountable)   <> '') as has_who,
  (f.what                 is not null and btrim(f.what)                 <> '') as has_what,
  (f.when_it_started      is not null and btrim(f.when_it_started)      <> '') as has_when,
  (f.where_it_is          is not null and btrim(f.where_it_is)          <> '') as has_where,
  (f.why_it_matters       is not null and btrim(f.why_it_matters)       <> '') as has_why,
  (f.how_it_was_detected  is not null and btrim(f.how_it_was_detected)  <> '') as has_how,
  (f.solutions is not null and array_length(f.solutions,1) >= 1)               as has_solutions,
  (f.guard_recommendation is not null and btrim(f.guard_recommendation) <> '') as has_recommendation,
  array_remove(array[
    case when f.who_is_accountable  is null or btrim(f.who_is_accountable) =''  then 'who' end,
    case when f.what                is null or btrim(f.what) =''                then 'what' end,
    case when f.when_it_started     is null or btrim(f.when_it_started) =''     then 'when' end,
    case when f.where_it_is         is null or btrim(f.where_it_is) =''         then 'where' end,
    case when f.why_it_matters      is null or btrim(f.why_it_matters) =''      then 'why' end,
    case when f.how_it_was_detected is null or btrim(f.how_it_was_detected) ='' then 'how' end,
    case when f.solutions is null or array_length(f.solutions,1) is null        then 'solutions' end,
    case when f.guard_recommendation is null or btrim(f.guard_recommendation)='' then 'recommendation' end
  ], null) as missing,
  case
    when f.who_is_accountable is null or btrim(f.who_is_accountable)=''
      or f.what is null or btrim(f.what)=''
      or f.when_it_started is null or btrim(f.when_it_started)=''
      or f.where_it_is is null or btrim(f.where_it_is)=''
      or f.why_it_matters is null or btrim(f.why_it_matters)=''
      or f.how_it_was_detected is null or btrim(f.how_it_was_detected)=''
      or f.solutions is null or array_length(f.solutions,1) is null
      or f.guard_recommendation is null or btrim(f.guard_recommendation)=''
    then false else true
  end as ready_to_send
from watchdog_findings f;

comment on view public.v_finding_alert_ready is
  'Rule J4, 8 Aug 2026. Which findings carry all eight required elements and may be sent to '
  'admins, and exactly which are missing on the ones that may not. A finding missing any '
  'element is not finished (C1 applied to findings rather than tiles).';;
