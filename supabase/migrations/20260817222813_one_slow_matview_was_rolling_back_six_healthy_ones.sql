/* One slow matview was rolling back six healthy ones.
 *
 * The owner's Command dashboard read "DATA 3 DAYS OLD" while claiming to be a current
 * position. tg_refresh_dashboards() refreshed seven matviews as SEVEN STATEMENTS IN ONE
 * TRANSACTION. mv_tag_evidence — the last of them — exceeds the 2-minute cron
 * statement_timeout, so the whole transaction aborted and the other six refreshes were
 * thrown away with it. Every ten minutes. For days.
 *
 * MEASURED, by day, refresh-dashboards:
 *   06-14 Aug   0 failed of 144      healthy
 *   15 Aug    124 failed of 144      86%   <- it began here
 *   16 Aug    144 failed of 144     100%
 *   17 Aug    135 failed of 135     100%
 *   Lifetime  477 failed of 1,712
 *
 * Checked explicitly, because the package-lineage backfill earlier today populated
 * SourcePackageLabels on 14,821 rows and mv_tag_evidence walks exactly that column
 * recursively to 5 generations: the failure predates that backfill by two days. Not
 * caused by it. The backfill will have made the walk heavier and that is a reason to
 * schedule this view separately, not a reason to pretend the timing was different.
 *
 * TWO THINGS WERE WRONG AND ONLY ONE OF THEM IS SPEED.
 *
 * 1. ALL-OR-NOTHING. Six cheap matviews were held hostage by one expensive one. Each
 *    refresh now runs inside its own BEGIN/EXCEPTION block, which in plpgsql is a
 *    subtransaction: a failure rolls back only that view and the loop continues. A slow
 *    view now costs one stale view, not seven.
 *
 * 2. SILENT. 477 failures and nothing said so. The dashboard showed an age and the
 *    owner had to read it and ask. Every attempt is now recorded in
 *    matview_refresh_run with its duration and its error, and the function RETURNS a
 *    summary instead of void, so a caller that ignores the result is making a choice
 *    rather than being kept in the dark.
 *
 * mv_tag_evidence is removed from the ten-minute rotation and given its own hourly job
 * with a longer timeout. It is evidence-of-testing lineage: it does not need to be
 * ten minutes fresh, and pretending it does is what broke the six views that do.
 */

create table if not exists public.matview_refresh_run (
  id            bigint generated always as identity primary key,
  matview       text        not null,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ms            integer,
  ok            boolean     not null,
  error         text,
  run_by        text        not null default 'cron',
  constraint failure_explains_itself check (ok or error is not null)
);

create index if not exists matview_refresh_run_recent
  on public.matview_refresh_run (matview, started_at desc);

comment on table public.matview_refresh_run is
  'One row per matview refresh ATTEMPT, successful or not, with its duration and error. '
  'Created 17 Aug 2026 after 477 silent failures of refresh-dashboards left the Command '
  'dashboard three days stale while presenting itself as a current position. A refresh '
  'that fails without a record is indistinguishable from one that never ran. Agent I.';

alter table public.matview_refresh_run enable row level security;
drop policy if exists mrr_read on public.matview_refresh_run;
create policy mrr_read on public.matview_refresh_run for select to authenticated using (true);
grant select on public.matview_refresh_run to tg_desktop_reader;

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
      /* Its own subtransaction. A failure here rolls back THIS refresh and nothing
         else, which is the entire point of the change. */
      execute format('refresh materialized view concurrently %I', m);
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
      values (m, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
      v_ok := v_ok + 1;
    exception when others then
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
  'Refreshes the six fast dashboard matviews, each in its OWN subtransaction so one '
  'failure cannot roll back the others, and records every attempt in '
  'matview_refresh_run. Returns a summary rather than void. mv_tag_evidence was removed '
  'from this rotation on 17 Aug 2026 — it exceeds the 2-minute cron timeout and took the '
  'other six down with it 477 times. Agent I.';

/* Its own job, hourly, with room to finish. */
create or replace function public.tg_refresh_tag_evidence(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare t0 timestamptz := clock_timestamp();
begin
  set local statement_timeout = '15min';
  begin
    refresh materialized view concurrently mv_tag_evidence;
    insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
    values ('mv_tag_evidence', t0, clock_timestamp(),
            round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
    return jsonb_build_object('ok', true,
      'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
  exception when others then
    insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
    values ('mv_tag_evidence', t0, clock_timestamp(),
            round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
            false, left(sqlerrm, 400), p_by);
    return jsonb_build_object('ok', false, 'error', left(sqlerrm, 300));
  end;
end $function$;

comment on function public.tg_refresh_tag_evidence(text) is
  'Refreshes mv_tag_evidence alone, hourly, with a 15-minute timeout. It walks package '
  'lineage recursively to 5 generations and cannot finish inside the 2-minute cron '
  'default. Separated from tg_refresh_dashboards on 17 Aug 2026. Agent I.';;
