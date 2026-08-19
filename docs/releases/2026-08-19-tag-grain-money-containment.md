# Tag-grain invoice money and proximity identity containment

Status: closed and deployed — production apply, executable live postconditions, an ordinary healer refresh, Git synchronization, main-branch CI, and the Netlify build-stamp check all passed.

## Final closure receipt

- Supabase migration `20260819220553_tag_grain_invoice_money_and_proximity_identity_are_refused` is recorded exactly once.
- Applied SQL SHA-256: `ba3e5425529f2f199e846d40a845998983ac701c1fc7d1f84b0075919e2998d6`.
- Applied 930-file migration-tree SHA-256: `1981860ba2477b8dac05bdaa6a53d8a6b356a8a4747d6c72bf9d955c0a30d80e`.
- Ordinary watcher receipt `matview_refresh_run.id=2857` refreshed `mv_tag_documents` successfully in 7,091 ms after deployment.
- Lifecycle and document root both reconcile to 19,110 rows and 19,110 distinct non-null tags.
- Lifecycle, document root, raw sold, and safe sold prohibited money/payment counts are zero.
- Sold identity differences, lifecycle identity differences, the independently rederived Metrc-to-Apex bridge differences, and full document-trinity reconciliation differences are all zero.
- Canonical Apex invoice-grain history remains `$6,360,187.52`; it was not added to Metrc custody values.
- Protected TopMenu, TG Workspace, all-navigation, and role-visibility fingerprints are unchanged.
- Worker, Reviewer, and Guard independently approved closure.
- PR #12 merged through merge commit `4e73c43f0b6c78dd7c5554594024ef17b748cc45`, preserving the reviewed commits.
- Main Gates run `32309343757` passed.
- Main deployment-watch run `32309343708` passed.
- Netlify production reported build `4e73c43f0b6c78dd7c5554594024ef17b748cc45`, built at `2026-08-19T22:34:03.164Z`, matching `origin/main`; the public site returned HTTP 200.

This receipt closes only the tag-grain invoice-money/proximity-identity publication finding. It does not state that the entire OS, inventory position, source freshness, or all Apex-to-Metrc discrepancies are balanced.

## Executive decision

Apex is the sales source of truth. Metrc is the custody and regulated invoice-number source. An Apex invoice amount is true once per Apex order; it is not a tag, package, document, manifest, laboratory, or inventory measure.

The existing `mv_tag_documents` repeated one invoice amount over every linked tag. At the 20:59 UTC measurement, summing those tag rows produced $47,217,766.37 while the same 679 invoices totaled $3,331,181.45 once per invoice. The $43,886,584.92 difference was fan-out, not sales.

The same root also assigned invoice identity through buyer licence and a ±7-day window because the legacy Apex manifest field was blank. Against the exact normalized invoice-number bridge, 1,714 tag assignments conflicted. Proximity is now refused as a match.

## Files

- `supabase/migrations/20260819220553_tag_grain_invoice_money_and_proximity_identity_are_refused.sql`
- `tools/checks/money-grain.mjs`
- `.github/workflows/ci.yml`
- this release receipt

No `App.jsx`, TopMenu, navigation-registry, menu presentation, or TG Workspace code is changed.

## Problem before

- `v_tag_lifecycle.stage5_invoice_usd` selected an invoice total into one row per tag.
- `mv_tag_documents.apex_invoice_usd` materialized that repeated total.
- The authenticated raw `v_forensic_sold_by_tag` road independently repeated `total_usd`, payment status, and a proximity-matched invoice identity even after its safe navigation wrapper was published.
- Fifty-eight direct view columns inherited it; 57 enabled navigation targets exposed the column.
- The generic report engine can subtotal any visible numeric field and does not enforce `report_registry.measures`.
- Invoice identity used an exact manifest match or buyer-licence/date proximity. Because the stored Apex manifest field was blank, the proximity branch made every legacy assignment.
- A UI-only refusal, registry edit, rename, or wrapper would leave raw/API/export roads unsafe.

## Change

Supabase `apply_migration` owns one transaction containing its migration-history write and the complete SQL file. The file contains no nested transaction control. Inside that runner-owned transaction, it:

