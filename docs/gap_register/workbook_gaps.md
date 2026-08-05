# Workbook → OS Gap Register

*Audit date: 2026-08-05. Method: all 79 workbook extracts read (headers, formulas, notes, data
rows), all 9 docs + both HTML briefs read, Metrc guide TOC skimmed, then every requirement
compared against the LIVE system: 63 Supabase tables (row counts queried directly), the
49-entry `nav_registry`, and `App.jsx` as deployed.*

## Verdict on "90% was omitted"

**Approximately correct — and verifiable.** Of the 79 sheets:

- **~9 sheets are genuinely live with data**: Workforce Roster (21 employees + 21 rate rows,
  dual-department allocation, tiers, pull budgets), Grow Room Setup (4), Equipment/Machines
  (8), Genetics registry (30 cultivars), Product Families (4, name-only), Departments (8),
  Harvest Schedule History (137 rows), Audit, Workbook Guide (Help/Menu Manager).
- **~54 sheets have at most a schema or a read-only viewer shell** — table exists but 0 rows,
  or a nav entry whose `table_ref` is null (M3/M4 stubs).
- **~16 sheet requirements have no table, no module, and no load at all.**

Two structural findings dominate everything below:

1. **The app cannot write.** `App.jsx` contains exactly one generic `ModuleScreen` (read-only:
   first 20 rows, 8 columns, raw-JSON drill) plus 7 special screens (Control Tower, People,
   Integrations, Settings, Help, Metrc Mirror, Menu Manager). The only `insert/update` calls
   in the entire client are user_settings and the nav toggle. **Not one operational record —
   an order, a weight, an allocation approval, a punch, a PO — can be created, edited, or
   approved in the OS.** Every one of the 79 sheets is an *entry and decision* surface in the
   workbook; the OS currently reproduces none of that. This alone substantiates the owner's
   90% claim.
2. **Metrc sync has never succeeded.** `metrc_sync_runs`: 30 runs, **30 errors, 0 success**;
   every `metrc_*` mirror table has 0 rows (consistent with docs/09 — integrator/software key
   missing). The nav describes "the entire Metrc platform synced"; the live state is an empty
   mirror.

By operable capability the omission is ~90–95%. By schema coverage it is better (~60% of
blueprint entities exist), which is exactly the gap between "database designed" and "system
built."

---

## 1 · Numbered gap register

Severity: **P0** = operations-blocking now · **P1** = needed soon · **P2** = enhancement.

### A — Cross-cutting (these break every sheet at once)

