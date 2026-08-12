-- Owner-directed fix, 8 Aug 2026. The nightly self-check miscounted cron in BOTH
-- directions and so could neither be trusted nor ignored.
--
--   False positive: cron_failing counted a job whose latest run status was anything
--   other than 'succeeded'. pg_cron sets 'starting'/'running' on a job that is still
--   in flight, so the 06:40 run — the exact moment the nightly jobs cluster —
--   reported 8 jobs "failing" when none had failed.
--
--   False negative, the worse half: it only ever looked at the LATEST run. On
--   7-8 Aug refresh-tower-inventory timed out on 7 of its 48 runs and the check
--   called it healthy every time, because its most recent run happened to pass.
--
-- A watchdog that cries wolf at dawn and stays silent about a job failing one run
-- in seven is worse than no watchdog: people stop reading it.

alter table platform_state
  add column if not exists cron_failing_24h integer;

comment on column platform_state.cron_failing_24h is
  'Distinct cron jobs with at least one FAILED run in the preceding 24 hours. '
  'Counts intermittent failures that cron_failing cannot see, because cron_failing '
  'only inspects each job''s most recent run. Added 8 Aug 2026.';

comment on column platform_state.cron_failing is
  'Cron jobs whose MOST RECENT run status is exactly ''failed''. Deliberately does '
  'NOT count ''starting''/''running'' — an in-flight job is not a failure. '
  'For intermittent failures see cron_failing_24h. Corrected 8 Aug 2026.';;
