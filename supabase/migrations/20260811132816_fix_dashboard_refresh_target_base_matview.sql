-- Agent: I  (Database COO), 11 Aug 2026. Approved by the owner.
--
-- WHY: mv_department_dashboard was refactored into a PLAIN VIEW over the matview
-- mv_department_dashboard_base. This function still refreshed the old name, so it
-- errored every 10 minutes since 01:40 on 11 Aug -- 142 failed refreshes that day
-- across cron jobs 18 and 21. The dashboard was NOT blank (43 rows), it was STALE:
-- the base matview is refreshed only by tg_snapshot_dashboards() at 05:05 daily.
-- Measured at the time of this change: computed_at 05:05, staleness 8h22m.
-- After: computed_at moved to 13:28:47, staleness 20 seconds.
--
-- The failure was silent because reads swallow errors as `?? []`, so a confidently
-- wrong number is what a manager saw. That is worse than a blank tile.
--
-- CORRECTION ON THE RECORD: the supporting claim originally attached to this fix --
-- that the "Open questions" tile read 40 against a live 48 -- WAS WRONG. open_questions
-- holds 40 open and 8 answered; the tile counts open and was correct. Withdrawn in
-- watchdog_findings and recorded in check_defect. The staleness is real and was proven
-- independently by computed_at and the cron failure count, which never needed the tile.
--
-- CONCURRENTLY is safe here: mv_dept_dash_uq is a UNIQUE index on
-- (department, kpi, ord), which the concurrent path requires.
--
-- UNDO: create or replace function public.tg_refresh_dashboards() with
--       `refresh materialized view concurrently mv_department_dashboard;`
--       No data is altered by this change, so the undo is exact.

create or replace function public.tg_refresh_dashboards()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- mv_department_dashboard is a VIEW over this matview. Refreshing the view name
  -- raises 'is not a table or materialized view'. Refresh the BASE.
  refresh materialized view concurrently mv_department_dashboard_base;
end $function$;
