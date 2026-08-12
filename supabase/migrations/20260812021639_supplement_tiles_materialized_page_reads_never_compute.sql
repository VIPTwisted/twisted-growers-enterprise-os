-- Agent I (Database COO), 12 Aug 2026. DBI-038 (reviewers V, X, W).
-- The deployed Command page hung on "Reading every department..." - the global band. Cause is
-- MINE: v_dept_dash_supplement computes nine tiles live on every page load, under the browser
-- role's query budget, competing with every other section's fetch. Architecture rule violated:
-- A PAGE LOAD READS; IT NEVER COMPUTES. The base tiles are a matview refreshed every 10
-- minutes; the supplement now works exactly the same way, same cadence, same freshness
-- guarantees, and the page reads two tables.
-- UNDO: restore tg_refresh_dashboards from fix_dashboard_refresh_target_base_matview;
--       restore mv_department_dashboard from global_band_hr_sales_inventory_tiles_v2;
--       drop materialized view mv_dept_dash_supplement.

create materialized view if not exists public.mv_dept_dash_supplement as
select * from v_dept_dash_supplement;

create unique index if not exists mv_dept_dash_supplement_uq
  on public.mv_dept_dash_supplement (department, kpi);

comment on materialized view public.mv_dept_dash_supplement is
 'Materialised copy of v_dept_dash_supplement (HR, Sales & Cash, Inventory tiles added 12 Aug '
 '2026). Exists because the live view computed on page load and hung the global band - a page '
 'load reads, it never computes. Refreshed CONCURRENTLY by tg_refresh_dashboards() on the same '
 '10-minute cron as the base; the unique index is what makes CONCURRENTLY possible.';

create or replace function public.tg_refresh_dashboards()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  -- mv_department_dashboard is a VIEW over these matviews. Refreshing the view name raises
  -- 'is not a table or materialized view'. Refresh the BASES.
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view concurrently mv_dept_dash_supplement;
end $function$;

comment on function public.tg_refresh_dashboards() is
 'The 10-minute dashboard refresh (cron refresh-dashboards): base matview PLUS the supplement '
 'matview added 12 Aug 2026. Both CONCURRENTLY so readers never block. If a future tile source '
 'is added, it joins THIS cycle - live-computed tiles on page load are how the global band hung.';

create or replace view public.mv_department_dashboard as
select department, ord, kpi,
       case when kpi = 'Moisture loss not recorded' then coalesce(value, 0) else value end as value,
       unit, tone, context, drill, computed_at
from mv_department_dashboard_base
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
from mv_dept_dash_supplement;

comment on view public.mv_department_dashboard is
 'Every category dashboard tile: base matview PLUS mv_dept_dash_supplement, both refreshed every '
 '10 minutes, both plain table reads at page load. The moisture coalesce and the never-DROP-'
 'CASCADE warning still stand.';;
