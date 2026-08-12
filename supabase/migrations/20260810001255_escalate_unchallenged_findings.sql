-- THE LAST INCH OF THE CHALLENGER.
--
-- Everything was already built and built well: v_unchallenged_findings, v_challenge_overdue
-- with a real SLA per severity (critical 24h, elevated 72h, everything else 168h), a standing
-- column that says in plain words "OVERDUE - a critical claim nobody has tested", metric_challenges
-- to record a verdict, and tg_require_double_check guarding finding_state closure.
--
-- ONE THING WAS MISSING: nothing ever read the view. 97 findings raised, zero challenged, and
-- the queue that says so has been correct and unread the whole time.
--
-- This is the same failure as the alert sender that reported itself unconfigured hourly into
-- nowhere, and the schema dump that recorded "NOT CAPTURED: permission denied for schema cron"
-- honestly and was read by nobody. A3 makes a tool explain its own gaps; it does not make
-- anyone LOOK. This makes something look.
--
-- Measured at the moment of writing: 14 critical findings overdue, worst 72 hours past a
-- 24-hour SLA. 29 findings carry no arithmetic at all.

create or replace function public.tg_escalate_unchallenged()
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_overdue int; v_crit int; v_worst int; v_noarith int; v_run bigint; v_list text;
begin
  select count(*) filter (where standing <> 'within the window'),
         count(*) filter (where standing <> 'within the window' and severity = 'critical'),
         coalesce(max(hours_overdue) filter (where standing <> 'within the window'), 0),
         count(*) filter (where has_no_arithmetic)
    into v_overdue, v_crit, v_worst, v_noarith
  from v_challenge_overdue;

  select string_agg(what, '; ' order by hours_overdue desc)
    into v_list
  from (select what, hours_overdue from v_challenge_overdue
        where standing <> 'within the window' and severity = 'critical'
        order by hours_overdue desc limit 5) top5;

  if v_overdue = 0 then
    /* Resolve rather than leave a stale finding standing. */
    update watchdog_findings set severity = 'watch',
      what = 'Every finding has been challenged inside its window'
    where fingerprint = 'findings_unchallenged';
    return 'no findings overdue for challenge';
  end if;

  insert into watchdog_runs default values returning id into v_run;
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is,
    who_is_accountable, when_it_started, why_it_matters, how_it_was_detected, what_to_do,
    the_arithmetic, record_count, drill, search_text)
  values (v_run, 'findings_unchallenged',
    case when v_crit > 0 then 'critical' else 'elevated' end,
    v_overdue || ' finding(s) past their challenge window, ' || v_crit || ' of them critical'
      || case when v_list is not null then ' — worst: ' || left(v_list, 260) else '' end,
    'v_challenge_overdue',
    'The agent that raised the finding, and whoever owns the lane it touches',
    'The moment each finding was raised',
    'An unchallenged finding is a claim, not a fact. On 7 Aug 2026 FIVE separate conclusions '
    'were overturned within hours - "$399,000 of missing production" (the pulls ran late), '
    '"rooms are underfilled" (they were full; the count excluded fresh frozen), "2026 is behind '
    '2025" (an artifact of unfinished packaging - it is ~40% ahead), "yield rose 31%" (a '
    'packaging-ratio change), and strain price rankings (customer and timing explain 93%). '
    'EVERY CATCH WAS ACCIDENTAL. The Challenger exists to make it deliberate, and had never '
    'been run on a single finding.',
    'v_challenge_overdue applies an SLA per severity - critical 24h, elevated 72h, otherwise '
    '168h - and counts findings past it. The view has been correct and unread since it was built.',
    'Run the challenger agent over the criticals first. Record the verdict in metric_challenges: '
    'REFUTED with the alternative explanation, SURVIVES WITH LIMITS naming the scope and sample, '
    'or CANNOT BREAK IT listing which attacks were run. Never soften a REFUTED to be agreeable.',
    v_overdue || ' overdue, ' || v_crit || ' critical, worst ' || v_worst || ' hours past its window; '
      || v_noarith || ' finding(s) carry no arithmetic at all',
    v_overdue, 'settings', 'challenger unchallenged findings overdue')
  on conflict (fingerprint) where (fingerprint is not null) do update set
    severity = excluded.severity, what = excluded.what,
    the_arithmetic = excluded.the_arithmetic, record_count = excluded.record_count,
    run_id = excluded.run_id;

  return v_overdue || ' overdue (' || v_crit || ' critical), finding raised';
end $function$;

comment on function public.tg_escalate_unchallenged() is
  'Reads v_challenge_overdue and raises a watchdog finding when findings pass their challenge '
  'SLA. The queue was built, correct, and unread - 97 findings raised and zero ever challenged. '
  'A3 makes a tool explain its gaps; it does not make anyone look. This looks.';;