1. Preflights exact object identities, signatures, owners, options, grants, unique index, dependency graph, publication-road inventory, and protected navigation fingerprints.
2. Replaces `v_tag_lifecycle` without changing its OID or 43-column signature.
3. Sources invoice number/date only from `v_metrc_manifest_invoice_truth`, which joins Metrc to Apex by normalized invoice number and refuses ambiguity.
4. Projects typed `NULL` for tag-grain invoice dollars and payment status.
5. Refreshes the existing `mv_tag_documents` synchronously, without drop, rename, swap, cascade, or concurrent commit window.
6. Replaces `v_forensic_sold_by_tag` in place, sourcing both invoice-number columns from the exact bridge and refusing `total_usd`, `payment_status`, and `apex_invoice_usd`.
7. Reconciles every non-money document-trinity field back to the lifecycle and independently rederives the bridge from raw Metrc invoice digits plus Apex invoice truth.
8. Seals the complete 60-relation money-column inventory, the root materialized-view definition, the safe-wrapper identity/signature/security/definition, and the definitions of all 57 unchanged views that directly project `mv_tag_documents.apex_invoice_usd`; it separately proves root money/payment, raw sold money/payment, and safe-wrapper money/payment are null. This is the complete 60-road proof without re-executing 57 expensive derived views inside the migration transaction.
9. Proves Apex invoice-grain control totals, object identities, dependencies, grants, indexes, protected menus, and role visibility did not change.

The structural dependency graph remains 59 direct dependents. The column-specific dependency graph deliberately falls from 58 to 57 because `v_forensic_sold_by_tag` no longer reads `mv_tag_documents.apex_invoice_usd`; the exact reviewed post-state is sealed by relation-name hash. This is the intended removal of an unsafe money edge, not dependency loss.

Any failed proof rolls back the complete transaction.

The first guarded apply attempt received an HTTP 504 while the original migration was re-executing all 57 derived views inside the transaction. Immediate live verification proved complete rollback: no migration-history row, unchanged protected definitions/dependencies, and unchanged pre-release unsafe counts. The optimized proof above removes that redundant execution cost; it does not weaken the 60-road invariant.

## Behaviour now

Concrete example: two package tags may both link to exact invoice `INV-1737`. Both rows may display that invoice number and drill to its canonical record. Neither row carries an invoice amount or payment status, and neither can create a tag subtotal. Revenue comes from one row in `v_apex_invoice_truth`. Payment status remains unavailable until a separately governed exact invoice-grain payment surface exists.

If Metrc and Apex do not share an exact normalized invoice number, the tag shows no Apex invoice identity and the lifecycle states that an exact invoice was not found. The discrepancy remains visible for investigation; the system does not guess.

## Release gates

- The migration body and complete migration tree are content-sealed after independent review.
- GitHub Actions runs a reduced, production-semantics PostgreSQL fixture inside a runner-owned transaction that first writes migration history. It proves in-place replacements preserve OIDs, owners, ACLs, `security_invoker`, indexes, and dependants; refresh clears repeated values; exact identity replaces a proximity guess; and the exact expected guard exception rolls back DDL, data, and history. The production-shaped migration still must prove itself through its executable live pre/postconditions.
- Production apply must pass its own executable postconditions.
- After commit, one ordinary `tg_refresh_proofs` healer cycle must complete and all zero-money/identity assertions must pass again. This proves scheduled refresh cannot resurrect the defect.
- Git migration history, Supabase migration history, GitHub CI, Netlify deploy commit, and live schema digest must agree before closure.

The two `CREATE OR REPLACE VIEW` operations and non-concurrent materialized-view refresh take locks held until commit. Deploy in a quiet maintenance window; readers can pause briefly. A 15-second lock-acquisition timeout and five-minute statement timeout fail closed and roll the complete apply back.

## Still open — not called balanced

This containment removes false publication; it does not declare every Apex↔Metrc discrepancy resolved. Unmatched, ambiguous, cancelled, mistyped, and Apex-only/Metrc-only invoice records remain reconciliation work and must stay visible until explained.

Next required release: a state-based publication-measure contract that explicitly records source object, column, row grain, value grain, allowed aggregation, export policy, canonical source, and reconciliation rule. Unregistered numeric columns must default to display-only and non-summable across reports, exports, widgets, KPIs, and AI-generated reports.
