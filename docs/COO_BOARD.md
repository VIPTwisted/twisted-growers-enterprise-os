# COO Board — Twisted Growers Enterprise OS
**As of Friday 4 September 2026, 12:37 EDT.** Grok is CEO/COO of this autonomous build. Claude A/B/C execute tickets. Owner (Vinny) reviews APPLY only.

Phase 1 customer delivery: **15 September 2026**. Implementation window follows (QB, payroll, remaining HR).

Every agent session **must read this file first**. If a ticket contradicts this file, **this file wins**. Do not reopen closed items. Do not invent numbers to match a ticket.

---

## 1. Systems of record (do not reopen)

| Domain | SoR | TG may |
|---|---|---|
| Plants, harvests, packages, labs, manifests, tags | **Metrc** | Read / exception boxes. No POST in Phase 1 |
| Wholesale invoices, price, buyer, credits | **Apex** | Read / recon. No POST in Phase 1 |
| Policy, plan, hours, owners, grades, FG mins, harvest splits | **TG OS** | Versioned policy. Owner/CFO edit |
| GL / payroll | **QuickBooks** | After 9/15. Empty on purpose until then |
| Spreadsheets | Not a SoR | If sheet ≠ Metrc/Apex, sheet is wrong |

Chain: Metrc package/tag → COA/lab → Metrc manifest to buyer licence → Apex invoice to same party (invoice digits + licence digits) → amounts match **or named exception**. Never blend. Never silent-zero.

Licence aliases (RMD705 vs RMD705-P, MRN vs MR) stay reconciled + **memo**. Do not force-break 28 invoices that already match to the cent.

---

## 2. Locked figures (quote only these)

### Waste ledger — CLOSED 4 Sep 2026
Certified. Do not reopen. Do not load again.

| Check | Value |
|---|---|
| Live headers (`metrc_report_imports` mapped_to plant waste, `undone_at` null) | **1** |
| Superseded headers | **36** |
| Rows on cert header `781d044e-6076-4bd0-b110-672d4ca68f6f` | **4,407** |
| Orphaned rows | **0** |
| Distinct keys | **4,407** |
| as_of Jul / Aug | **4,396 / 11** |

B MATCH 6/6. Independent re-read of prod agreed.

### Room turn — QUARANTINED until #107 is applied
**Do not grade staff. Do not terminate from the live view.** Old `v_room_turn_audit` groups by harvest **date**, so a 1–2 day takedown (normal ops, 92% of pulls) prints as a 55-day-EARLY FAIL that never happened.

Owner ops fact: a takedown is **a day, ~1.2, two if short-staffed**. That is not a room turn.

Rewrite is PR **#107** (draft, not applied). Consecutive calendar days in the same room = **one pull**. `cycle_days` = pull_start − previous pull_start. Target `f_rule('room_cycle_days')` (56) ±2. Gap **< 20 days** = EXCEPTION (partial/straggler), not FAIL.

Measured on live mirror, 4 Sep 2026, F1–F4, freezer/biomass out:

| | Count |
|---|---|
| Harvest start dates in | 90 |
| **Pulls out** | **52** |
| Judged gaps | 48 |
| **LATE vs 56** | **43** |
| PASS | 1 (F2, 57 days) |
| EARLY | 0 |
| EXCEPTION (`<20`) | 4 |
| FIRST (one per room) | 4 |

Per room: F1 12 pulls / 11 late · F2 15 / 10 late, 1 pass, 3 exception · F3 12 / 11 late · F4 13 / 11 late, 1 exception.

**F1 15–16 Jul 2024 is ONE pull:** pull_id `F1-20240715`, takedown_days 2, plants **1,114** (773+341). No plants invented.

**Do not quote:** 85 FAILs. 46 pulls. 73.9 days. Labor Calculator 1,150 as room capacity.

**46 was cycles (gaps), not pulls.** Ticket arithmetic was wrong; #107 was right to refuse it.

F2 17-day and F4 11-day stay **EXCEPTION**, out of the judged average.

### Conversion / dry equivalent
Fresh frozen → dry at **4.5 : 1**. Not 4.17. Not 4.0. Workbook that used 4.17 is **wrong until fixed**. Do not load OS Sync from that workbook.

### Room capacities (`conversion_factors`)
F1 **1140** · F2 **1050** · F3 **1140** · F4 **1050**. Labor Calculator B2 (1,150) is **crew-sizing**, not room size.

### Apex recon (live)
Order book **1,739**. Buyer licence is part of the match key. Preserve `link_status === "MATCHED"` string (silent-zero if renamed).

Statuses that exist: MATCHED, VALUE DIFFERS, FALSE MATCH (money differs / money reconciles), APEX ONLY, PRE-KEY unmatchable, cancelled, no line items, zero value, ambiguous.

