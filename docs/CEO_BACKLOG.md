# CEO backlog — locked 28 Aug 2026

Owner: Anthony. Delivery: implementation 15 Sep 2026, then QBO/payroll/HR remainder.
Grade bar: A++. Detect ≠ act. Metrc/Apex never blended. No silent zero. No invented view.
This file is the queue. Agents do not start work that is not in NOW or NEXT without CEO word.

## NOW (in flight)

- [ ] C: rebase #63 onto main after #64. Banner + live harvest list. Delete missing-view chip. No App.jsx.
- [ ] Merge #63. APPLY v_harvest_control_banner.
- [ ] Banner on Cultivation home (done in #63). Tower half waits — ControlTower is in App.jsx.
- [x] B: read-only sync census (28 Aug).
- [ ] B: find who writes metrc_*.synced_at vs v_sync_item.last_success_at. Read-only. Name the job/cron. Do not start 66 pulls.
- [ ] A: idle. No dash-cultivation, no App.jsx, no budz, no filename rename.

## Census locked 28 Aug (B)

Mirrors: metrc_harvests 385 · metrc_packages 20,349 · metrc_plants 57,706 · v_apex_invoice_truth 1,739.

v_sync_item: 66 enabled. Succeeded within 48h: **0**. Never succeeded: 53. Last Apex success: 9–10 Aug (19d) — inventory, batches, brands, buyers, profile, deals, leads, licensed ops, net terms, catalogue, sales orders, tags.
Every Metrc registry row says NEVER, but metrc_harvests.synced_at has real dates this month. Registry is disconnected from the job that actually pulls Metrc.
Do not treat the registry as a freshness SLA until that wire exists.

## NEXT (after banner + who-runs-sync)

- [ ] Wire HarvestControlBanner on Control Tower when App.jsx is free.
- [ ] File GRANT lines B appended on harvest view.
- [ ] git mv workspace migration 20260828210000 → 20260828200140.
- [ ] Re-pin money-grain after those files.
- [ ] Remaining date-bus pages (~34).
- [ ] Wet-no-dry alert 4h to named manager (editable).
- [ ] Harvest pull link quality 8/15. No auto-fix.
- [ ] Two 380 lb conversion_factors rows. No auto-merge.
- [ ] Connect v_sync_item.last_success_at to the real Metrc worker.
- [ ] Owner call: re-run the 13 Apex items that worked 9–10 Aug (not the 53 never-ran).

## PHASE 1 — 15 Sep

Accuracy: CEO exact counts done. Harvest vs schedule live. Apex book 1739 done.
- [ ] Sync freshness real, not a dead register.
- [ ] Metrc export + Apex OpenAPI coverage matrices.
- [ ] Vendor/software Metrc key confirmed or file-backed documented.
Micromanage items (SKU/reorder, units/hour, grades, empty-cart, shift start, editable policy) stay on this file until ticketed one at a time.

## NEVER

Blend Metrc/Apex. Close shortfall on weak link. Print 0 on refuse. Invent views. Two-way Phase 1. Fire all 66 syncs because the register is red.
