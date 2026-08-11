-- Agent: I (Database COO), 11 Aug 2026.
--
-- CRON CHANGES APPLIED BY execute_sql RATHER THAN apply_migration, captured here so the
-- repository matches production (standard rule 6: what runs in production is in the
-- repository). Running this file again is harmless -- unschedule of an absent job is a
-- no-op and cron.schedule upserts by name.
--
-- 1. RETIRED cron job 21 "refresh-dept-dashboard-2".
--    It raw-refreshed mv_department_dashboard on the same */10 schedule as job 18, which
--    calls tg_refresh_dashboards(). Repointing both at the base matview would have run two
--    concurrent refreshes of one matview every ten minutes -- lock contention on a system
--    that already records statement timeouts on refresh-tower-inventory (13 in 7 days).
--    One job, one definition of what refreshing dashboards means.
--    UNDO: select cron.schedule('refresh-dept-dashboard-2','*/10 * * * *',
--            'refresh materialized view concurrently mv_department_dashboard');
--
-- 2. ADDED cron job "metrc-backfill", every 3 minutes.
--    Drives tg_metrc_backfill_next(). See 20260811154220_metrc_backfill_window_driver.sql
--    for the reasoning. The driver refuses to overlap a run already in flight, so a window
--    that takes 152s simply makes the next tick answer "waiting".
--    UNDO: select cron.unschedule('metrc-backfill');

select cron.unschedule('refresh-dept-dashboard-2')
where exists (select 1 from cron.job where jobname = 'refresh-dept-dashboard-2');

select cron.schedule('metrc-backfill', '*/3 * * * *', 'select tg_metrc_backfill_next()');
