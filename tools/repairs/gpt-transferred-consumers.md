# Transferred custody consumer repair

This local candidate changes four consumers before a separately guarded mirror state correction. It does not write source records, finish packages, change weights, or certify the entire inventory system. Original definitions were captured directly from production on 12 September 2026 in `gpt-transferred-before.json`; that file contains SQL definitions, not private package evidence.

## Behavior

- `tg_snapshot_inventory` includes active, on-hold and explicitly labelled in-transit records. It excludes transferred/unknown states and rejects historical or future dates before deleting any snapshot, using the facility timezone. Its separate existing item-facility origin inference remains unverified.
- `f_stock_status` labels transferred material as accepted by the recipient, without claiming a sale or finish.
- `v_inventory_reconciliation` limits held quantities and hold warnings to active/on-hold states. Transferred-only history is explicitly not verified. Existing mixed-unit aggregation and the general fallback for other states remain outside this repair.
- `v_inventory_locator` excludes transferred records from its unknown-state conflict branch; legitimate inactive/unknown conflicts remain visible. Both revised views preserve licence-plus-tag grain, including source/destination rows with identical tags.

The candidate uses CREATE OR REPLACE, retaining columns, owner, grants, comments and function security settings. Both views explicitly retain their existing security_invoker setting. Preflight hashes reject unexpected live definition drift before any replacement. Before preflight, the READ COMMITTED transaction obtains ACCESS SHARE locks on both views and FOR UPDATE locks on exactly the two pg_proc rows, in OID order. A separate preflight statement then sees any preceding committed DDL. No same-value ALTER is used to acquire a lock. The locks remain through commit/rollback; view dependencies receive recursive ACCESS SHARE locks, permitting ordinary data writes. Concurrent DDL can cause a timeout/deadlock, which must abort the entire migration; never proceed without the locks. This does not prevent a later deployment after commit. No dependency is dropped or rebuilt and no package row is changed.

## Verification

Native CI, adjacent to the precision-maintenance test, uses the existing PostgreSQL service:

```sh
TRANSFERRED_TEST_PGURL=postgresql://...@localhost/... node tools/tests/gpt-transferred-consumers.integration.mjs
```

The adapter refuses non-loopback hosts, creates a uniquely named disposable database and role, then removes them. A local embedded rehearsal is available through `TRANSFERRED_TEST_PGLITE_MODULE` pointing to an installed PGlite module; that adapter refuses to run in CI. No test depends on a scratch path.

The test installs the original live definitions over typed dependency stand-ins, demonstrates the original transferred-as-held, transferred-as-conflict and cross-licence-collapse failures, then executes the revised SQL. It checks:

- Transferred hold/test-failure exclusion and current active/on-hold/transit retention.
- Retained inactive/unknown conflicts and both licences for an identical tag.
- Snapshot membership, facility-local today, and rejection of past/future snapshots.
- Exact preservation of every package field immediately across the migration.
- View owners, ACLs, options and comments; function owners, ACLs, security mode, search path, volatility, parallel setting and comments.
- Explicit transfer labelling and refusal of a repeated/drifted migration.
- Native-only independent-backend function and view replacement attempts: both time out while the exact migration lock prefix is held, cannot change definitions, then succeed after either rollback or commit. The test restores each fixture definition afterwards.

Only expected view preflight hashes are rebound to the disposable fixture catalog, because stand-in dependency types alter PostgreSQL deparsing. Revised bodies and function preflights execute unchanged. Local PGlite verification passes and explicitly skips only the two-session contention cases, because it has one backend. Earlier native semantic CI passed; the new native contention cases must pass CI before release.

## Remaining scope

Raw-only positive-quantity/unfinished predicates already count the stale in-transit rows. Preserving raw data while changing state does not worsen those predicates, but their existing held-inventory overstatement remains. Examples include `v_inventory_room_proof` and the room/category aggregation preceding `v_inventory_reconciliation` in the baseline. Other cross-licence deduplication and reports treating in-transit as all historical shipments still require their own contract checks. This patch is not a global consumer audit.

The companion state correction must bind current membership, accepted-transfer evidence, licence/tag identity, verified export timezone, source hashes, and unchanged-row guards. Retain before/after evidence. Transfer-export quantities have no unit column and must not overwrite mirror quantities. Endpoint absence alone never proves finishing.
