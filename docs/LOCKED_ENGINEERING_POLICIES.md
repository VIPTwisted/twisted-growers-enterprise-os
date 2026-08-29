# Locked engineering policies

Adopted 29 Aug 2026 by CEO ruling. Binding on A, B, C, and Grok.
A policy with no gate is hope. Where a gate exists it is named.

Delivery: implementation 15 Sep 2026. Then QBO + payroll + remaining HR.
Two-way Metrc/Apex is Phase 2.

## This morning (already burned us)

| ID | Policy | Gate |
| --- | --- | --- |
| P1 | Filename = `schema_migrations.version` before the PR opens. No `pending`, `_draft_`, placeholder hour. | `migration-pin-travels.mjs` placeholder names |
| P2 | Apply and file are one ticket. If prod ran it, git has the stamped SQL the same hour. | `migration-drift.mjs` |
| P3 | Tree change and money-grain pin are one PR. No pin-only follow-up. | `migration-pin-travels.mjs` |
| P4 | A view-creating apply includes a schema baseline dump in the same PR. | `schema-baseline-fresh.mjs` |
| P5 | One writer to production. Other lanes file only. | Process — CEO |
| P6 | Branch is cut from `origin/main` in the hour work starts. | Process — first line of every ticket |
| P7 | No MERGE without Gates success on that SHA, pulled the same turn. | CEO |
| P8 | Migration file lists come from `git ls-files`, not `readdirSync`. | helper on #95; wire after harvest |
| P9 | Certified close: insert-or-raise, never upsert. No quantity if the export has none. | PIT migrations + `CERTIFIED_CLOSES.md` |
| P10 | Accuracy law. Apex = invoice SoR. Metrc = custody SoR. Gaps are named statuses. No blended total. | recon views |
| P11 | Empty is not zero. Missing GL / QBO / units-per-hour says missing. | empty-state + Tax Center |
| P12 | No ingest load, no two-way write, no QBO write on prod this week. | CEO |
| P13 | No docs-only PR onto `main` during delivery week. | CEO |
| P14 | A new critical assertion must run within 60 minutes or it is a finding. | watcher |
| P15 | When two lanes both applied, one hygiene PR: files + dump + one pin. | CEO |

## Through 15 Sep (look past this morning)

| ID | Policy | Why |
| --- | --- | --- |
| P16 | **9/15 definition of done.** Live hash = `origin/main`. Gates green. Harvest microscope on FR4 week ending 17 Aug. Recon groups sum to the book. Exception queues visible to the six roles that can read them. Period bus on Control Tower, Command Center, Cultivation, Finance orders/sales. Owner is not the click-tester. |
| P17 | **Owner is not QA.** Proof is SQL + shipped chunk + Gates. A screenshot from the owner is a defect report, not a test plan. |
| P18 | **Period bus is the only date system.** No second preset catalog in React. `nav_registry.default_range` is the default. Search may set a range aside and must say so. |
| P19 | **No silent row cap.** Any list that can exceed PostgREST 1000 uses the paging primitive. A cap must print itself. |
| P20 | **Department home first.** Every module has one CEO-grade dashboard. Child pages stay; they are not omitted. Condensing ≠ deleting. |
| P21 | **Policy is a row, not a literal.** Reorder points, hours, week start, 380 lb floor, 70–77% moisture, units-per-hour goal — editable by owner/CFO with permissions. Sibling views that hardcode the same number must show divergence, not hide it. |
| P22 | **Hours and week start are editable.** Monday start is default, not compiled. Falling behind changes the frame from the same table. |
| P23 | **Spreadsheets reconciling to the OS are not a second SoR.** Sync is a match-or-exception. Never a silent overwrite of Metrc or Apex. |
| P24 | **Metrc API outage is a first-class status.** A stale mirror says stale + as-of. It does not look like zero inventory. |
| P25 | **Preview databases prove schema, not numbers.** `with_data: false`. Quantity proof is read-only against prod or it is not proof. |
| P26 | **Nav omit-nothing.** Disable only with an owner ruling recorded on the row. `default_range` null on an enabled activity page is a defect. |
| P27 | **Menu visibility and data access are one list.** A role that can open a page cannot see four zero tiles. Gate in the view, do not widen raw Metrc RLS without an owner ruling. |
| P28 | **Tax and 280E never invent a number.** Empty GL stays empty. Doctrine text comes from the table. Unverified citations stay chipped. |
| P29 | **Feature freeze 10 Sep 23:59 ET.** After that: defects, pins, dumps, QBO/payroll wiring only. No new modules. |
| P30 | **Implementation week (15 Sep+) is QBO + payroll + remaining HR.** Not new Metrc write paths. |
| P31 | **Phase 2 only:** two-way Metrc, two-way Apex, ingest of the 67 staged files after MC-file analysis. |
| P32 | **Dual-licence PIT key** stays an open defect until a dedicated PR. Do not sneak it into harvest. |
| P33 | **Credential-bearing SQL is never filed.** Mirror withholds. Rotation after 15 Sep unless a write-capable secret leaked. |
| P34 | **Agent stop.** Done means: PR number, stamped versions, what was applied, what was not, Gates on that branch. No essay. |
| P35 | **Live site lag is a P0.** `deploy-watch` red means the floor is on old software. Fix publish before new features. |

## Merge order until hygiene is green

1. C `git mv` harvest files onto `20260829140236` and `20260829140422`, open PR, dump if +9 views.
2. B one hygiene PR: those files + dump + #96 PIT SQL + one pin.
3. #95 (this branch) after hygiene is on `main` — pin-travels gate + git list wire.
4. #94 Tax Center and #89 period bus stay draft until P16 dashboards are honest.

Ingest stays off prod (P12, P31).
