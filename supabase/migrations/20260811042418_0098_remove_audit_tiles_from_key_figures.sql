-- ---------------------------------------------------------------------------
-- 0098 — Take the forensic audit OUT of the Key Figures tile grid.
--
-- Owner, seeing it live: "THIS GENUINELY SUCKS ... EVERYTHING GETS LOST TOO, NO ONE
-- WANTS TO FEEL LIKE THEY ARE READING 100 TILES ... THIS BELONGS UNDER FINANCE/TAX".
--
-- He is right. I added ten tiles to a grid that already had eight, and the result is
-- eighteen identical cards where nothing stands out and the audit reads as noise.
-- A tile grid is for a handful of headline figures. An audit is a schedule and needs
-- to be read down a column.
--
-- So mv_department_dashboard goes back to EXACTLY its original content -- the base
-- tiles and nothing else. The audit content keeps its own CFO section, driven by
-- v_forensic_audit_panel, which is where it should have gone in the first place.
-- The tile matviews are left in place (unused by the dashboard) so nothing that may
-- reference them breaks, and so this is reversible.
-- ---------------------------------------------------------------------------
create or replace view mv_department_dashboard as
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_department_dashboard_base;

comment on view mv_department_dashboard is
  'The Key Figures tile grid — BASE TILES ONLY. Forensic audit figures were added '
  'here on 11 Aug 2026 and taken out the same day: eighteen identical cards buried '
  'everything. Audit content lives in its own CFO section via v_forensic_audit_panel. '
  'Do not add tiles here without asking — the grid is for a handful of headline '
  'figures, not a report.';

-- keep the refresh honest: the audit matviews are no longer part of the dashboard
create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_tag_certificate;
  refresh materialized view concurrently mv_tag_harvest_link;
  refresh materialized view concurrently mv_harvest_certificate;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;
;
