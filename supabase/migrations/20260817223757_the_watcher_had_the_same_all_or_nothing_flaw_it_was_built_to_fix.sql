/* The watcher had the same all-or-nothing flaw it was built to fix.
 *
 * Found by running it against a planted stale view, not by reading it. It aborted:
 *
 *   ERROR: 57014 canceling statement due to statement timeout
 *   CONTEXT: refresh materialized view concurrently mv_tag_evidence
 *            PL/pgSQL function tg_refresh_tag_evidence(text) line 6
 *            PL/pgSQL function f_heal_stale_matviews(text) line 16
 *
 * TWO DEFECTS, both mine, both in the fix for the original outage.
 *
 * 1. `WHEN OTHERS` DOES NOT CATCH query_canceled. Postgres deliberately excludes it so
 *    a cancel cannot be swallowed by a careless handler. Every per-view exception block
 *    in f_heal_stale_matviews and tg_refresh_dashboards was therefore blind to the one
 *    error that actually occurs here — a timeout — which is precisely the failure that
 *    took the Command dashboard down for three days. The isolation I wrote was real for
 *    every error except the only one that happens.
 *
 * 2. `set local statement_timeout` INSIDE A FUNCTION CANNOT EXTEND THE STATEMENT THAT IS
 *    ALREADY RUNNING. `select tg_refresh_tag_evidence()` is ONE statement; its timeout is
 *    fixed when it starts. The 15-minute grant I gave mv_tag_evidence never applied. It
 *    now lives on the cron job as a SEPARATE statement before the refresh, which does
 *    work, and the function no longer pretends to set it.
 *
 * Both handlers now catch query_canceled explicitly alongside others. A timeout is
 * recorded against the view that caused it and the loop continues to the next one, which
 * is what the original fix claimed to do and did not.
 */

create or replace function public.tg_refresh_tag_evidence(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t0 timestamptz := clock_timestamp();
begin
  /* No statement_timeout here. It cannot work from inside the running statement — the
     cron job sets it as its own statement before calling this. */
  begin
    refresh materialized view concurrently mv_tag_evidence;
    insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
    values ('mv_tag_evidence', t0, clock_timestamp(),
            round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
    return jsonb_build_object('ok', true,
      'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
  exception when query_canceled or others then
    insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
    values ('mv_tag_evidence', t0, clock_timestamp(),
            round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
            false, left(sqlerrm, 400), p_by);
    return jsonb_build_object('ok', false, 'error', left(sqlerrm, 300));
  end;
end $function$;

comment on function public.tg_refresh_tag_evidence(text) is
  'Refreshes mv_tag_evidence alone. Catches query_canceled explicitly — WHEN OTHERS does '
  'not catch it, which is why a timeout aborted the watcher on 17 Aug 2026. The generous '
  'statement_timeout is set by the cron job as a separate statement; it cannot be set '
  'from inside the call it needs to cover. Agent I.';

create or replace function public.tg_refresh_dashboards(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_list   text[] := array[
    'mv_department_dashboard_base', 'mv_dept_dash_supplement', 'mv_global_management',
    'mv_harvest_dry_stats', 'mv_flow_stages', 'mv_room_board'];
  m        text;
  t0       timestamptz;
  v_ok     int := 0;
  v_fail   int := 0;
  v_failed text[] := '{}';
begin
  foreach m in array v_list loop
    t0 := clock_timestamp();
    begin
      execute format('refresh materialized view concurrently %I', m);
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
      values (m, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
      v_ok := v_ok + 1;
    /* query_canceled EXPLICITLY. WHEN OTHERS does not include it, and a timeout is the
       only failure that has ever actually happened here. */
    exception when query_canceled or others then
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
      values (m, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
              false, left(sqlerrm, 400), p_by);
      v_fail := v_fail + 1;
      v_failed := v_failed || m;
    end;
  end loop;

  return jsonb_build_object(
    'refreshed', v_ok, 'failed', v_fail, 'failed_views', v_failed,
    'note', case when v_fail = 0 then 'all views current'
                 else 'One or more views are STALE and the page must say so. '
                      || 'See matview_refresh_run for the error.' end);
end $function$;

comment on function public.tg_refresh_dashboards(text) is
  'Refreshes the six fast dashboard matviews, each in its own subtransaction, catching '
  'query_canceled explicitly so a timeout cannot abort the loop — WHEN OTHERS alone does '
  'not catch it, which made the first version of this isolation ineffective against the '
  'only error that occurs. Records every attempt in matview_refresh_run. Agent I.';;
