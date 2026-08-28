# CEO backlog — locked 28 Aug 2026

Owner: Anthony. Delivery: implementation 15 Sep 2026, then QBO/payroll/HR remainder.
Grade bar: A++. Detect ≠ act. Metrc/Apex never blended. No silent zero. No invented view.
This file is the queue. Agents do not start work that is not in NOW or NEXT without CEO word.

## NOW (in flight)

- [ ] C: rebase #63 onto main after #64. Banner + live harvest list. Delete missing-view chip. No App.jsx.
- [ ] Merge #63. APPLY v_harvest_control_banner.
- [ ] Banner on Cultivation home (done in #63). Tower half waits — ControlTower is in App.jsx.
- [ ] B: read-only sync census (v_sync_item last_success, Metrc/Apex counts, stale >48h).
- [ ] A: idle. No dash-cultivation, no App.jsx, no budz, no filename rename.

## NEXT (after banner + census)

- [ ] Wire HarvestControlBanner on Control Tower when App.jsx is free (one line + import).
- [ ] File GRANT lines B appended on harvest view (repo vs prod).
- [ ] git mv workspace migration 20260828210000 → ledger 20260828200140.
- [ ] Re-pin money-grain after those files.
- [ ] Remaining bespoke pages still off the date bus (A list of 34, shrinking): finance leftovers, HR/payroll, scheduling, cult kit pages, kiosk declare already done.
- [ ] Email/in-app harvest alerts to named manager when wet recorded and dry empty after owner hours (4h default, editable).
- [ ] Monthly contracted min vs Metrc packaged MTD as its own view — ONLY if banner line 3 is not enough. Banner already: 167.5 vs 380 = 212.5 short Aug 2026.
- [ ] Harvest pull link quality: 8/15 pulls date-only / room drift. Do not auto-fix. Owner ruling later.
- [ ] Two conversion_factors rows both 380 (min vs target). Do not auto-merge.

## PHASE 1 — must be true by 15 Sep

Accuracy
- [x] Apex invoice book 1,739; MATCHED 679; named exceptions not blended.
- [x] CEO tiles exact COUNT not cap (1086 flags, 2069 unallocated).
- [x] harvest schedule vs Metrc view live; weak links disclosed.
- [ ] Sync freshness table published and stale items named.
- [ ] No page prints a cap or a refuse as 0.

Micromanage / accountability (owner words)
- [ ] Per department unique SKUs, reorder points, alerts — CFO sets, not hardcoded.
- [ ] Daily alerts: inventory below set point.
- [ ] CFO allocates harvest weight (flower / preroll / extract) so vault is not all one class.
- [ ] Units per hour vs goal (2k goal vs ~700 actual) — editable windows, Monday week start, extra hours when behind.
- [ ] Department grade + manager grade.
- [ ] Finished-goods target stock so sales are not from an empty cart.
- [ ] Shift start accountability (9:00 vs first unit 10:07).
- [ ] All policy editable by upper management with permissions. Nothing static.

Date bus
- [x] Shared DateRangeSelect + range-search. Search beats range.
- [x] Dashboards this_week_td intent; finance this_month family; queues as-of.
- [ ] Every remaining page on the bus or an honest as-of chip. 615 report pages inherit; ~34 bespoke still listed.

Nav
- [x] Omit-nothing. 12 categories, 660 enabled. HR + Reports kept.
- [ ] Department homes: CEO-grade dashboard, not a junk drawer. Condense without deleting a tile.

Metrc / Apex (Phase 1 = one-way in)
- [ ] Confirm vendor/software Metrc key or document that live pull is file-backed.
- [ ] Coverage matrix: every file in docs/metrc-exports/ → OS view or named gap.
- [ ] Coverage matrix: docs/apex/apex-openapi-3.1.json operations → OS object or named gap.
- [ ] Exception queues stay live (moisture, never tested, failed no disposition, harvest open).
- [ ] Tag check 1A40A030000E5B2000000014 (R&D vs compliance) still owner-in-Metrc.

HR / QBO (after 15 Sep implementation)
- [ ] QuickBooks sync.
- [ ] Payroll.
- [ ] Remaining HR items.

## PHASE 2 — two-way Metrc / Apex

- [ ] Write-back only after one-way proven and owner APPLY per action class.
- [ ] X-boxes in Metrc and Apex; all data still flows to TG OS.
- [ ] Detect still ≠ act unless the action is an explicit approved write.

## NEVER

- Blend Metrc pounds with Apex dollars.
- Close a shortfall because a link is weak.
- Print 0 when the read refused.
- Invent a view on the page.
- Two-way write in Phase 1.
- Delete a nav item to look tidy.

## Done this week (do not reopen)

Exact CEO counts #60. Workspace all/snapshot #61 applied. Harvest view #62 applied + list #64. Period bus + last_12_months. Exception queues + role gate. Orders full book 1739. Fail-closed gates. Schema baseline redump. F1 recon file.
