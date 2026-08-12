-- Agent W, 12 Aug 2026. Repoint the panel at the matview.
--
-- v_forensic_audit_panel is security_invoker=true, so the CALLER's privileges are
-- used against the underlying object. The new matview started with no grants, which
-- would have rendered an EMPTY panel for authenticated and tg_desktop_reader while
-- still looking perfect to postgres. Mirror the reader set exactly -- and only the
-- reader set. anon holds no SELECT on the view today and gains none here.
grant select on mv_forensic_audit_panel to authenticated, service_role, tg_desktop_reader;

-- create-or-replace only: never drop. Column names, order and types are unchanged
-- (verified against pg_attribute before this ran). ORDER BY ord is carried over from
-- the original definition -- a matview has no inherent row order, and dropping the
-- sort would have silently reordered the panel for the front end.
create or replace view v_forensic_audit_panel as
  select ord, kind, line, lb, usd, basis, drill
  from mv_forensic_audit_panel
  order by ord;

comment on view v_forensic_audit_panel is
  'Forensic audit panel as read by the Command Center. Precomputed -- reads 14 stored '
  'rows from mv_forensic_audit_panel instead of recomputing them (was 9,037 ms per page '
  'load). Figures are unchanged: verified byte-identical, md5 4459f025..., 12 Aug 2026. '
  'For the live recomputation see v_forensic_audit_panel_live; for staleness see '
  'v_forensic_panel_freshness. Agent W.';;
