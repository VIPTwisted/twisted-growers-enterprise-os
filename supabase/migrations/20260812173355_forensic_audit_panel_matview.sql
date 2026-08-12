-- Agent W, 12 Aug 2026.
-- 14 scalar aggregate rows were recomputed from scratch on EVERY Command Center
-- page load: 9,037 ms measured, five sequential scans of metrc_rpt_package_transfers,
-- an 18,824 kB external merge sort to disk. Pages READ matviews, the cron COMPUTES.
--
-- computed_at is NOT decoration. Five existing matviews carry no clock at all, so
-- their age cannot be measured, and you cannot breach a freshness SLO you have no
-- clock for. now() is the refresh transaction's timestamp, identical on all 14 rows.
create materialized view mv_forensic_audit_panel as
  select ord, kind, line, lb, usd, basis, drill, now() as computed_at
  from v_forensic_audit_panel_live;

-- Required for REFRESH ... CONCURRENTLY. Without it the refresh takes an
-- ACCESS EXCLUSIVE lock and every reader of the Command Center blocks for ~9s.
-- ord is the natural key: 14 fixed line numbers, stable across refreshes,
-- and it was already the view's sort key.
create unique index mv_forensic_audit_panel_ord on mv_forensic_audit_panel (ord);

comment on materialized view mv_forensic_audit_panel is
  'Forensic audit panel, precomputed. Read via v_forensic_audit_panel, never directly. '
  'Refreshed by cron job refresh-forensic-panel every 10 min. computed_at is the age of '
  'the COMPUTATION -- for the age of the DATA see v_forensic_panel_freshness, because a '
  'fresh computation over stale inputs is the exact failure that left the Command Center '
  'frozen for six days under a "Live from the records" header. Agent W, 12 Aug 2026.';;
