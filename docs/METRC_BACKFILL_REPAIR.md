# Correlated Metrc backfill completion

This batch repairs completion accounting and bounded retry for existing backfill windows.
It does not change pages, styling, report layouts, vendor polling cadence or data ownership.
The normal delta/full-sweep entry points remain compatible. No Metrc write endpoint is added.

Applied release: database migration `20260911035237_metrc_backfill_exact_claim_completion`
and worker version 26. Both deployed worker files were verified against the tested source.
All eleven isolated tests passed. A controlled live attempt completed with the matching
claim and terminal run receipt; the captured backfill schedule was then restored.
The detailed operational evidence is retained in the owner's private recovery package.

## Behavior

The database reserves a sync-run ID and a unique attempt before dispatching a window.
The worker atomically claims the exact attempt, endpoint, licence and time boundaries.
A duplicate or mismatched claim fails. The driver accepts completion only from the reserved,
claimed run; it no longer guesses using the latest run number.

Every attempt retains its outcome. Partial runs and errors remain incomplete. Failed windows
may retry after the existing three-minute dispatch cadence, within the existing three-attempt
ceiling. An uncertain or missing completion stops automatic retries; a transport timeout is
not proof that the remote worker stopped. Legacy running windows without an exact attempt
also block dispatch for investigation. Existing rows labelled done are not retroactively
certified by this change.

The worker now checks that its final status was persisted and reports incomplete results
when a sub-state fails. It retains existing pagination, upsert and watermark behavior.
An explicit historical window still does not move the ordinary delta cursor.

## Validation

`tools/tests/metrc-backfill.integration.mjs` runs against the existing disposable Postgres
service in GitHub Actions. It refuses non-loopback fixture connections. It tests exact
identity, duplicate claims, simultaneous dispatchers, partial and failed runs, retry limits,
timeouts, contradictory receipts, dispatch transaction rollback, browser-role denial and
reapplication/recovery preserving records received after the change. The integration test
must pass before production application. Release gates must pass before merging.

## Compatible release sequence

1. Capture the current worker files, controller definition, grants, queue state and schedule
   privately. Confirm no other writer changed those objects.
2. Pause only the backfill schedule. Finish or account for any active backfill before changing
   its driver; ordinary sync schedules remain compatible with both worker versions.
3. Install the tested, stamped additive database migration and deploy the verified worker
   with its existing JWT setting. Record the actual deployed version and source hashes.
4. Run one controlled backfill attempt. Verify its exact claim, persisted result, retained
   history and resulting window state. A partial result must remain incomplete.
5. Resume the captured schedule only after that verification. File the applied migration,
   deploy evidence and required migration-tree pin in the same release batch.

## Recovery

Pause the backfill schedule and account for in-flight work before reverting the worker or
controller. `tools/repairs/metrc-backfill-before.sql` contains the previously committed
controller definition. Compare it with the captured production definition before using it.
Restore the captured worker files and JWT setting. Retain the additive attempt table and
all imported data; neither a database reset nor deletion of newly received records is needed.
Keep the old backfill driver paused because restoring it also restores its known completion
defect. Ordinary sync callers remain compatible during recovery.

This rollback restores code while preserving newer valid data and attempt evidence. The
fixture demonstrates the database preservation property; a live recovery rehearsal and
source reconciliation are separate evidence. Stored `done` means worker completion, not
certification that every historical source record has been reconciled.
