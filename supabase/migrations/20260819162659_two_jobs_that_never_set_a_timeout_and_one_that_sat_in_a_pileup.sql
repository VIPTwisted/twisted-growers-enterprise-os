/* ═══════════════════════════════════════════════════════════════════════════
   THE DIFFERENCE BETWEEN THE JOBS THAT WORK AND THE JOBS THAT DO NOT WAS ONE
   STATEMENT.

   refresh-tag-evidence has run for weeks because its command begins
   `set statement_timeout = '15min'`. refresh-reports and verification-suite set
   nothing and inherit the cron default, so both die on a timeout every run.

   MEASURED LIVE, last four hours, before this change:
     refresh-reports      8 failed  0 ok  — timeout on
                          `refresh materialized view concurrently mv_harvest_yields`
     verification-suite   3 failed  1 ok  — timeout on the stock-proof pounds sum

   verification-suite matters most of the three: tg_verify() runs the tile-drill
   contracts, so for the hours it is down NOTHING is checking that a tile agrees
   with the records behind it. That is the enforcement of rule C1, and it has
   been offline more often than not.

   Both now carry a ten-minute timeout, the same shape as the job that works.

   AND THE PILEUP. Minute 25 of every hour carried THREE jobs — assert-run,
   sync-review and refresh-tag-evidence, the last of them a fifteen-minute
   matview refresh landing on top of the data-assertion runner every hour. The
   19 Aug stagger cleared minute 0 and this survived it: the herd moved rather
   than dispersed. refresh-tag-evidence goes to :45, which is empty.

   RECORDED AS A MIGRATION even though cron.alter_job made the change, because
   alter_job writes no file and rule 6 is that what runs in production is in the
   repository. The block below is idempotent and re-applies the same settings on
   a rebuild. Direct UPDATE on cron.job is permission-denied, so alter_job is
   the only route.

   NOT YET VERIFIED. refresh-reports next fires at :35, verification-suite at
   :20. Deployed is not working: both findings stay OPEN until a run succeeds.
   ═══════════════════════════════════════════════════════════════════════════ */
do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'refresh-reports';
  if v_id is not null then
    perform cron.alter_job(v_id, command => 'set statement_timeout = ''10min''; select tg_refresh_reports()');
  end if;

  select jobid into v_id from cron.job where jobname = 'verification-suite';
  if v_id is not null then
    perform cron.alter_job(v_id, command => 'set statement_timeout = ''10min''; select count(*) from tg_verify()');
  end if;

  select jobid into v_id from cron.job where jobname = 'refresh-tag-evidence';
  if v_id is not null then
    perform cron.alter_job(v_id, schedule => '45 * * * *');
  end if;
end $$;

/* The deploy watcher: CLOSED, and closed on evidence rather than on the fact
   that a fix was applied. Agent W reported it failing 89.5% of runs, measured
   over seven days — a window that spans the 12:06 repair, so the rate is
   historically true and currently false. Since that moment: 25 runs, ZERO
   failures. The lesson is the measurement window, and it is worth keeping: a
   failure RATE across a period containing a fix will always report the fix as
   not working. */
update agent_findings
   set resolved_at = now(),
       resolution = 'CLOSED 19 Aug on evidence, not on intent. Agent W measured 128 of 143 runs failed (89.5%) over SEVEN DAYS, a window spanning the 12:06:57 repair in migration 20260819120657. Re-measured from that timestamp forward: 25 runs, 0 failures, latest 16:16. The fix did take. The finding was a measurement-window artefact — a failure rate computed across a period containing the fix reports the fix as not working — and that is the part worth remembering.'
 where fingerprint = 'w-19aug-deploy-watch-null-finding-id'
   and resolved_at is null;

/* The two timeouts stay OPEN with the action recorded. */
update agent_findings
   set detail = detail || ' [19 Aug 16:25: statement_timeout of 10min applied via cron.alter_job, matching refresh-tag-evidence which works for exactly that reason. NOT CLOSED — no run has succeeded yet. Verify by: select status, count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname = ''refresh-reports'' and d.start_time > ''2026-08-19 16:25+00'' group by status;]'
 where fingerprint = 'w-19aug-refresh-reports-100pct-fail' and resolved_at is null;

update agent_findings
   set detail = detail || ' [19 Aug 16:25: statement_timeout of 10min applied via cron.alter_job. NOT CLOSED — no run has succeeded yet. Verify the same way against jobname = ''verification-suite''.]'
 where fingerprint = 'w-19aug-verification-suite-down' and resolved_at is null;

update agent_findings
   set detail = detail || ' [19 Aug 16:25: refresh-tag-evidence moved from :25 to :45, which is empty, leaving assert-run and sync-review alone at :25. The 06:40 daily pileup of four jobs is NOT addressed here and remains open.]'
 where fingerprint = 'w-19aug-cron-stagger-did-not-hold' and resolved_at is null;