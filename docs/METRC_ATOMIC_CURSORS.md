# Atomic Metrc feed completion

Concurrent Metrc workers used to read one JSON cursor object, change a key and
upsert the entire object. A worker could therefore restore another feed's older
cursor, even after that feed completed. Cursor writes also ignored database errors.

`tg_metrc_finish_cursor` now locks the exact run and cursor configuration row,
changes only that feed/licence key, and commits the run's success and cursor
receipt together. It preserves a newer covered cursor when an older run finishes
later. A requested window that starts after saved coverage is rejected.

Only complete, uncapped normal delta/full-sweep runs call this API. Partial/error
runs hold progress. Explicit historical backfill requests retain the proven
claim/completion path and do not advance the operational cursor. A missing initial
cursor explicitly blocks that operational feed. It cannot silently become a
multi-year sweep that restarts from page one on every scheduled call.

New-feed onboarding must first complete and verify historical coverage through
the existing bounded backfill mechanism, then establish its starting operational
cursor from that evidence. This batch does not invent that boundary or implement
automatic onboarding. Existing feeds with saved coverage continue normally;
explicit historical requests and deliberate full sweeps retain their existing path.

The function is SECURITY INVOKER with an empty search path and explicit service-role
execute permission. Browser roles cannot invoke it. Existing table permissions and
RLS are unchanged. There are no new tables, views or UI changes.

The receipt is stored in the existing run's `note`, with its exact run ID, feed,
requested window, count, old/new cursor and completion time. A lost HTTP response
is resolved from that exact completed run; replay with identical arguments returns
the original receipt. Shutdown/error cleanup can only close a still-running row.
These are progress receipts, not independently certified source-population records.

## Deployment and recovery

Capture the complete current worker files, cursor object, scheduler states and
active runs. Apply the additive migration first. Pause the operational Metrc
dispatcher, wait for dispatched workers to finish, then deploy all worker files
with JWT verification enabled. Re-read deployed files and compare exact bytes.
Resume only the previously active scheduler and verify completed feed receipts
against current cursors across consecutive cycles.

Do not allow old and new cursor writers to overlap during cutover. Check nightly,
manual and other dispatch sources as well as the main schedule. Explicit historical
backfills do not save operational cursors and keep their separate scheduler.

Recovery: pause affected dispatch and account for in-flight requests, restore the
captured worker files, then inspect before resuming. The additive function may be
left installed; it cannot change data unless called. All newer valid payloads,
receipts and cursor progress remain. Do not restore the old entire cursor object
or a whole database backup. Restoring the old worker also restores its concurrency
defect, so resumption requires that operational limitation to be addressed.

The tests execute the real SQL in isolated PostgreSQL, including two simultaneous
connections, old/new completion order, mismatched retries, missing/malformed
coverage, rollback after a persistence failure and browser access denial. Worker
tests execute both the receipt helper and the actual completion routing.

## Acceptance limits

This fixes shared cursor persistence. It does not prove complete source pagination,
every population member, historical business truth, arbitrary late vendor visibility,
or correct propagation through every report and browser. Raw row updates from
overlapping same-feed requests still need independent ordering/evidence checks as
the per-sync certification work expands. No cursor is clamped to max(LastModified).
