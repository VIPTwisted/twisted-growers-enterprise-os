-- Measured 14 Sep 2026 02:25 UTC: one tag through f_package_360 took 23 s — v_package_dossier 10.2 s,
-- v_tag_lifecycle 5.9 s, v_tag_gap 3.8 s, v_package_events 2.5 s — because those views compute every tag and
-- filter last. PostgREST cancels at its statement timeout, so the page showed "canceling statement". The four
-- heavy sources are materialised (mv_package_dossier, mv_tag_lifecycle, mv_tag_gap, mv_package_events — created
-- 14 Sep 02:40 UTC; their DDL is recorded in the companion migration claude_package_360_matview_ddl because the
-- migration runner's empty search_path could not inline f_all_ours/f_any_ours; those three functions now pin
-- search_path = public). Refreshed every 15 minutes here; the healer keeps them within 20 minutes; the page
-- states each as-of. The nine light sources stay live.
create or replace function public.tg_refresh_package_360(p_by text default 'cron') returns jsonb
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v text; t0 timestamptz; out jsonb := '[]'::jsonb; err text;
begin
  foreach v in array array['mv_package_dossier','mv_tag_lifecycle','mv_tag_gap','mv_package_events'] loop
    t0 := clock_timestamp(); err := null;
    begin
      execute format('refresh materialized view concurrently public.%I', v);
    exception when query_canceled or others then err := left(sqlerrm, 400);
    end;
    insert into public.matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
    values (v, t0, clock_timestamp(), round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, err is null, err, p_by);
    out := out || jsonb_build_object('matview', v, 'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, 'error', err);
  end loop;
  return out;
end $$;
insert into public.matview_heal_policy (matview, max_age, refresh_fn, heals_per_day_ok, why, active)
values
 ('mv_package_dossier', interval '20 minutes', 'tg_refresh_package_360', 96, 'Package 360: the dossier view computes every tag (10 s); the page reads this and states its as-of.', true),
 ('mv_tag_lifecycle',   interval '20 minutes', 'tg_refresh_package_360', 96, 'Package 360: lifecycle view computes every tag (6 s).', true),
 ('mv_tag_gap',         interval '20 minutes', 'tg_refresh_package_360', 96, 'Package 360: gap rules compute every tag (4 s).', true),
 ('mv_package_events',  interval '20 minutes', 'tg_refresh_package_360', 96, 'Package 360: package events compute every tag (2.5 s).', true)
on conflict (matview) do update set max_age = excluded.max_age, refresh_fn = excluded.refresh_fn, heals_per_day_ok = excluded.heals_per_day_ok, why = excluded.why, active = true;
select cron.schedule('package-360-refresh', '*/15 * * * *', $c$ set statement_timeout = '5min'; select public.tg_refresh_package_360('cron'); $c$);
insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, schedule, secrets, run_source, lane, enabled, sort, note)
values ('package_360_refresh', 'OS', 'Package 360 sources', 'Refreshes the four materialised sources behind the Package 360 page (dossier, lifecycle, gaps, events) every 15 minutes; the page states each as-of.', 'cron', 'tg_refresh_package_360', 'package-360-refresh', '*/15 * * * *', '{}', 'cron', 'Claude', true, 60, null)
on conflict (key) do update set cron_jobname = excluded.cron_jobname, schedule = excluded.schedule, what = excluded.what, updated_at = now();;
