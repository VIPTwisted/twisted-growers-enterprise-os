# Deep-Scope Review — 30 Enhancements Not Yet in the Plan

*Full-scope pass across audit, schema (0001–0005), laws, integrations, and intake. 2026-08-04.*

## #0 — The one that matters most: THE OS MUST MEASURE ITS OWN ADOPTION

Every previous attempt died the same death: **abandonment, not malfunction.** The workbook's
harvest pipeline stopped in March; the shadow system logged zero intakes; the old app was a
shell. The OS must treat its own usage as a monitored process:
- **Freshness SLAs per data source** (cash weekly, harvest weights per event, time entries
  daily…) with a staleness board and escalation — "days since last real record" per module.
- **Module heartbeats**: which screens/roles actually get used; a module nobody has touched
  in 14 days is a red flag on the Control Tower, not a silent decay.
- **Adoption scorecard** for the shadow period: the readiness gate (4 consecutive reconciled
  weeks) computed live, not asserted.

## Compliance & regulator-proofing
1. **License scoping on operational rows** — lots/harvests/shipments need a license context
   (you hold multiple: cultivation + product manufacturer). Metrc is per-license; without
   this, reconciliation cannot be exact. *Schema fix — do now.*
2. **Waste chain-of-custody** — waste_events: method of rendering unusable, weight, witness,
   Metrc waste ref. Weights alone aren't custody.
3. **Samples ledger** — trade/QC/internal samples with purpose, recipient, per-license limits.
4. **Visitor log & limited-access areas** — small module, inspection staple.
5. **Audit-pack generator** — one click: licenses, COAs, waste log, mass balance, training
   evidence for a date range. Inspection day becomes an export, not a scramble.
6. **Label/artwork versioning** — compliant label templates per SKU, versioned, approved
   before print (pairs with the COA registry: label potency must match the COA).
7. **Record retention & backup governance** — scheduled logical exports to storage with a
   7-year retention policy; tamper-evidence via **SHA-256 hash of every COA file** stored on
   the coas row.

## Money
8. **Credit gate** — block new orders when a customer is over limit or aged past terms
   (same trigger philosophy as the COA gate).
9. **Price book** — per-customer/tier pricing with discount approval trail; today unit_price
   is a bare column with no governance.
10. **Actual COGS per lot** — roll actual material + actual block labor (per-employee rates)
    + testing + packaging + overhead allocation into each lot; margin becomes fact, not model.
11. **Trim make-vs-buy advisor** — the audit caught trim being bought at $225/lb while ~350 lb
    sat on hand; surface internal availability before any trim PO.
12. **Vault & cash-handling module** — counts, dual custody, deposit runs, pickup log.
    Cash-heavy industry; currently only a cash_snapshots table.

## Supply engine
13. **Biomass supply↔demand netting** — project A/B-grade and trim supply from the harvest
    calendar against the production plan's consumption: "will October have enough A-grade
    for the 3.5g plan?" The workbook attempted this by hand; the OS can compute it.
14. **Seasonal demand calendar** — 4/20, Green Wednesday, holidays as configured demand
    multipliers feeding forecasts.
15. **Scenario sandbox** — what-if branches (harvest slips two weeks; hire delayed) without
    touching live data.
16. **Badge/qualification scheduling gate** — scheduler refuses an assignment when the
    employee's Metrc badge is expired (column already exists) or machine qualification is
    missing. Turns training records into an enforced control.

## Trust & security
17. **Witnessed approvals (e-sign moment)** — re-auth (PIN/passkey) at the instant of
    Vincent release, QA release, waste witness; the approval row stores the challenge.
18. **Onboarding/termination automation** — checklists tied to hire/term: badge issue/return,
    Metrc agent add/remove, access grant/revoke. Termination revokes at the identity layer.
19. **Session security for pay/cash surfaces** — short sessions, device list, optional IP
    pinning for executive screens.
20. **Metrc write-back dry-run** — when the write phase eventually arrives: diff-preview →
    approval → commit, never direct writes.

## Field reality
21. **Photo evidence attachments** — grading, receiving damage, QC holds, incidents; storage
    bucket + hash, linked from the row.
22. **Offline-first floor capture** — vault/grow-room Wi-Fi is unreliable; mobile entry queues
    locally and syncs (architecture requirement for the mobile module).
23. **Printable day sheets + vault count sheets** as first-class reports (paper is part of
    the floor workflow — embrace it, generate it).

## Engineering hygiene (invisible, load-bearing)
24. Hot-path indexes (lots.status, allocations.lot_id, time_entries(employee, date),
    metrc_packages(license, synced_at)).
25. audit_events monthly partitioning before it grows unbounded.
26. **KPI definitions as data** — every Control Tower metric with formula, owner, target in a
    table (Law #4; also kills the ambiguous-denominator disease the workbook had).
27. Notification preferences + quiet hours + escalation chains per user (CODE-013 detail).
28. Reconciliation idempotency: nightly Metrc diff keyed on (license, tag, sync window) so
    reruns never double-open exceptions.
29. Storage bucket policy: private-only, signed URLs, no public objects anywhere (matches
    the no-public-links law of the workbook era).
30. **Seed-data ban in production** — enforce Real-Records-Only at CI level: migrations may
    seed reference data only; any sample operational row fails review.

## Immediate actions taken
- Items **1, 24** are pure schema/index work → applied as migration 0006 alongside this doc.
- Items 2, 3, 8, 10, 16 are next-migration candidates (0007) — small tables + triggers.
- #0 (adoption telemetry), 5, 13 are app-layer builds slotted into M1–M3.
