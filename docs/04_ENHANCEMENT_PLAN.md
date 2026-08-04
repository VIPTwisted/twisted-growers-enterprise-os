# TG Enhancement Plan — Features, Functions & Tools

*Answers the owner's question: "Is there anything we're missing? What improvements and
enhancements can we add — features, functions, tools?" Every item is grounded in the v4
audit ([02_CURRENT_STATE.md](02_CURRENT_STATE.md)). Organized as four tiers in build order.*

**Standing requirement #1 (owner, 2026-08-04): payroll budgets are PER-EMPLOYEE at actual
individual rates.** Everyone is paid a different rate; the $22/hr entries are placeholders.
No department-average or default-rate math anywhere in the chain. Woven into Tier 0 (#2),
Tier 1 (#8), and Tier 2 (#13) below.

**Standing requirement #2 (owner, 2026-08-04): every lot links to its COA; the COA/testing
schedule is viewable; all testing is tracked end-to-end. "Very important."** Concretely:
- **COA registry** — one row per COA: lab, sample ID, submitted/received dates, panel
  results (potency, terpenes, pesticides, microbials, heavy metals, residual solvents),
  pass/fail, durable file link (no bit.ly). Every inventory lot, batch, and shipment keys to
  a COA ID. *Audit: 21/94 RTS lots currently have no COA link; no lab is named anywhere.*
- **COA schedule view** — a testing calendar: what submits this week, what's at the lab,
  expected result dates (from the real SLA matrix), QA review queue, releases due vs
  committed ship dates. The Testing & Release sheet already has the columns; it needs the
  SLA data, the records, and a calendar rendering.
- **Hard COA gate** — nothing enters "Ready To Ship" without a linked passing COA; shipping's
  "QA Released?" becomes a lookup of the testing tracker, not a typed Y/N.
- Tier 2 adds the COA exception dashboard + submission/due-date alerts; Tier 3 adds COA
  PDF parsing (auto-extract results), lab portal/API pulls, and Metrc lab-result sync.

---

## TIER 0 — Make the gauges tell the truth (days, all inside the existing workbook)

1. **Re-scope the mass-balance check** to rows with actual data → 495 exceptions collapse to
   the 1 real variance (−0.08 lb). Add a status column: AWAITING ACTUALS / BALANCED /
   VARIANCE / OVER-ACCOUNTED.
2. **Repair the roster column shift** (Loaded Annual Payroll / allocation columns) and repoint
   Department Budget — restores the real $16,440/wk wage bill. Then **replace placeholder
   rates with each employee's actual rate** (the blue-cell input the model was designed for).
3. **Replace exact-string role/department matching with canonical reference tables** +
   dropdowns (Departments, Roles, Product Families, Strains, Rooms F1–F4, Statuses). Kills
   ~11 phantom hires, "Quality/Compliance" vs "Quality & Testing", "Grow Room 1" vs "F1",
   Biscotti/Bicotti, and the 4-row SUMIF anchor fragility in one stroke.
4. **Force full recalc + stale-cache guards** (`=IF(total<>SUM(detail),"STALE","OK")` rows;
   auto-recalc-on-open script). Fixes Control Tower statuses and Dept Budget ghosts.
5. **Fix alert blind spots**: absolute-FG cap so overproduction can't read "OK" at zero
   demand; sync-variance alert (catches the $556K keying error); placeholder-evasion fix
   (SEARCH not equality); In-Full blank handling in Shipping; testing lead-time SUMIFS →
   INDEX/MATCH single-rule lookup.
6. **Strip pre-filled defaults from empty rows** ("On Hand"×249, "Vincent"×500,
   "Pending"×300, Active "Yes"×100) so counts mean something.
7. **Expiry triage + Days-to-Expiry column** — resolve the 8 expired-dated RTS lots
   (2026→2027 typo or quarantine ~6,500 units) and flag the 21 RTS lots without COAs.
8. **Fix format corruption**: counts displayed as 1900-dates, serial dates, the 1905 Year
   column, Saturday default selectors → Monday week convention.

## TIER 1 — Fill the tanks (1–2 weeks; data work with named owners)

1. **Burn down the 770-row production-standards quarantine** (owners already named: Bert —
   extraction; Kyle/Josh — pre-rolls). Resolve the conflicts first: extraction labor $50 vs
   $140, diamonds yield 35% vs 75%, five bubble-hash yields, the −21.4% legacy margin.
   Propagate approved values into Product Standards / BOM & Yield / Equipment Capacity.
2. **Restart the cultivation actuals pipeline** (Jackie): backfill the 3 stuck harvests +
   2 missing ones, fix the two year typos, then per-cultivar grading at trim time going
   forward. This activates mass balance, genetics scoring, and genealogy simultaneously.
3. **Enter the corporate facts**: unrestricted cash (weekly CFO cadence), full overhead
   register, license register with renewal dates, real lab SLA matrix (last-90-day lead
   times), holidays 2027–2030.
4. **Map inventory to SKUs**: 0 of 295 rows done (142 mfg + 153 cultivation). This is the
   gate for label generation, demand netting, and the whole replenishment engine.
5. **Seed the SKU Master + set the 20 category targets** so BUILD NOW / PLAN BUILD triggers
   have something to fire on.
6. **Name the equipment** (rolling machines, cartridge fillers, presses, packaging lines)
   with measured rates instead of the 100%-OEE scaffold.
7. **Load open orders/demand** (Q-P0-01: every open order within 24h; no off-system
   promises) — the demand table is the fuel line for the entire planning chain.
8. **Per-employee rate load**: actual rate per person, per-role planned rates for open seats
   (fill the $0 Assistant/Supervisor wage bands), OT policy per person (Joshua's 50-hr
   target), effective dates for every rate.
9. **Appoint the owners**: Master Production Planner, QA/Testing Coordinator, Sales owner,
   Executive S&OP owner, compliance owner — plus a named backup for Vincent's allocation
   authority (currently a documented single point of failure). Close the 6 P0 questions.
10. **Fix the sync fleet**: share Jackie's calendar link, unblock the manufacturing sheet
    permission, convert the cultivation file to native Google format, correct the SYNC-03
    control total, and store full 24-char Metrc tags (FORMATTED_VALUE) at the sync layer.

## TIER 2 — Power tools on the workbook (Apps Script / Sheets-native; runs alongside Tier 1)

1. **Data-completeness dashboard** — per-sheet % populated, INPUT REQUIRED / REVIEW REQUIRED
   counts by owner. Makes the fuel gap visible instead of forensic.
2. **Import burn-down tracker** — quarantine rows by owner × status with aging; one-click
   approve-and-propagate that writes the value to its target cell and stamps reviewer/date.
3. **Paste-zone payroll importer** — each weekly payroll report appends and extends the
   rolling average (currently frozen at 4 stale weeks); staleness banner.
4. **13-week rolling direct cash-flow tab** — receipts by customer terms, disbursements by
   vendor/payroll/tax week. The standard instrument for a cash-critical company; the monthly
   model can't do it.
5. **Exception dashboards** — expired/near-expiry, RTS-without-COA, over-allocation,
   late POs, headless departments, OT projection — all derivable today, surfaced nowhere.
6. **Nightly KPI snapshot + trend history** (Apps Script) — the Control Tower is
   point-in-time; trends don't exist anywhere.
7. **Alert digest** (email/Slack) of ACTION REQUIRED rows + **sync-health monitor** (alarm
   when a source's last-success ages past 24h — would have caught the March cultivation
   stall in week one).
8. **Edit audit logger** (actor / old → new / timestamp) — the workbook's own blueprint
   demands immutable audit; Sheets can approximate it now.
9. **Data validation + protected ranges everywhere** — dropdowns from the canonical tables,
   numeric-only quantity fields (the "1000*/310" and "TBD" entries that broke imports become
   impossible), locked formula columns.
10. **Scenario switcher** — the three imported flower-price tiers ($741/$970/$1,133) +
    hire-timing and harvest-slip toggles driving Financial Outlook; plus charts (burn curve,
    runway date, harvest yield trend — the workbook has zero charts).
11. **Saved filter views** — all 45 are specified in Filter & Sort Views; implement them.
12. **Working hyperlink navigation** — the Guide's 79 OPEN links are dead text; add a
    navigation index + back-links.
13. **Per-employee payroll budget view** — employee → actual rate → department allocations →
    scheduled vs actual hours → OT projection → loaded weekly/monthly/annual, rolling up to
    department and company. Restricted visibility (pay data stays executive-only, matching
    the Monday map's own privacy rule).
14. **Shift templates + PTO mini-tracker** feeding availability; certification/badge expiry
    table with 30/60/90-day alerts.

## TIER 3 — The platform (the workbook's own CODE-001…012, plus what it omits)

Build the 12 specified modules (P0 first). The blueprint is strong on data model, RBAC,
approval gates, conflict policy, audit. **Add these as CODE-013+ — they are absent from the
current contract:**

| New | Module | Why |
|---|---|---|
| CODE-013 | **Notifications & alerting service** | Deadlines (testing, expiry, licenses, cash) currently live as cell colors; nothing owns delivery/escalation |
| CODE-014 | **AI layer** | Demand forecasting; anomaly detection (mass balance, sync variance, payroll); OCR ingestion (payroll PDFs, COAs); natural-language query; auto-generated daily control-tower brief |
| CODE-015 | **Mobile / shop-floor** | Time clock (geo-fenced), scale-side weight capture per cultivar, barcode/tag scanning, task check-off — the single intervention that makes actuals real |
| CODE-016 | **Document management** | COAs, licenses, SOPs, manifests with versioning + e-sign; kills bit.ly links |
| CODE-017 | **Accounting/GL + payroll adapters** | QuickBooks/Xero mapping, 280E COGS tagging, payroll-provider file export (the column exists; the pipe doesn't) |
| CODE-018 | **Metrc API connector (concrete)** | Read-first nightly reconciliation: packages, plants, harvests, lab results vs planner; full-tag fidelity; diff-based exceptions; transfer/manifest support for shipping |
| CODE-019 | **Hardware integrations** | Scales, barcode/RFID, label printing, grow-room environmental sensors (temp/RH/CO2 — bud-rot losses are recorded but never explained) |
| CODE-020 | **BI warehouse + trends** | KPI history distinct from operational boards; forecast-accuracy (MAPE), OTIF, yield, margin trends |
| CODE-021 | **SSO/2FA + access reviews** | Current policy is "Full Editor for everyone"; blueprint has RBAC but no auth strength or review cadence |

**Platform-native capabilities the workbook structurally cannot do** (the strongest reasons
to build it): multi-level BOM with co-products (biomass → crude 29% → diamonds + remainder;
hash → rosin 81%); finite-capacity scheduling (labor + machines netted against the plan);
FEFO/expiry-aware replenishment; cumulative lot-allocation netting with a hard release gate
(Vincent's control, actually enforced, with timestamped approvals and a deputy); one-click
recall trace (bulk tag → children → shipments → customers); COA-parse-gated "Ready To Ship";
event-driven replenishment → approval → work order → Monday board loop (the columns for all
of this already exist in the workbook, waiting).

**Monday.com additions** beyond MON-001–006: Sales/AR board, Purchasing board, Compliance
board; webhook signature verification; sandbox workspace for the pilot.

## Concepts salvaged from the abandoned attempt (ideas only — no code reused, per owner rule)

Reviewed `TG-Enterprise-Platform` 2026-08-04 (front-end shell, no operational schema, stubs).
Six concepts worth rebuilding fresh in the new OS: (1) **Real-Records-Only rule** — production
views never show sample/placeholder business numbers; empty states say "no records connected"
— adopted as a standing principle; (2) **granular permission framework** — module registry +
feature toggles (global/role/user scope) + per-user permission overrides with a written reason
— becomes CODE-022, the "field rights configurable later" the blueprint promised; (3)
**versioned document workflow** (draft → approved → published, audience-scoped; Employee
Manual/SOP viewer) — folds into CODE-016 Document Management; (4) **persona home screens**
(Admin / Manager / Employee) — the Phase-3 controlled-adoption UI shape; (5) **Policy/Blueprint
Builder** (admin-only in-app config authoring over the configurations table); (6) **AI COO
Agents** surface — already planned as CODE-014.

## Sequencing recommendation

1. **Week 1: Tier 0** — the workbook stops lying. (I can execute most of this directly.)
2. **Weeks 1–3: Tier 1** — data sprint with named owners; the 17 Implementation Questions
   sheet is the checklist and it already prescribes the order (P0 → P1 → P2).
3. **Weeks 2–4: Tier 2** — automation that keeps Tiers 0–1 true without heroics.
4. **Month 2+: Tier 3** — platform build per the blueprint (P0 modules first), Metrc-read and
   Monday one-way pilot leading, exactly as the workbook's own rollout plan phases it.
   Jan 1, 2027 stays a readiness gate, not a forced cutover.

*Industry guardrails throughout: per-employee pay data on restricted surfaces only; no
public links; one-way sync until reconciliation proves clean (4 consecutive weeks per the
rollout plan's own exit criterion); compliance/Metrc facts always win on conflict.*
