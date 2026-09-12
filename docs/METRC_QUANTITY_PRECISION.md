# Metrc saved-source quantity precision

**Live outcome, 12 September 2026 at 12:47 UTC:** the second attempt completed.
Its immutable receipt records six repaired rows, 204 verified dependencies,
unconstrained numeric storage and zero saved-source quantity differences.
An independent 12:48 UTC query confirmed all six exact values and both one-time
schedules removed. Both active-package export comparisons subsequently passed
against their explicitly dated September 11 snapshots. Full certification
through September 12 remains open; no whole-dataset GO is asserted here.

The package mirror stored quantities as `numeric(14,3)`. Six saved source
quantities contained a fourth decimal place, so ingestion rounded their values.
Migration `20260912121116_gpt_queue_metrc_quantity_precision_repair.sql` queues
the guarded widening to unconstrained `numeric` and restores those six values
from their existing source payloads. It never changes their source provenance.

## Scope and acceptance

The repair seals the exact six-row source population and the definitions,
owners, permissions, options, columns, comments and indexes of 204 dependent
views and materialized views. It refuses drift before changing anything, then
rechecks the source after acquiring the package-table lock. All data and
dependency changes happen in one transaction. No cascading view drop is used.

The dependency cycle is broken by making `v_tag_evidence` read certificate
fields directly from `mv_certificate_resolved`. The removed wrapper join
contributes no consumed fields, and the existing unique document-tag index
preserves cardinality. A complete live EXCEPT ALL comparison in both directions
matched before applying the repair. All 18 affected materialized views are
rebuilt with data, and previously nonempty dependent relations must remain
nonempty. Existing access controls and view options are restored exactly.

The production DDL guards stay enabled. The repair uses the guard's existing
transaction-local maintenance switch, retains explicit dependency recreation,
and restores the switch before returning. No browser role gains access.

## One-time execution

The measured dependency queries and materialized-view rebuild exceed the
synchronous API request window. The migration therefore uses the existing
pg_cron service for one exact future minute. The job has a 15-minute statement
budget and a three-second lock-wait limit. It removes its own schedule,
refuses changed SQL, expires before a late start, and does not retry terminal
results. Other schedules are unchanged.

The owner-only `tg_maintenance.metrc_quantity_precision_run` table preserves the
sealed SQL hash, schedule and immutable terminal result. An ordinary error or
query cancellation rolls back the whole repair subtransaction, while retaining
the failure receipt and schedule removal. A completed receipt independently
requires unrounded storage, six repaired rows, 204 verified dependencies and
zero saved-source quantity mismatches. A scheduled job or a pg_cron transport
success is not a completed repair; read this receipt and verify the live state.

## Verification and recovery

The first live attempt reached the final availability check for
`v_dept_dash_cfo` but exhausted its 15-minute budget at 12:28 UTC on September
12. Its immutable failure receipt confirms the rollback. Independent checks
found the original six mismatches, original source fingerprint and all 204
original dependency-definition fingerprints intact; its schedule was removed.

Migration `20260912123148_gpt_metrc_precision_rebuild_statistics.sql` preserves
that receipt and queues a separate attempt. It analyzes the package table and
each newly populated materialized view before planning its consumers. It also
reports the current relation and phase in the session application name. The
same timeout, source guards, permissions and final assertions remain in force.
The second queue refuses an unresolved predecessor or an existing second
attempt. Both attempt runners are exercised by the native CI fixture.

The private full rehearsal reconstructs all 204 actual dependency definitions,
the production DDL guards, typed empty outside providers and six synthetic
quantity records in PGlite PostgreSQL. It tests dependency and source drift,
changed permissions, rollback after complete reconstruction, cancellation,
expiry, changed SQL, terminal replay, denied browser access, immutable receipts
and future high-precision input. It is a structural and transactional rehearsal,
not a live-population certificate.

`tools/tests/metrc-precision-job.integration.mjs` runs the actual deployed queue,
runner and receipt guard against an explicitly synthetic repair payload. CI
uses a disposable native PostgreSQL 17 database. These focused tests isolate
the runner's transaction, access and audit behavior; the private rehearsal
separately covers the full dependency rebuild.

On failure, first read the private terminal error and verify rollback. Do not
reset the immutable receipt or silently schedule repeated attempts. A new
attempt needs a separately reviewed migration bound to the then-current source
and dependency versions. A completed widening must not be reversed by rounding
quantities again. Preserve exact quantities and provenance in any corrective
forward migration; retain the previous definitions in private recovery evidence.

## Certification boundary

Equality to a saved source payload proves storage precision only. Five of these
rows are explicitly historical report imports; their fresh direct lookups were
denied and do not establish current API absence. Four-decimal active-package
digests were recorded on September 12 at 05:43 UTC, superseding the earlier
three-decimal digests. They describe September 11 snapshots, not today's complete
population. Fresh original source exports or an independently complete source
reconciliation are still required for certification through today.

This repair does not certify every OS tile, report or business total. General
Apex partial-page publication and ordinary-worker credit-read fail-open behavior
remain separately identified defects. The existing certification checks must
continue to report their real failures rather than being forced to GO.
