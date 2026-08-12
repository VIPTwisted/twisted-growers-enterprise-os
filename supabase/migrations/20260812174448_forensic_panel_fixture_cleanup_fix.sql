-- Agent W, 12 Aug 2026. Fixture cleanup was comparing detected_at (which defaults to
-- now() = TRANSACTION start) against clock_timestamp() captured later inside the same
-- transaction, so detected_at >= t0 was never true and the test row survived every run.
-- Left alone this would have dripped one resolved finding into the register per run.
-- Track the created row by id instead of guessing at a time window.
create or replace function tg_selftest_forensic_panel_freshness()
returns table(case_no int, half text, case_name text, expected text, actual text, passed boolean)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  n_after   int;
  n_open    int;
  v_test_id uuid;
begin
  ---------------------------------------------------------------------------
  -- POSITIVE HALF: the check must FIRE.
  ---------------------------------------------------------------------------
  return query select 1, 'positive', 'clock 90 min old against a 30 min SLO', 'STALE',
    f_matview_freshness_verdict(now()-interval '90 minutes', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()-interval '90 minutes', now(), interval '30 minutes') = 'STALE';

  return query select 2, 'positive', 'clock 8 h old - refresh is not merely late, it is dead', 'DEAD',
    f_matview_freshness_verdict(now()-interval '8 hours', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()-interval '8 hours', now(), interval '30 minutes') = 'DEAD';

  return query select 3, 'positive', 'matview never computed at all', 'NEVER COMPUTED',
    f_matview_freshness_verdict(null, now(), interval '30 minutes'),
    f_matview_freshness_verdict(null, now(), interval '30 minutes') = 'NEVER COMPUTED';

  return query select 4, 'positive', 'computed_at in the future - a broken clock is not freshness', 'CLOCK SKEW',
    f_matview_freshness_verdict(now()+interval '10 minutes', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()+interval '10 minutes', now(), interval '30 minutes') = 'CLOCK SKEW';

  ---------------------------------------------------------------------------
  -- NEGATIVE HALF: the check must STAY QUIET.
  ---------------------------------------------------------------------------
  return query select 5, 'negative', 'refreshed 5 min ago - the normal healthy state', 'ok',
    f_matview_freshness_verdict(now()-interval '5 minutes', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()-interval '5 minutes', now(), interval '30 minutes') = 'ok';

  return query select 6, 'negative', 'BOUNDARY 29 min 59 s - one second inside the SLO must not fire', 'ok',
    f_matview_freshness_verdict(now()-interval '29 minutes 59 seconds', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()-interval '29 minutes 59 seconds', now(), interval '30 minutes') = 'ok';

  return query select 7, 'negative', 'BOUNDARY exactly 30 min - not yet OVER the SLO', 'ok',
    f_matview_freshness_verdict(now()-interval '30 minutes', now(), interval '30 minutes'),
    f_matview_freshness_verdict(now()-interval '30 minutes', now(), interval '30 minutes') = 'ok';

  ---------------------------------------------------------------------------
  -- WIRING: does the checker actually WRITE and actually CLEAR?
  ---------------------------------------------------------------------------
  select count(*) into n_open from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;

  if n_open > 0 then
    return query select 8, 'positive','end to end: forced breach files a finding',
      'SKIPPED','a real forensic_panel_stale finding is already open', true;
    return query select 9, 'positive','end to end: recovery clears the finding',
      'SKIPPED','a real forensic_panel_stale finding is already open', true;
    return query select 10,'negative','end to end: healthy SLO files nothing',
      'SKIPPED','a real forensic_panel_stale finding is already open', true;
    return;
  end if;

  -- 8. POSITIVE end to end. SLO of zero => any positive age breaches. Deterministic.
  perform tg_check_forensic_panel_freshness('selftest', interval '0');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 8, 'positive','end to end: forced breach files a finding',
    '1 open finding', n_after||' open finding(s)', n_after = 1;

  -- capture the row THIS run created, so cleanup is exact rather than time-guessed
  select f.id into v_test_id from agent_findings f
   where f.fingerprint='forensic_panel_stale' and f.resolved_at is null
   order by f.detected_at desc limit 1;

  -- 9. POSITIVE end to end: recovery must CLEAR it.
  perform tg_check_forensic_panel_freshness('selftest', interval '10 years');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 9, 'positive','end to end: recovery clears the finding',
    '0 open findings', n_after||' open finding(s)', n_after = 0;

  -- 10. NEGATIVE end to end: a healthy panel must file NOTHING.
  perform tg_check_forensic_panel_freshness('selftest', interval '10 years');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 10,'negative','end to end: healthy SLO files nothing',
    '0 open findings', n_after||' open finding(s)', n_after = 0;

  -- put it back, exactly
  if v_test_id is not null then
    delete from agent_findings where id = v_test_id;
  end if;
end;
$function$;

-- remove the row the previous, broken cleanup left behind
delete from agent_findings
 where fingerprint='forensic_panel_stale'
   and resolution like '%Cleared by selftest.%';;
