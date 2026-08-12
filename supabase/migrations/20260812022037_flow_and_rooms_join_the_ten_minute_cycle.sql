-- Agent I (Database COO), 12 Aug 2026. DBI-040 (reviewers V, X, W).
-- Owner: Command Center takes 15 SECONDS to load. The remaining live-computed page sections:
-- v_flow_stages recomputes v_stock_on_hand FIVE times per load (one per stage) plus a plant
-- count and the harvest-room walk; v_room_board recomputes rings and schedule per load. Same
-- disease, same cure as DBI-038/039: page loads read tables; the 10-minute cycle computes.
-- Front-end fetch parallelism and the toolbar/bottom-bar redesign are Agent B's half of the
-- 15 seconds - ordered separately. Target after both halves: under 2 seconds, measured.
-- UNDO: drop materialized view mv_flow_stages; drop materialized view mv_room_board;
--       restore tg_refresh_dashboards from global_band_and_period_story_read_matviews.

create materialized view if not exists public.mv_flow_stages as
select * from v_flow_stages;

create unique index if not exists mv_flow_stages_uq on public.mv_flow_stages (stage_no);

comment on materialized view public.mv_flow_stages is
 'The Seed-to-Sale strip, precomputed. v_flow_stages recomputes v_stock_on_hand five times per '
 'page load - part of the 15-second Command load measured 12 Aug 2026. Page reads THIS; drills '
 'still go to v_stock_proof live, because a drill is one user opening one population, not every '
 'user on every load.';

create materialized view if not exists public.mv_room_board as
select * from v_room_board;

create unique index if not exists mv_room_board_uq on public.mv_room_board (room);

comment on materialized view public.mv_room_board is
 'Room rings, precomputed on the 10-minute cycle. A ring that is 10 minutes old is '
 'indistinguishable to a human from a live one - a 15-second page is not.';

create or replace function public.tg_refresh_dashboards()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view concurrently mv_dept_dash_supplement;
  refresh materialized view concurrently mv_global_management;
  refresh materialized view concurrently mv_harvest_dry_stats;
  refresh materialized view concurrently mv_flow_stages;
  refresh materialized view concurrently mv_room_board;
end $function$;

comment on function public.tg_refresh_dashboards() is
 'The 10-minute dashboard cycle, six matviews, all CONCURRENTLY: base tiles, supplement tiles, '
 'global band, harvest dry stats, flow strip, room board. THE RULE: every dashboard-facing '
 'derivation joins this cycle. Live computation on page load produced two statement timeouts '
 'and a 15-second Command load on 12 Aug 2026.';;
