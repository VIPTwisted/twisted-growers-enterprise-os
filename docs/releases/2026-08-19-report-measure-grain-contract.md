# Report measure grain contract

Status: live and verified — application merged at `cc629305b295845fd9033e98dc82455a4bd7683b`; Supabase migration applied once as `20260819235427_report_totals_require_declared_grain`; this receipt synchronizes the exact applied filename without changing SQL semantics.

## Executive decision

A numeric column is not a measure. A report cannot certify its own value grain. A sum requires an independently governed canonical relation and column, canonical source OID and definition, value-grain keys, aggregation, eligibility, null policy, and one execution-backed database snapshot receipt covering the complete filtered population. A browser count plus separately paged rows is never that receipt. Any missing proof refuses the total while preserving the raw rows and forensic drill.

## Measured live state before

- 659 navigation rows are enabled; 640 are data roads. Only 19 point to a fact view registered in `report_registry`; 621 data roads have no report contract.
- `report_registry` holds 25 enabled rows, 78 declared measures, and 22 fact views.
- One fact view (`v_inventory_report`) has four enabled contracts. Its three excess candidates are refused as ambiguous; the browser never selects the first one.
- `v_apex_invoice_truth` has 1,739 unique nonblank Apex order keys and the current one-order-grain sum is $6,360,187.52.
- Its 348 NULL recognized totals are not silently omitted: 346 are cancelled and explicitly ineligible; two non-cancelled zero-line orders (`853415` / `Twiste-1713` and `855485` / `Twiste-1729`) have no numeric amount. Those two remain a visible completeness discrepancy, so the Apex total is not certified by this contract today.
- No enabled navigation road points to `v_apex_invoice_truth` or `v_metrc_manifest_invoice_truth`. The canonical Apex declaration is backend/governance proof, not a claimed reachable green browser tile.

## Files

- `app/web/src/lib/report-measure-contract.js`
- `app/web/src/App.jsx`
- `tools/tests/report-measure-contract.test.mjs`
- `tools/checks/report-measure-grain.mjs`
- `supabase/migrations/20260819235427_report_totals_require_declared_grain.sql`
- `.github/workflows/ci.yml`
- `package.json`
- this receipt

TopMenu, TG Workspace, navigation rows, and role visibility are not changed.

## Database contract

1. `measure_semantic_registry` independently owns canonical measure provenance. The first row binds `apex.recognized_sales` to the reviewed `v_apex_invoice_truth.recognized_total_usd` OID and definition, Apex-order key, Apex source, sum aggregation, `cancelled=false` eligibility, and `forbid_for_eligible` null policy.
2. `report_registry` gains `row_grain`, `grain_keys`, and measure-key references. Its trigger covers report key, fact view, enabled state, measures, grain, keys, and contracts. A published road cannot be repointed while retaining an unrelated contract. Disabling remains allowed; re-enabling re-runs the guard.
3. Runtime functions are `SECURITY INVOKER`, selected-fact-view only, and executable by authenticated/service roles—not anon. RLS is not bypassed.
4. Verification rejects missing/drifted canonical sources, zero rows, blank keys, trimmed duplicates, null eligible values, value-key mismatches, and unapproved aggregation.
5. Existing 77 legacy declarations remain visible as governance debt and cannot total. Raw fields, filters, drills, and exports remain available.

## Browser and export behavior

- The selected canonical source and contract are rechecked around row reads. Those checks prove metadata and grain governance only; they deliberately do not claim separately paged browser rows share a database snapshot.
- Certified rows are deterministically ordered by every grain key.
- A subtotal is refused unless an execution-backed database snapshot receipt covers the complete filtered population. This release issues no such receipt, so every browser subtotal remains refused even when all rows, keys, values, counts, and contract metadata appear complete.
- Group subtotals use the same complete parent population. A first 2,000-row page or a 50,000-row ceiling can never publish a certified total.
- Every CSV, Excel, PDF, and Google Sheets export performs a fresh full row/count read, re-reads the contract after those rows, and stamps matching-row count, contract status/digest/observed time, and the exact REFUSED/DISPLAY-ONLY verdict for every numeric field shown. No export can say CERTIFIED until the later snapshot-reader release exists.
- The audit drawer states loaded rows, matching rows, truncation, and certification separately. It no longer claims a partial read is “never a sample.”

## Adversarial gates

- Twelve pure JavaScript tests include fraudulent unique-tag rows carrying repeated invoice money, canonical-source mismatch, trimmed duplicate/blank/zero keys, eligible NULL money, ineligible numeric exclusion, absent snapshot receipts, and incomplete/digest-mismatched populations.
- The exact migration runs in disposable PostgreSQL 17 through a runner-owned transaction.
- A forced fact-view republish must raise the exact guard exception and roll back DDL, data, and migration history.
- Authenticated invoker execution must work and return the current incomplete Apex verdict; anon execution must be denied.
- Unrelated/unregistered lookups must return without touching the Apex verifier.
- Source-definition drift, blank keys, trimmed duplicate keys, zero rows, and active NULL money must all remain non-green.
- Disabling or removing a referenced canonical semantic must immediately make the execution verifier non-green.
- The runtime must return no snapshot receipt. A future snapshot reader is a separate, execution-backed release; client pagination can never manufacture its flag.
- The full repository migration-tree seal is renewed only after independent review of the final migration bytes.

## Required deployment order

1. Commit and deploy the fail-closed application first. Against the old database its missing RPC is a visible error and every total is refused; raw rows remain readable.
2. After the exact app build stamp is live, apply the exact migration once through Supabase migration history. Do not paste it into the SQL editor.
3. Reprove registry/OID/ACL/RLS/policies, semantic source identity, invoker grants, current two active Apex NULL discrepancies, canonical total, and protected navigation/role fingerprints.
4. Smoke authenticated unregistered, ambiguous, incomplete, RPC-error, export, and audit-drawer paths. Then require Git, GitHub CI, Supabase history/schema, and Netlify commit agreement.

UI rollback after database apply is forbidden because it would restore the unsafe numeric heuristic. Roll forward; if the database migration rolls back, the new UI remains safely fail-closed.

## Applied verification

- GitHub PR #14 merged with the reviewed application commit preserved; both pull-request and merged-main gate suites passed.
- Netlify's deploy-current watcher proved production was running merged `main` commit `cc629305b295845fd9033e98dc82455a4bd7683b` before the database apply.
- Supabase recorded exactly one `20260819235427_report_totals_require_declared_grain` migration.
- Runtime proof remains fail-closed: 1,739 rows / 1,739 distinct nonblank Apex order keys, two eligible NULL values, `grain_verified=false`, `population_snapshot_verified=false`, and no snapshot ID.
- The canonical Apex order-grain control remains $6,360,187.52. It is a reconciliation control, not a certified browser subtotal while the two eligible NULL values remain.
- All 77 uncontracted legacy measures remain explicitly refused; the one canonical declaration still refuses because eligible values are incomplete and no snapshot receipt exists.
- Report registry remains 25 enabled rows / 78 declared measures. TopMenu, TG Workspace, all navigation, and role-visibility fingerprints are unchanged.

## Deliberately still open

This release does not invent contracts for the other 77 measures and does not claim the two active Apex zero-line orders are $0. It also intentionally certifies no browser subtotal or export: the next small release must add a server-side snapshot reader before any total can turn green. The two source values must still be resolved or explicitly governed before revenue receives a certified total.

KPI tiles, dashboards, Budz, TG Brain, widgets, and other non-`ReportScreen` engines remain separate publication roads. They require the same independent semantic registry in later small guarded releases; no generic-renderer fix proves those roads correct.
