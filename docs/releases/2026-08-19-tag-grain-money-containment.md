# Tag-grain invoice money and proximity identity containment

Status: candidate — database change is not closed until production apply, live postconditions, a normal healer refresh, Git sync, CI, and Netlify verification all pass.

## Executive decision

Apex is the sales source of truth. Metrc is the custody and regulated invoice-number source. An Apex invoice amount is true once per Apex order; it is not a tag, package, document, manifest, laboratory, or inventory measure.

The existing `mv_tag_documents` repeated one invoice amount over every linked tag. At the 20:59 UTC measurement, summing those tag rows produced $47,217,766.37 while the same 679 invoices totaled $3,331,181.45 once per invoice. The $43,886,584.92 difference was fan-out, not sales.

The same root also assigned invoice identity through buyer licence and a ±7-day window because the legacy Apex manifest field was blank. Against the exact normalized invoice-number bridge, 1,714 tag assignments conflicted. Proximity is now refused as a match.

## Files

- `supabase/migrations/20260819210250_tag_grain_invoice_money_and_proximity_identity_are_refused.sql`
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
8. Queries every public view/materialized view carrying `apex_invoice_usd` and aborts if any populated value remains.
9. Proves Apex invoice-grain control totals, object identities, dependencies, grants, indexes, protected menus, and role visibility did not change.

The structural dependency graph remains 59 direct dependents. The column-specific dependency graph deliberately falls from 58 to 57 because `v_forensic_sold_by_tag` no longer reads `mv_tag_documents.apex_invoice_usd`; the exact reviewed post-state is sealed by relation-name hash. This is the intended removal of an unsafe money edge, not dependency loss.

Any failed proof rolls back the complete transaction.

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
