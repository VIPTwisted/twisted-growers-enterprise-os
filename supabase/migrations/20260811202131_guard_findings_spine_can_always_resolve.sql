-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-006 (reviewers V, X, W).
--
-- THE DEFECT THIS GUARDS AGAINST, stated as the class and not the instance:
-- a branch of the findings spine that CANNOT REPRESENT RESOLUTION. v_findings hardcoded
-- NULL as resolved_at for every watchdog finding, so 174 findings could never leave the
-- open queue however thoroughly they were fixed. Four of them had been fixed for up to
-- four days and were still being routed to owners tonight.
--
-- Nothing detected it. Not the 55 checkers, not the 40 CI gates, not the hourly auditor.
-- It is invisible to every existing control because each one asks "is this finding real?"
-- and none asks "can this finding ever stop being real?" A queue that cannot record
-- "addressed" cannot distinguish a live problem from a dead one, and the real ones drown.
-- The owner's rule is that all discrepancies must be addressed; this makes "addressed"
-- representable and then verifies it stays representable.
--
-- HOW IT WORKS. Not by parsing SQL text - that is brittle and would break the first time
-- Postgres reformatted the view. It counts resolution at the source and at the spine and
-- requires them to be equal. Any branch that drops, hardcodes or mis-maps its resolution
-- column makes the spine count fall below the base-table count, and the check fires.
-- It is agnostic to how the branch breaks.
--
-- MEASURED BEFORE REGISTERING: 32 = 32 exactly (agent 10, custody 13, inventory 5,
-- watchdog 4). No deduplication loss between base tables and spine, so equality - not a
-- tolerance - is the correct test.
--
-- THE FIXTURE, BOTH HALVES, AS THE HOUSE RULE REQUIRES:
--   POSITIVE (it fires): before today's v_findings repair, source_b returned 28 while
--     source_a returned 32 - the four resolved watchdog findings were invisible to the
--     spine. 12.5% apart against a tolerance of 0. Reproduce by reverting DBI-005.
--   NEGATIVE (it stays quiet): with the repair in place both sides return 32 and the
--     check agrees. Confirmed by running it before this migration was written.
-- A check whose firing half has never been observed is a rumour. This one's has.
--
-- WHY CRITICAL. This is a control over the control plane. When it breaks, every other
-- finding in the platform silently stops being closeable, and the failure presents as
-- "we have a lot of open findings" rather than as a fault.
--
-- UNDO: delete from verification_checks where check_key = 'findings-spine-can-resolve';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'findings-spine-can-resolve',
 'Every branch of the findings spine can represent a resolved finding',
 'A finding that cannot be closed is worse than no finding: it routes forever, it inflates the '
 'open count, and it teaches everyone to ignore the queue. v_findings hardcoded resolved_at to '
 'NULL for the entire watchdog branch, making 174 findings permanently unresolvable - four of '
 'them had been fixed for four days and were still being routed. This counts resolutions at the '
 'base tables and at the spine and requires them to match, so ANY branch that drops or hardcodes '
 'its resolution column is caught, however it breaks. If this fires, do not close findings by '
 'hand and do not widen anything - find the branch whose resolution column stopped reaching the '
 'spine, because until it is fixed nothing in the platform can be marked done.',
 'Resolutions recorded in the base tables',
 'select ((select count(*) from agent_findings where resolved_at is not null)'
 ' + (select count(*) from watchdog_findings where cleared_at is not null)'
 ' + (select count(*) from custody_alert_log where resolved_at is not null)'
 ' + (select count(*) from inventory_alerts where resolved_at is not null))::numeric',
 'Resolutions visible through the spine',
 'select count(*)::numeric from v_findings where resolved_at is not null',
 0, 'critical', 'Agent W', true, date '2026-08-11', false
)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity,
  owner = excluded.owner, enabled = excluded.enabled;;
