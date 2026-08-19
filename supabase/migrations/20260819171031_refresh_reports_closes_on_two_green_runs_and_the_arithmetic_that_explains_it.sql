/* ═══════════════════════════════════════════════════════════════════════════
   CLOSED ON EVIDENCE: refresh-reports.

   Two runs since the timeout was raised, both SUCCEEDED — 16:35 and 17:05 —
   and each took 205 seconds. That number is the whole finding: the job needs
   3 minutes 25 seconds and was inheriting the 2-minute cron default, so it
   could never once have finished. 48 failures in 24 hours was not a database
   under strain, it was a job given less time than the work takes.

   refresh-tag-evidence also came back green at :45 in 335 seconds, confirming
   the move off the three-job pileup at :25.

   verification-suite is NOT closed. It fires at :20 and has not run since the
   patch. Its finding stays open with the query that closes it.
   ═══════════════════════════════════════════════════════════════════════════ */
update agent_findings
   set resolved_at = now(),
       resolution = 'CLOSED 19 Aug 17:10 on two consecutive green runs (16:35, 17:05), not on the patch being applied. Each run took 205 SECONDS against an inherited 2-minute cron default, so the job was given less time than the work takes and could never have succeeded — 48 failures in 24h was a budget, not a fault. Fixed by migration 20260819162659 setting statement_timeout to 10min, the same shape as refresh-tag-evidence which has worked for weeks for exactly that reason. Verify: select status, count(*) from cron.job_run_details d join cron.job j using (jobid) where j.jobname = ''refresh-reports'' and d.start_time > ''2026-08-19 16:26+00'' group by status;'
 where fingerprint = 'w-19aug-refresh-reports-100pct-fail'
   and resolved_at is null;

/* The three matviews this job feeds still cannot state their own age. Recorded
   as its own finding rather than left inside the closed one, because the job
   working and the figures being datable are two different things and closing
   the first must not bury the second. */
insert into agent_findings
  (agent, agent_key, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
values
('Agent W - Watchdog','lane:W','elevated',
 'The three report matviews still carry no clock, now that the job feeding them works',
 'mv_harvest_yields, mv_seed_to_sale and mv_strain_census are refreshed by refresh-reports, which is green again as of 19 Aug 17:05. None of the three has a computed_at column, so every figure they serve is still of unknown age and nothing on the platform can say how old it is. A working refresh makes them CURRENT; it does not make them DATABLE, and only the second one survives someone asking when a number was true. Part of the wider finding w-19aug-matviews-no-clock, split out because these three now have a healthy refresh and so are the cheapest to close.',
 3,'matviews without a clock','mv_harvest_yields, mv_seed_to_sale, mv_strain_census',
 'Add computed_at to each and set it inside tg_refresh_reports','v_matview_freshness',
 'w-19aug-report-matviews-still-clockless')
on conflict do nothing;
