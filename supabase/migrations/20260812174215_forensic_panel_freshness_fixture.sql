-- Agent W, 12 Aug 2026. The fixture. BOTH halves, or it does not ship.
--
-- POSITIVE: it fires on a real violation.
-- NEGATIVE: it stays quiet on a legitimate case.
-- All six defects in the 9 Aug register would have been caught by the negative half alone.
--
-- And it does not stop at the pure function. On 8 Aug the SQL guard passed all twenty of
-- its own fixtures while DROP TABLE watchdog_findings walked straight through, because
-- every fixture tested the predicate and none tested the WIRING. So cases 8-10 drive the
-- real checker against the real matview and the real findings table, then clean up.
create or replace function tg_selftest_forensic_panel_freshness()
returns table(case_no int, half text, case_name text, expected text, actual text, passed boolean)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  t0        timestamptz := clock_timestamp();
  n0        int;
  n_after   int;
  n_open    int;
  v_skip    boolean;
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
  -- NEGATIVE HALF: the check must STAY QUIET. A wrong label costs more than no
  -- label; 179 critical alerts sit unread because checks cried wolf.
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
  -- WIRING: does the checker actually WRITE and actually CLEAR? Fixtures that
  -- only test the predicate are how a guard passes while the thing walks through.
  ---------------------------------------------------------------------------
  select count(*) into n_open from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  v_skip := (n_open > 0);   -- a REAL finding is open; do not disturb production state

  if v_skip then
    return query select 8, 'positive', 'end to end: forced breach files a finding',
      'SKIPPED', 'a real forensic_panel_stale finding is already open', true;
    return query select 9, 'negative', 'end to end: healthy SLO files nothing',
      'SKIPPED', 'a real forensic_panel_stale finding is already open', true;
    return query select 10,'positive', 'end to end: recovery clears the finding',
      'SKIPPED', 'a real forensic_panel_stale finding is already open', true;
    return;
  end if;

  -- 8. POSITIVE end to end. SLO of zero => any positive age breaches. Deterministic.
  select count(*) into n0 from agent_findings where fingerprint='forensic_panel_stale';
  perform tg_check_forensic_panel_freshness('selftest', interval '0');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 8, 'positive', 'end to end: forced breach files a finding',
    '1 open finding', n_after||' open finding(s)', n_after = 1;

  -- 9. POSITIVE end to end: recovery must CLEAR it. Detection without closure is
  --    why the queue once reached 1,584.
  perform tg_check_forensic_panel_freshness('selftest', interval '10 years');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 9, 'positive', 'end to end: recovery clears the finding',
    '0 open findings', n_after||' open finding(s)', n_after = 0;

  -- 10. NEGATIVE end to end: a healthy panel must file NOTHING at all.
  perform tg_check_forensic_panel_freshness('selftest', interval '10 years');
  select count(*) into n_after from agent_findings
   where fingerprint='forensic_panel_stale' and resolved_at is null;
  return query select 10, 'negative', 'end to end: healthy SLO files nothing',
    '0 open findings', n_after||' open finding(s)', n_after = 0;

  -- put it back: remove only the rows this run created
  delete from agent_findings
   where fingerprint='forensic_panel_stale' and detected_at >= t0;
end;
$function$;

comment on function tg_selftest_forensic_panel_freshness is
  'Fixture for the forensic panel freshness guard. 4 positive cases, 3 negative cases, '
  '3 end-to-end wiring cases that drive the real checker and clean up after themselves. '
  'Agent W, 12 Aug 2026.';;