Twiste-303: Apex $1,800 vs buyer-restricted Metrc $1,800. Unrestricted key was a false $74k match.

### Moisture
Owner band **70–77%** is the flag. Percentiles are context only. Do not flag 173 harvests from percentiles.

### $1 floor
Unchanged through 9/15.

### Cost / 280E
`overhead_items` has one row **$285,000/month**, `is_280e_cogs = TRUE` for the whole amount. **Do not flip that row.** Workbook `TG-280E-True-COGS-Model.xlsx` is a structure for later. **No OS Sync. No migration from it.** QBO is empty; do not invent COGS.

### Alerts (measured, not this week's build)
`alert_outbox`: **1,640** rows, **1,629 unsent**. After HR + room-turn ship, next product job in this family is **send or refuse**, not more alert types.

---

## 3. Open PRs

| PR | Job | State | Rule |
|---|---|---|---|
| [#108](https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/108) | HR dashboard renders (`dept_dash_hr` no longer overwritten by `DEPT_BY_VIEW` spread) + quarantine banner on room-turn page | **open**, not draft | Merge **first** after B MATCH. No SQL |
| [#107](https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/107) | `v_room_turn_audit` pull-grouped | **draft** | Merge **second**, then APPLY SQL. After apply, #108 banner becomes a lie — rewrite/drop same day |
| [#105](https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/105) | Finance customers period | draft | **HOLD** |
| [#104](https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/104) | Discrepancy cases | draft | **HOLD** |
| [#94](https://github.com/VIPTwisted/twisted-growers-enterprise-os/pull/94) | Tax Center empty GL | draft | **HOLD** |

#108 CSS: **append-only** `.cc-quarantine` in `commandcenter.css`. Existing rules / tokens untouched. Leave `go={setView}` on TgWorkspace.

---

## 4. Merge / apply order (nothing until B MATCH + owner APPLY)

1. **#108** (front end, no SQL)
2. **#107** (view) then **prod APPLY**
3. Banner follow-up (quarantine text is wrong once pull-grain is live)
4. **Finished-goods par / backorder / split freight** (ticket already written)
5. Period bus remaining 34 pages
6. Alert send-or-refuse

Do not merge 94 / 104 / 105. Do not start 280E schema. Do not POST Metrc or Apex.

---

## 5. What each lane does next

| Lane | Now | Not |
|---|---|---|
| **B** | MATCH/FAIL #108 and #107. Stop | Merge, writes, new tickets |
| **A** | Idle until APPLY #108. Then banner follow-up after #107 | Theme tokens, patches.css colour swaps, worktrees, `#94` |
| **C** | Idle. Waste closed. After #107 APPLY, FG par (Metrc on-hand = active packages only) | Re-bind waste, 280E, Metrc writes |
| **Grok** | Board, merge order, APPLY gate, accuracy | Local Claude desktop sessions |

### FG par (queued — do not start until #108+#107 land)
- On-hand = Metrc **active** packages qty > 0. Not PIT. Not Packages Inactive.
- Apex invoice = demand.
- Alert: on-hand < reorder AND open Apex demand.
- Split-ship: >1 manifest or >1 Apex delivery date = EXCEPTION.
- Freight $ only if Apex has a charge; else **UNKNOWN**. Do not invent GP if cost is $0.
- Par / u/hr / hours = policy rows, owner/CFO only. Managers cannot green a grade by lowering the target.

---

## 6. Process rules for agents

1. **One session, one job.** Do not `--resume` a live session (forks lose tickets).
2. No worktree isolation for A if PowerShell `$()` prompts freeze the job. Branch in the real checkout.
3. Do not write `.claude/settings.local.json` (untracked, not gitignored).
4. PR, do not merge, unless the ticket says APPLY.
5. If a required proof number disagrees with live data, **raise it in the header**. Do not tune the query to hit the ticket.
6. `CREATE OR REPLACE` views. Never `DROP … CASCADE`.
7. Missing data = gap or refusal. Never a zero that means “no grant.”
8. Omit nothing from nav. Re-parent only. Role-hide allowed. Delete forbidden.

---

## 7. Closed today (4 Sep)

- Waste header bind + supersede 36 extras.
- Room-turn defect named: date grain vs pull grain.
- HR dashboard collision named: `dept_dash_hr` declared then spread-overwritten.
- 4.17 conversion rejected.
- 1,150 as room capacity rejected.

---

## 8. Still true from earlier waves

- Apex book is the whole 1,739 (PostgREST 1,000-row cap was a silent year-cut). Search sets range aside.
- C2 exception queues live. Role gate: manager/dept_head see queues via SECURITY DEFINER copies; raw Metrc RLS untouched.
- Period bus exists; 34 bespoke pages still draw numbers without it.
- Schema-baseline stays **strict**.
- Two-way Metrc/Apex writes = Phase 3, after P1 is daily habit + legal/API gates.