| # | Requirement (source) | What's missing | Sev |
|---|---|---|---|
| 1 | Every sheet is a data-entry + approval surface (all 79; REQ-002) | **No create/edit/approve UI anywhere.** Read-only viewer + 7 special screens only. No forms, no inline edit, no approval buttons. DB gates (allocation netting, COA ship-gate) exist but cannot be exercised from the app | **P0** |
| 2 | Sheet 59 Filter & Sort Views — 45 named management views; REQ-031 (P0): "sorting and filtering by department and other operating dimensions" | **No filtering, sorting, or saved views at all.** ModuleScreen shows first 20 rows unfiltered. All 45 specified views (late orders, BUILD NOW, aging lots, pending Vincent, overdue CAPA…) unimplemented | **P0** |
| 3 | Sheets 65–71 + REQ-041/042 (P0): daily/weekly/monthly **calendar + board** views for department scheduling and production (shift-start, weekly, monthly calendar, lookback) | No calendar, board, timeline, or lookback rendering exists — only the generic table. All 7 view sheets unrepresented | **P0** |
| 4 | Sheet 5 Controls + Law #4 — ~40 operating parameters (shift times, OT threshold/multiplier 1.5×, burden 12%, frozen window 14d, capacity buffer 15%, safety-stock 2wk, testing SLA 1d, harvest cadence 14d, mass-balance tolerance 1%, aging 30d, forecast horizon 13wk, cash) | `configurations` table has **1 row**. None of the workbook's control values are in the DB; nothing can read them. Law #4 ("every business value is database configuration") is unmet | **P0** |
| 5 | Sheet 56/57 Metrc Compliance Map + Event Staging; REQ-036 | Sync deployed but **0/30 runs succeeded; all mirrors empty**; reconciliation_exceptions never populated. Blocked on Metrc Connect integrator key (docs/09 action path) | **P0** |
| 6 | Sheet 45 Daily Control Tower — 16 specified metrics | Tower is live but covers ~10; missing: Harvests Due Next 14 Days, SKUs BUILD NOW, Late POs, OTIF Failures, Overdue CAPA, Overdue Maintenance, Legacy Imports Requiring Review, Failed Source Syncs | P1 |
| 7 | Sheet 46 Model Checks + 78 Leadership Model Checks — self-auditing integrity checks (reconciliations, missing inputs, coverage gaps) with a single MODEL STATUS | No data-integrity / completeness / staleness surface in the OS (docs/07 #0 adoption telemetry also unbuilt) | P1 |
| 8 | REQ-029/030 — explain every column and every page | Help exists at app level; **per-module column glossaries** (present on all 79 sheets) are not carried into the OS | P2 |

### B — People, payroll, org (sheets 1–6, 51, 60–63)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 9 | Sheet 1 Source Payroll — 4 weeks × 21 employees of actual reported hours; rolling 4-week average; paste-zone weekly importer (Tier-2 #3) | Payroll hours history not loaded anywhere (`time_entries` = 0); no import path for the weekly payroll report; rolling average not computed | P1 |
| 10 | Sheet 3 Position Plan — required seats/roles, hours per seat, open FTE, recommended hires, planning hire rate, new-hire wages | No table, no module. Hiring plan absent from the OS (true need ≈ 5–6 hires per audit) | P1 |
| 11 | Sheet 4 + 62 Department Budget / Leadership Payroll — dept payroll rollups, approved override, variance, hierarchy (head/assistant/supervisor/staff) budgets | `labor_budgets` exists but 0 rows; no rollup computation from rates × schedules; no override/variance workflow | P1 |
| 12 | Sheet 6 Executive Dashboard — workforce KPIs (required seats, active FTE, recommended hires, labor gap, loaded payroll, fully-staffed payroll) | Control Tower has no workforce/labor metric group | P1 |
| 13 | Sheet 51 Time & Attendance — punches, scheduled vs actual, 40-hr gap, OT projection, supervisor approval, payroll export status | `time_entries` = 0 and **no clock-in surface** (mobile time clock = CODE-015, unbuilt). Payroll accrual has no input | **P0** |
| 14 | Sheet 60 Management Tiers & Wage Bands — tier codes, leadership premium/week, burden %, OT eligibility, approval authority, rate validation, effective/end dates | `roles_catalog` has only department/name/planned_hourly_rate (9 rows, planned rates unset). No tier codes, premiums, burden, OT flags, effective dating | P1 |
| 15 | Sheet 61 Department Leadership Matrix + 63 Stage Accountability — named head, assistant, supervisor, functional/technical head, allocation authority, budget owner, approval owner, escalation backup per department AND per operating stage | `departments` has only id/name/sort/active/color. **No leadership/accountability model exists**; the workbook's 8 headless departments and 9 uncovered stages cannot even be represented | P1 |
| 16 | REQ-006/LCHK-08 — Jackie/Kyle/Bert/Josh at $1,250/wk; everyone else at actual individual rates (owner standing requirement #1) | Rates table is loaded (21) but **weekly-salary vs hourly basis and OT policy per person (Joshua 50-hr) unverified in OS**; no rate-validation checks (LCHK-04/05: leadership must out-earn staff) | P1 |

### C — Product, standards, BOM, equipment (sheets 7, 8, 18, 24, 25, 50)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 17 | Sheet 7 Product Standards — units/batch, batches/shift, units/labor-hour, crew, ASP, material + packaging cost/unit, safety-stock weeks, testing required, lab/packaging/shipping lead days, monthly growth % per family | `product_families` holds **name + home_department only**. Zero economic or rate fields exist anywhere (task_standards = 0). Every downstream calc (demand cost, capacity, margins) has no inputs | **P0** |
| 18 | Sheet 50 Production Standards Import — 770 quarantined real metrics with review workflow (proposed target tab/field, reviewer, decision) | 770 rows not loaded; **no quarantine/approve-and-propagate workflow** (Tier-2 #2) | **P0** |
| 19 | Sheet 25 BOM & Yield — components per finished unit, yield %, scrap %, gross requirement, standard cost, supplier, lot-trace flag; multi-level co-products (crude 29% → diamonds; hash → rosin 81%) | **No `boms` table exists.** Nav entry is an M3 stub (`table_ref` null). Material requirements, costing, and co-product logic impossible | P1 |
| 20 | Sheet 8 Workflow Routing — routing templates per product family (stage sequence, owning dept, lead times, predecessors, release gates) | No routing-template table; `work_order_stages` is per-WO only, and empty. Work orders cannot inherit a route | P1 |
| 21 | Sheet 18 Testing SLA Matrix — real lab lead times by product × batch-size tier (single-rule lookup, not SUMIFS) | `testing_slas` table exists (correct shape) but **0 rows** — the P0 question Q-P0-04 (last-90-day real SLAs) remains unanswered; promised dates assume 0-day labs | **P0** |
| 22 | Sheet 24 Equipment Capacity — OEE, planned downtime, changeover, net/effective weekly hours + units, next-maintenance date | `machines` (8) holds paces/crew basics; no downtime/OEE/changeover/effective-capacity fields or math; physical daily-ceiling check (Intake #1 concept 8) unbuilt | P1 |

### D — Planning chain: demand → production → FG (sheets 9–11, 16, 19–21, 28, 29, 64, 72)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 23 | Sheet 11 Sales Demand — firm orders + forecasts, OTIF/risk flags, margin, linked WO; Q-P0-01: "load every open order within 24 hours; stop off-system promises" | `sales_orders`/`customers` = **0 rows**. No forecast entity at all (blueprint's `demand_forecasts` table missing). OTIF/late/at-risk logic nowhere | **P0** |
| 24 | Sheet 16 Manufacturing Schedule — stage-level WOs with employee assignment, labor-hour calc, availability vs required, Vincent approval, readiness (BLOCKED/NOT READY), test linkage, FG release, ship linkage | `work_orders`/`work_order_stages` = 0; no scheduling engine, no readiness computation, no release workflow UI | P1 |
| 25 | Sheets 9/10 Holiday + Planning Calendar — working-day engine Aug 2026 → Dec 2030 (weekday × holiday) driving all schedules | **No holidays table, no calendar/working-day function** in the DB. Nothing can compute working days | P1 |
| 26 | Sheet 19 Weekly Dept Schedule — dept × day: required labor vs available staff hours, utilization, budget variance | Not built (no computation layer) | P1 |
| 27 | Sheet 20 Weekly Production & FG — every week 2026–2030 × 4 families: demand, planned production, FG projection, safety-stock shortage, weeks cover, alerts that can't lie at zero demand | M3 stub, no table, no projection engine | P1 |
| 28 | Sheet 21 S&OP Monthly Plan + REQ cadences (weekly 30-min, monthly executive) — monthly demand/production/inventory/revenue/labor/contribution plan with S&OP alerts and approved-vs-draft cycles | M3 stub; blueprint entity `sop_cycles` missing entirely | P1 |
| 29 | Sheet 28 SKU Master Replenishment — ~500 SKUs, min/target/max, on-hand/testing-hold/allocated/available, weeks cover, reorder point, **BUILD NOW / PLAN BUILD triggers**, Vincent approval → linked work order | `skus` = 0 rows (table shape good). No replenishment-trigger engine, no trigger→approval→WO loop. SKU mapping of the 295 imported lots: 0 done | **P0** |
| 30 | Sheet 29 SKU Portfolio Targets — target active SKUs + minimum units per category (20 categories set) | No table, no module | P1 |
| 31 | Sheet 64 Department Schedule Board — per-employee daily assignments with **overlap detection**, shift readiness, blocking dependency; Intake #1 auto-scheduler (quota caps, crew pods, pull budgets, WIP credits, flow balancing, printable day sheets) | `schedule_assignments`/`employee_schedules` = 0; no board, no overlap engine, no auto-scheduler, no day sheets. `shift_templates`, `machine_qualifications`, `wip_snapshots` all empty with no UI | P1 |
| 32 | Sheet 72 Legacy Product Schedules — 831 daily plan/actual rows (Aug–Dec 2026, 4 families; Regular Pre-Rolls 13,600/day thread) as history + approved assumptions | Not loaded anywhere | P1 |

### E — Cultivation & genetics (sheets 14, 15, 30–34, 49, 73, 74)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 33 | Sheet 15 Cultivation Harvest Plan — forward biweekly plan with the full milestone chain: flip → harvest → drying → cure → testing submit → results → packaging → FG release, each with target + actual and owners | `harvests` = 0 rows; harvest_schedule (137) is calendar history only — **no milestone pipeline, no forward plan records, no drying/cure/testing targets** (Controls' dry/cure/testing/packaging days are also unset — INPUT REQUIRED) | P1 |
| 34 | Sheet 34 Harvest Weight & Grading + 49 Yield Source — per-cultivar wet/dry, A/B/C, trim, fresh-frozen, extraction-only, samples, waste, mass balance %, g/sqft; backfill 6 real + 3 stuck + 2 missing harvests; scale-side capture going forward | `harvest_grades` = 0 rows. The cultivation actuals pipeline (dead since March) has no OS restart path — no entry UI, no mobile scale capture (CODE-015) | **P0** |
| 35 | Sheets 30–32 harvest history detail — fresh-frozen splits, F1–F4 timeline, room-cycle (>56d) and facility-cadence (>14d) violation flags + violation summary | harvest_schedule loaded ✓ (includes cadence flags); violation summary/analytics view absent; the 56-day-vs-63-day cadence contradiction (flagged 21×) still unresolved as an operating decision | P2 |
| 36 | Sheet 33 Harvest Production Targets — per-product revenue, units, flower/trim use, trim purchase, leftover-flower targets | Not loaded, no home in the schema | P1 |
| 37 | Sheet 73 Genetics Scoring Controls — approved thresholds (g/sqft, TAC, Grade-A share, waste max, COA reliability, $/lb) + weights (0.3/0.2/0.15/0.1/0.1/0.15), min-3-harvests rule, scale/keep/retire cutoffs 0.8/0.6/0.4 | Not in `configurations`; scoring engine absent | P1 |
| 38 | Sheet 74 Genetics Performance Plan — per-cultivar composite scoring (yield/testing/quality/waste/economics), evidence readiness, planning recommendation (REQ-048 is P0 for the owner) | `cultivars` registry loaded (30) ✓ but no performance metrics, no scores, no recommendation logic — blocked on #34 actuals + #37 controls | P1 |

### F — Inventory, allocation, purchasing, shipping, cash (sheets 12, 13, 22, 23, 35, 38, 41, 42, 52)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 39 | Sheet 12 Inventory & Materials — item-level balances across classes (raw/WIP/packaging/FG): on-hand, on-order, allocated, available, safety stock, reorder point, weeks cover, shortage | Blueprint's `inventory_balances` / `items` tables **don't exist**; lots (0 rows) cover lot-level only; packaging & consumables have no home | P1 |
| 40 | Sheet 13 Raw Material Lots — purchase-to-cash tracking: landed cost/UOM, allocation date, days-to-allocation, purchase-to-release, purchase-to-cash, revenue/ROI per lot, aging alert (>30d "CAPITAL TIED UP") | `lots` has cost/expiry/COA/license fields ✓ but 0 rows and no cash-conversion/aging computation or alert | P1 |
| 41 | Sheet 35 Material Allocation Control — request → Vincent approve/hold/reject → manufacturing release; over-allocation alert; every material entered before use; named backup for Vincent (single point of failure) | DB netting trigger live ✓, but `allocations` = 0, **no request/approval UI**, no deputy/backup model, no pending-decision queue view | **P0** |
| 42 | Sheet 38 Purchase Orders & Vendors — receipt vs damaged/short/free goods, quality status, on-time flag, landed cost, payment terms → committed cash, vendor scorecards; buy-only-against-approved-need | `vendors`/`purchase_orders`/`purchase_order_lines` = 0; no receiving workflow, no vendor scoring, no committed-cash rollup. (Trim make-vs-buy advisor, docs/07 #11 — unbuilt) | P1 |
| 43 | Sheet 41 Warehouse & Shipping — pick, QA-released lookup, Metrc manifest, OTIF (on-time × in-full), damage/shortage, freight, invoice status | `shipments`/`shipment_lines` = 0; ship-gate trigger exists ✓ but no pick/ship workflow, no OTIF computation, no manifest link (Metrc transfers unsynced) | P1 |
| 44 | Sheet 42 Batch Genealogy — one-click backward trace: shipment → FG lot → WO → test → allocation → source harvest/lot, incl. packaging + label lots; recall/hold status | **No table or view.** Nav stub. Recall trace impossible today (blueprint acceptance test CODE-003 unmet) | P1 |
| 45 | Sheet 52 Customer AR & Collections — invoice aging buckets, credit limit, credit hold, collection owner, promise-to-pay, DSO | `invoices` = 0; blueprint's `receipts` table missing; no aging/credit-gate logic (docs/07 #8) | P1 |
| 46 | Sheet 22 Overhead Inputs — every recurring/one-time expense with effective dates (Q-P0-06) | `overhead_items` = 0 rows. Break-even is fiction until loaded | **P0** |
| 47 | Sheet 23 Financial Outlook — monthly revenue/contribution/payroll/overhead → operating cash flow, break-even, runway; weekly cash update cadence (Q-P0-05) | `cash_snapshots` = 0 (cash never entered — was $0 in workbook too); no outlook/runway computation; blueprint's `cash_forecasts` table missing; 13-week direct cash-flow view (Tier-2 #4) unbuilt | **P0** |

### G — Quality, compliance, safety (sheets 17, 39, 40, 53–55)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 48 | Sheet 17 Testing & Release — submit-due from production complete + SLA, late-submission alerts, QA review, release date vs committed ship, shipment impact; owner standing requirement #2 (COA registry + schedule + hard gate) | `test_requests`/`coas`/`labs` all 0 rows. COA ship-gate trigger exists ✓ but with zero COAs it gates nothing; **21 RTS lots without COAs enter the OS unflagged**; no testing calendar view | **P0** |
| 49 | Sheet 53 Compliance & Licenses — every license/permit/filing with expiry countdown, reminder, evidence, fee, escalation — **empty at a licensed operator** | `licenses` = 0 rows. Module live, register never populated. Broader obligations (tax filings, insurance, municipal) also unmodeled | **P0** |
| 50 | Sheet 39 Quality Deviations & CAPA — issue → containment → root cause → CA/PA → verification, overdue alerts, Metrc/customer impact | **No table** (nav stub M3). Nothing to hold a deviation today | P1 |
| 51 | Sheet 40 Maintenance & Downtime — PM planning + breakdowns, downtime hours, units lost, cost, lockout/safety verification, next-PM due | **No table** (nav stub M3); machines have no maintenance dates | P1 |
| 52 | Sheet 54 SOP & Training Matrix — document-version-specific training evidence, competency status, retraining due; qualification scheduling gate (docs/07 #16) | **No table** (M4 stub). `machine_qualifications` empty and unenforced | P1 |
| 53 | Sheet 55 Safety & Incident Log — incidents through investigation, reportability, corrective action, closure | **No table** (M4 stub) | P1 |
| 54 | Metrc guide obligations beyond sync (56-map): waste chain-of-custody with witness, samples ledger, per-license scoping of events, audit-pack export | `license_id` on lots ✓ (0006); `waste_events`, samples ledger, visitor log, audit-pack generator all unbuilt (queued 0007+) | P1 |

### H — Governance, rollout, integration (sheets 26, 27, 36, 37, 43, 44, 58, 75–77)

| # | Requirement | What's missing | Sev |
|---|---|---|---|
| 55 | Sheet 43 Master Action Register — every exception/decision/commitment with one owner, due date, status, evidence; VIEW-018 (overdue P0/P1 daily) | `actions_register` table live but **0 rows** and module is an M4 stub; the SQL block below seeds it from this audit | **P0** |
| 56 | Sheet 26 Implementation Questions — 17 tracked decisions (6 P0 open: late orders, MPS owner, testing owner, lab SLAs, cash, overhead) with decision workflow | Not represented in the OS; the 6 P0 questions remain open and unowned | **P0** |
| 57 | Sheet 27 Leadership & Decision Rights — named authority per operating area; MPS owner, QA/Testing owner, Sales owner, S&OP owner all INPUT REQUIRED; Vincent backup unnamed | No decision-rights register in OS; owners still unappointed (business decision + data load) | P1 |
| 58 | Sheets 36/44 Legacy Data Intake + Source Sync Registry — REQ-035 (P0): daily one-way sync of up to 8 company spreadsheets with row counts, control totals, variance, reconciliation status | **No source-sync capability in the OS at all** (blueprint's `source_connections` table missing). Workbook-side fleet was 1-of-8 live with a $556K unflagged variance. Shadow-period reconciliation currently impossible | P1 |
| 59 | Sheet 37 Rollout & Change Management — phased shadow → parallel → cutover with exit criteria (4 consecutive reconciled weeks); docs/07 #0 adoption telemetry (freshness SLAs, module heartbeats, readiness gate computed live) | No rollout/readiness/adoption surface exists | P1 |
| 60 | Sheet 77 Monday Integration Map — MON-001…006 boards, column mappings, idempotency, conflict queue, webhook events (REQ-044/046) | `integration_mappings`/`sync_conflicts` = 0 and no adapter/webhook worker deployed; awaiting real board IDs from admin (input) + build | P1 |
| 61 | Sheet 58 Requirements Traceability + 75 Source File Coverage — living acceptance register and no-omission signoff | Not carried into the OS (this gap register is the interim substitute) | P2 |
| 62 | Sheet 2/76 CODE-001 — effective-dated role hierarchy; assigning role/tier/rate = Admin → People action, audited | People screen is read-only like everything else; rate/role changes currently require SQL. Effective-dated history exists only in `employee_rates` | P1 |

### I — Workbook-era Tier-2/3 commitments not yet represented (docs 04, 07, 08)

| # | Item | Status | Sev |
|---|---|---|---|
| 63 | Notifications & escalation (CODE-013) — deadlines for testing, expiry, licenses, cash | Nothing owns delivery/escalation; no tables | P1 |
| 64 | Work Layer (CODE-023) — work items, checklists, automations, forms, goals, dashboards, docs | All M4/M5 stubs by design (Messages, Tasks, Goals, Dashboards enabled in nav with no backing tables) — listed here so the stub state is on the register | P2 |
| 65 | Document management (CODE-016) — COA/license/SOP files, versioned, hashed (SHA-256), no bit.ly | No storage integration, no documents table | P1 |
| 66 | Mobile/floor capture (CODE-015) — time clock, scale-side weights, tag scanning, offline-first | Unbuilt; it is the stated single intervention that makes actuals real | P1 |
| 67 | Accounting/280E, BI trends, SSO/2FA, hardware, AI layer (CODE-014/017/019/020/021) | Unbuilt (M5 scope) | P2 |
| 68 | KPI definitions as data (docs/07 #26); kpi_snapshots trend history | `kpi_snapshots` = 0, no definitions table; Control Tower is point-in-time only | P2 |

---

## 2 · DATA NOT YET LOADED

Rows exist in the workbook extracts but not in the live DB (row counts queried 2026-08-05):

| Extract sheet | Rows available | Target table | Live rows |
|---|---|---|---|
| 01 Source Payroll | 21 employees × 4 weeks hours | (payroll history / time_entries) | 0 |
| 05 Controls | ~40 operating parameters | configurations | 1 |
| 07 Product Standards | 4 family standard sets | product_families (fields missing) | 4 name-only |
| 09 Holiday Calendar | ~80 holiday/shutdown dates | — no table | — |
| 11 Sales Demand | open-order/forecast structure (Q-P0-01: load within 24h) | sales_orders / customers | 0 / 0 |
| 18 Testing SLA Matrix | SLA rule structure (real values = Q-P0-04) | testing_slas | 0 |
| 22 Overhead Inputs | overhead register structure (Q-P0-06) | overhead_items | 0 |
| 26 Implementation Questions | 17 decision rows (6 P0 open) | actions_register | 0 |
| 27 Decision Rights | 9 operating-area authority rows | — no table | — |
| 29 SKU Portfolio Targets | 20 category target rows | — no table | — |
| 33 Harvest Production Targets | product target rows | — no table | — |
| 34/49 Harvest Weight & Grading + Yield Source | 6 real harvest weight sets + 3 stuck + backlog | harvest_grades / harvests | 0 / 0 |
| 47 Mfg Inventory Import | 142 lots (24,149 units RTS, tags, COA links, expiry) | lots | **0** |
| 48 Cultivation Inventory Import | 153 lots (flower, smalls ~8kg, trim, 114 third-party) | lots | **0** |
| 50 Production Standards Import | **770 metrics** (run sizes, costs, yields, prices) | task_standards | **0** |
| 28 SKU Master | ~500-SKU catalog + min/target/max; 0/295 lot-SKU mappings | skus | **0** |
| 53 Compliance & Licenses | license register structure (licensed operator!) | licenses | 0 |
| 60 Wage Bands | tier/premium/burden rows | roles_catalog (partial) | 9 (rates unset) |
| 61/63 Leadership & Stage matrices | dept/stage accountability rows | — no table | — |
| 72 Legacy Product Schedules | **831 daily plan/actual rows** Aug–Dec 2026 | — no table | — |
| 73 Genetics Scoring Controls | 10 threshold/weight rows | configurations | not present |
| Metrc mirror (all datasets) | state system of record | metrc_* (9 tables) | **0 — 30/30 sync runs errored** |

Loaded ✓ (for the record): employees 21 · employee_rates 21 · cultivars 30 · grow_rooms 4 ·
machines 8 · product_families 4 · departments 8 · harvest_schedule 137 · nav_registry 49 ·
roles_catalog 9 · audit_events 199.

---

## 3 · Action seeds (P0/P1) — `actions_register`

Not executed. Columns: title, priority, source, note, status.

```sql
insert into actions_register (title, priority, source, note, status) values
('Build create/edit/approve UI — app is 100% read-only', 'P0', 'workbook_audit', 'Gap #1. No operational record (order, weight, allocation, punch, PO) can be entered or approved anywhere in the OS. Every workbook sheet is an entry surface; DB gates exist but cannot be exercised.', 'open'),
('Implement filtering, sorting and the 45 saved views', 'P0', 'workbook_audit', 'Gap #2 / REQ-031 / sheet 59. ModuleScreen shows first 20 rows unfiltered. All 45 management views (late orders, BUILD NOW, pending Vincent, aging lots, overdue CAPA) unimplemented.', 'open'),
('Add calendar/board/timeline views for scheduling and production', 'P0', 'workbook_audit', 'Gap #3 / REQ-041-042 / sheets 64-71. Daily, weekly, monthly calendar, shift-start and lookback views absent; only generic tables exist.', 'open'),
('Load the ~40 Controls parameters into configurations', 'P0', 'workbook_audit', 'Gap #4 / sheet 5 / Law #4. configurations has 1 row. OT 1.5x, burden 12%, frozen window 14d, buffer 15%, safety stock 2wk, cadence 14d, mass-balance 1%, aging 30d, horizon 13wk, etc.', 'open'),
('Fix Metrc sync: obtain integrator key, get first successful run', 'P0', 'workbook_audit', 'Gap #5 / sheets 56-57. 30 of 30 sync runs errored; every metrc_* mirror empty. Follow docs/09: Metrc Connect Integration Request / api-info@metrc.com.', 'open'),
('Load 295 inventory lots (142 mfg + 153 cultivation) into lots', 'P0', 'workbook_audit', 'Sheets 47-48. 24,149 units RTS invisible to the OS. Include full Metrc tags, COA links, expiry; triage the 8 expired-dated lots and 21 RTS lots without COA on the way in.', 'open'),
('Load and review the 770 production standards (task_standards)', 'P0', 'workbook_audit', 'Gap #18 / sheet 50. Build quarantine review + approve-and-propagate workflow. Resolve conflicts first: extraction labor $50 vs $140, diamonds yield 35% vs 75%.', 'open'),
('Seed SKU master and map all 295 lots to SKUs', 'P0', 'workbook_audit', 'Gap #29 / sheet 28. skus=0, mapping 0/295. Then build BUILD NOW / PLAN BUILD replenishment trigger -> approval -> work order loop.', 'open'),
('Load open orders and customers — stop off-system promises', 'P0', 'workbook_audit', 'Gap #23 / sheet 11 / Q-P0-01. sales_orders=0, customers=0. Every open order in within 24h; add demand_forecasts entity for the 13-week rolling forecast.', 'open'),
('Add Product Standards fields and values per family', 'P0', 'workbook_audit', 'Gap #17 / sheet 7. product_families has name only. Units/batch, batches/shift, units/labor-hour, ASP, material+packaging cost, safety-stock weeks, testing lead days.', 'open'),
('Load real lab SLA matrix (last 90 days) into testing_slas', 'P0', 'workbook_audit', 'Gap #21 / sheet 18 / Q-P0-04. testing_slas=0; promised dates currently assume 0-day labs.', 'open'),
('Stand up testing/COA pipeline: labs, test_requests, coas + calendar', 'P0', 'workbook_audit', 'Gap #48 / sheet 17 / owner standing requirement #2. All three tables empty; COA ship-gate gates nothing; 21 RTS lots lack COAs; no testing calendar view.', 'open'),
('Populate the license register with renewal countdowns', 'P0', 'workbook_audit', 'Gap #49 / sheet 53. licenses=0 at a licensed cannabis operator. Every license, permit, filing with expiry, reminder, evidence, fee.', 'open'),
('Enter unrestricted cash and full overhead register', 'P0', 'workbook_audit', 'Gaps #46-47 / sheets 22-23 / Q-P0-05, Q-P0-06. cash_snapshots=0, overhead_items=0. Break-even and runway are fiction until entered; establish weekly CFO cash cadence.', 'open'),
('Build allocation request/approval queue for Vincent + named backup', 'P0', 'workbook_audit', 'Gap #41 / sheet 35. Netting trigger live but no request->approve->release UI, no pending queue, no deputy. Vincent is a documented single point of failure.', 'open'),
('Restart harvest actuals: backfill weights, build grading entry', 'P0', 'workbook_audit', 'Gap #34 / sheets 34+49. harvest_grades=0; pipeline dead since March. Backfill 6 real + 3 stuck harvests; per-cultivar A/B/C/trim/waste entry at trim time.', 'open'),
('Build time & attendance capture (punches -> time_entries)', 'P0', 'workbook_audit', 'Gap #13 / sheet 51. time_entries=0, no clock UI. Feeds 40-hr gap, OT projection, and per-employee payroll accrual at actual rates.', 'open'),
('Load the 17 implementation questions; close the 6 open P0s', 'P0', 'workbook_audit', 'Gaps #55-56 / sheets 26+43. Late orders, MPS owner, testing owner, lab SLAs, cash, overhead — all unowned since the workbook era. Track them here with owners and dates.', 'open'),
('Add missing Control Tower metrics from sheet 45', 'P1', 'workbook_audit', 'Gap #6. Harvests due 14d, SKUs BUILD NOW, late POs, OTIF failures, overdue CAPA, overdue maintenance, imports requiring review, failed syncs.', 'open'),
('Load 4-week payroll hours history and build weekly import path', 'P1', 'workbook_audit', 'Gap #9 / sheet 1. Rolling 4-week average currently frozen in the workbook; add paste-zone/import for each new weekly payroll report.', 'open'),
('Build position plan / hiring module (seats, open FTE, hire rates)', 'P1', 'workbook_audit', 'Gap #10 / sheet 3. True need ~5-6 hires per audit after phantom-hire fix; no home for it in the OS.', 'open'),
('Compute department labor budgets from rates x schedules', 'P1', 'workbook_audit', 'Gap #11 / sheets 4+62. labor_budgets=0; no rollup, override, or variance workflow at per-employee actual rates.', 'open'),
('Add workforce KPI group to Control Tower', 'P1', 'workbook_audit', 'Gap #12 / sheet 6. Required seats, active FTE, recommended hires, labor gap, loaded payroll.', 'open'),
('Complete wage bands: tiers, premiums, burden, OT flags, dating', 'P1', 'workbook_audit', 'Gap #14 / sheet 60. roles_catalog has 9 rows with rates unset; no tier codes, leadership premiums, burden %, OT eligibility, effective dates.', 'open'),
('Model department/stage leadership & accountability matrix', 'P1', 'workbook_audit', 'Gap #15 / sheets 61+63. departments has no head/assistant/authority fields; 8 headless departments and 9 uncovered stages cannot be represented, let alone flagged.', 'open'),
('Create BOM tables and load recipes with co-products', 'P1', 'workbook_audit', 'Gap #19 / sheet 25. No boms table exists; BOM & Yield nav entry is a stub. Multi-level co-products (crude->diamonds, hash->rosin) required.', 'open'),
('Add routing templates per product family', 'P1', 'workbook_audit', 'Gap #20 / sheet 8. Stage sequences, lead times, predecessors, release gates that work orders inherit.', 'open'),
('Extend machines with OEE/downtime/changeover capacity math', 'P1', 'workbook_audit', 'Gap #22 / sheet 24. Effective weekly hours/units and the physical daily-ceiling check for the Control Tower.', 'open'),
('Build work order engine: stages, labor calc, readiness, release', 'P1', 'workbook_audit', 'Gap #24 / sheet 16. work_orders=0; no scheduling logic, BLOCKED/NOT READY computation, or release workflow.', 'open'),
('Create holiday calendar + working-day engine 2026-2030', 'P1', 'workbook_audit', 'Gap #25 / sheets 9-10. No holidays table or working-day function; all schedule math depends on it.', 'open'),
('Build weekly production & FG projection with honest alerts', 'P1', 'workbook_audit', 'Gap #27 / sheet 20. Weekly demand->production->FG projection per family; alerts must not read OK at zero demand (workbook defect #6).', 'open'),
('Build S&OP monthly plan module with approved cycles', 'P1', 'workbook_audit', 'Gap #28 / sheet 21. sop_cycles entity missing; weekly 30-min + monthly executive cadence per Controls.', 'open'),
('Load 20 SKU portfolio category targets', 'P1', 'workbook_audit', 'Gap #30 / sheet 29. Target active SKUs and minimum units per category; gap counts vs actuals.', 'open'),
('Build schedule board with overlap detection and day sheets', 'P1', 'workbook_audit', 'Gap #31 / sheet 64 + Intake #1. schedule_assignments=0; overlap alerts, shift readiness, quota-capped auto-scheduler, pull budgets, printable per-employee day sheets.', 'open'),
('Load 831 legacy schedule rows as history + approved assumptions', 'P1', 'workbook_audit', 'Gap #32 / sheet 72. Aug-Dec 2026 daily plan/actual for 4 families incl. the consistent 13,600/day Regular Pre-Rolls thread.', 'open'),
('Build forward harvest plan with full milestone chain', 'P1', 'workbook_audit', 'Gap #33 / sheet 15. Flip->harvest->dry->cure->test->package->FG release targets and actuals; set the dry/cure/testing/packaging day controls (currently INPUT REQUIRED).', 'open'),
('Load harvest production targets (sheet 33)', 'P1', 'workbook_audit', 'Gap #36. Product revenue, units, flower/trim use, trim purchase, leftover-flower targets have no home.', 'open'),
('Load genetics scoring controls and build composite scoring', 'P1', 'workbook_audit', 'Gaps #37-38 / sheets 73-74 / REQ-048. Thresholds+weights into configurations; scoring engine over harvest actuals; scale/keep/retire recommendations.', 'open'),
('Add item-level inventory balances (raw/WIP/packaging/FG)', 'P1', 'workbook_audit', 'Gap #39 / sheet 12. inventory_balances/items entities missing; packaging and consumables untracked.', 'open'),
('Compute lot purchase-to-cash and aging alerts', 'P1', 'workbook_audit', 'Gap #40 / sheet 13. Days-to-allocation, purchase-to-release, purchase-to-cash, ROI, CAPITAL TIED UP alert past 30 days.', 'open'),
('Load vendors/POs and build receiving + scorecards', 'P1', 'workbook_audit', 'Gap #42 / sheet 38. Damaged/short/free-goods receiving, quality status, on-time, landed cost, committed cash, vendor scoring; trim make-vs-buy check.', 'open'),
('Build shipping workflow with OTIF and manifest links', 'P1', 'workbook_audit', 'Gap #43 / sheet 41. Pick, QA-release lookup, Metrc manifest, on-time x in-full computation, freight, damage/shortage.', 'open'),
('Build batch genealogy trace (harvest->lot->WO->test->shipment)', 'P1', 'workbook_audit', 'Gap #44 / sheet 42. No table/view; one-click recall trace is a blueprint acceptance test and impossible today.', 'open'),
('Build AR aging, credit limits and collection workflow', 'P1', 'workbook_audit', 'Gap #45 / sheet 52. invoices=0, receipts entity missing; aging buckets, credit hold gate, promise-to-pay, DSO.', 'open'),
('Create deviations & CAPA table and workflow', 'P1', 'workbook_audit', 'Gap #50 / sheet 39. No table exists; containment, root cause, CA/PA, verification, overdue alerts.', 'open'),
('Create maintenance & downtime table and PM schedule', 'P1', 'workbook_audit', 'Gap #51 / sheet 40. No table; PM due dates, downtime hours, units lost, lockout verification.', 'open'),
('Create SOP & training matrix with qualification gate', 'P1', 'workbook_audit', 'Gap #52 / sheet 54. Version-specific training evidence; scheduler refuses unqualified/expired-badge assignments.', 'open'),
('Create safety & incident log', 'P1', 'workbook_audit', 'Gap #53 / sheet 55. Incidents through investigation, reportability, corrective action, closure.', 'open'),
('Add waste custody, samples ledger and audit-pack export', 'P1', 'workbook_audit', 'Gap #54 / Metrc map + docs/07. waste_events with witness, samples with per-license limits, one-click inspection export.', 'open'),
('Name the missing owners: MPS, QA/testing, sales, S&OP, backup', 'P1', 'workbook_audit', 'Gap #57 / sheet 27. All INPUT REQUIRED since the workbook era; record decision rights in the OS once named.', 'open'),
('Build source-sync registry for the 8 company spreadsheets', 'P1', 'workbook_audit', 'Gap #58 / sheets 36+44 / REQ-035. No sync capability in the OS; row counts, control totals, variance alerts, reconciliation status per source.', 'open'),
('Build adoption telemetry and shadow-period readiness gate', 'P1', 'workbook_audit', 'Gap #59 / sheet 37 + docs/07 #0. Freshness SLAs per source, module heartbeats, 4-consecutive-reconciled-weeks gate computed live.', 'open'),
('Deploy Monday adapter once board IDs are provided', 'P1', 'workbook_audit', 'Gap #60 / sheet 77 / MON-001..006. integration_mappings=0; one-way pilot, idempotent upserts, conflict queue; needs real workspace/board/column IDs from admin.', 'open'),
('Make People screen the write surface for roles/tiers/rates', 'P1', 'workbook_audit', 'Gap #62 / CODE-001 + owner mandate. Effective-dated, audited changes from Admin->People; currently requires SQL.', 'open'),
('Build notifications & escalation service (CODE-013)', 'P1', 'workbook_audit', 'Gap #63. Testing due, expiry, license renewals, cash staleness; per-user preferences, quiet hours, escalation chains.', 'open'),
('Build document management for COAs/licenses/SOPs (CODE-016)', 'P1', 'workbook_audit', 'Gap #65. Versioned files, SHA-256 hashes, signed URLs, no public objects; kills bit.ly COA links.', 'open'),
('Build mobile floor capture: clock, scale, scanning (CODE-015)', 'P1', 'workbook_audit', 'Gap #66. Offline-first; the stated single intervention that makes actuals real.', 'open'),
('Add rate-validation checks (leadership > staff, $1,250 leads)', 'P1', 'workbook_audit', 'Gap #16 / LCHK-04/05/08. Verify pay basis per person incl. Joshua 50-hr OT policy; alert when leadership rates do not exceed general staff.', 'open');
```
