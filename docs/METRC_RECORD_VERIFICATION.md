# Metrc delivered-record verification

This batch adds database admission checks to packages, plants, harvests,
plantbatches and transfers. Reference feeds keep their existing ingestion path.
The approved site design and browser permissions do not change.

## What a successful receipt proves

For one licence/feed/window, every required lifecycle endpoint answered through
its final page. PostgreSQL retained the original decoded response text and SHA256,
parsed exact numeric values, projected the existing mirror fields and compared
every stored field and raw payload before committing. Mirror writes, immutable
record evidence, successful run status and operational cursor commit together.
Historical backfills earn source verification without moving operational cursors.

Each record receipt binds the Metrc source ID, business identity, source JSON,
mapped fields and complete before/after mirror row. A changed tag remains traceable
by source ID. This does not invent retirement semantics or delete a former tag.

This is **delivered-record API verification**, not full-source population
certification. It does not prove that Metrc exposed every relevant change, repair
historical omissions, certify records absent from the response, or validate report
formulas and browser tiles. A zero-record response verifies request completion;
it does not certify an empty source population or old mirror rows.

## Admission and recovery

The worker stages complete responses through `tg_metrc_stage_page`. It never writes
operational rows through the old upsert path. `tg_metrc_finish_verification` checks
coverage and promotes the entire feed in one transaction. A missing page, duplicate
business identity, inconsistent metadata, precision loss, stale response or failed
cursor write rolls back promotion. Staged pages survive for diagnosis; cursors stay
at previously verified coverage. Existing error/partial run monitoring sees failures.

A bounded per-feed lease prevents two workers from promoting overlapping pulls.
Expired leases are closed on the next begin, retaining all evidence. Completion is
idempotent for lost network acknowledgments. Cleanup cannot demote a verified run.
Public and authenticated roles cannot read these receipts or invoke their APIs.

`tg_metrc_check_record_receipt(run_id)` compares the receipt's specific records
with current mirror contents. Missing or changed values invalidate **current match**;
the historical receipt remains unchanged. It does not apply a prior receipt to a
new data version. New syncs create new receipts, including unchanged records returned
again by the source. Full-population freshness and report certification remain
separate acceptance requirements.

### Reversal procedure

1. Pause the specific Metrc dispatchers using their captured current schedule state.
2. Drain running workers; inspect open leases and the exact committed run receipts.
3. Restore the exact previous worker files and JWT setting captured before cutover.
4. Re-enable the captured schedules. Verify new successful runs and cursor continuity.
5. Retain additive receipt objects and all valid business rows. Do not restore an old
   database snapshot, replace the shared cursor object, or delete receipts.

Before/after row receipts support targeted recovery if a later defect is discovered.
That recovery must compare each current row to the recorded after-version and refuse
to overwrite any intervening valid change. It requires a separately reviewed repair;
blindly replaying all before-images is not an approved reversal.

## Check design (CLAUDE.md K1)

1. Can it match? Positive fixtures cover all five existing projection contracts,
   exact numeric source IDs, complete lifecycle pagination and stored values.
2. Are shapes comparable? Raw JSONB is compared to raw JSONB; each mapped value is
   compared after the database type round trip and again after the actual write.
   Missing optional fields remain omitted; explicit null remains distinct from blank.
3. Are ages comparable? The request is bound to its declared window and run, and
   current checks bind a specific received record version. No historical export is
   relabelled current. Newer concurrent mirror data causes promotion to stop.
4. Can it fail? Negative fixtures force missing pages, invalid identities, changing
   totals, duplicate keys, numeric rounding, concurrent leases and cursor failure.
5. Nothing versus nothing? Complete empty responses get delivery receipts, but the
   current-record comparison explicitly refuses `current_match=true` for zero rows.

## Source contract and remaining limits

Metrc's [v2 pagination documentation](https://api-ma.metrc.com/Documentation/#whats-new-in-v2-pagination)
describes Data, Total/TotalRecords, Page/CurrentPage, PageSize, RecordsOnPage and
TotalPages. Available metadata must agree within and across pages. Legacy bare-array
responses require a short terminal page. Page caps and deadlines remain explicit
incomplete outcomes; they cannot silently count as complete.

Existing numeric(14,3) mirror columns cannot represent every possible source value.
This verifier refuses such loss rather than certifying rounded values. Precision
repair, full population reconciliation, complete endpoint inventory, report-version
binding and browser propagation remain separately tracked work.

Deployment state and actual version/stamp are recorded in the private evidence
package and the deployment manifest after production verification. Fixtures run only
in a disposable local PostgreSQL database; CI includes actual concurrent sessions.
