# Current-State Audit — TG Planner v4

*Method: all 79 sheets extracted (values + formulas) and analyzed by five parallel domain
analysts on 2026-08-04. Every claim below carries a sheet/cell citation in the underlying
reports. Global scan: 161,690 formulas, **0 cached formula errors**, 9,412 "INPUT REQUIRED"
markers.*

## One-line diagnosis

World-class control-system **design** running on roughly **5% fuel**, with ~12 specific
defects that make the gauges lie — while most of the missing fuel already exists in
quarantine/import tabs that were never reviewed or synced.

## The data that IS real (the islands)

| Island | Where | What |
|---|---|---|
| Payroll history | Source Payroll | 21 employees × 4 weeks actual hours (6/29–7/26) |
| Roster | Workforce Roster | 21 employees, 17 active; 4 leads @ $1,250/wk; hourly all at $22 placeholder |
| Harvest calendar | Harvest Schedule History | 137 rows, 26 harvest events 2025-07→2026-12, F1–F4, ~30 cultivars, plant counts, g/sqft projections |
| Harvest actuals | Cultivation Yield Source → Harvest Weight & Grading | **6 of 26 harvests** have real weights (room totals only); 3 more stuck as text placeholders since March |
| Cultivation inventory | Cultivation Inventory Import | 153 rows: packaged flower w/ THCA, smalls (~8kg), trim, 114 third-party lots; counted 7/31 (VT/MH) |
| Manufacturing inventory | Mfg Inventory Import | 142 lots: **24,149 units Ready To Ship**, 16,764 filled, ~417 cases, 29.8 kg 3rd-party concentrate |
| Production standards | Production Standards Import | **~770 real metrics in quarantine** (run sizes, batch costs, yields, prices) — 0 reviewed |
| Legacy schedules | Legacy Product Schedules | Daily calendar Aug–Dec 2026; only Regular Pre-Rolls quantified (13,600/day — consistent end-to-end) |
| Portfolio taxonomy | SKU Portfolio Targets | 20 categories across 6 departments; 7 minimum-unit targets set |
| Governance design | Blueprint, Monday Map, Requirements, Views, Questions | 12 modules, 6 boards, 49 requirements, 45 views, 17 questions — fully authored |

## The engines that are EMPTY (0 records each)

Demand (0 of 400 slots) · SKUs (0/500) · BOMs (0/~300) · Equipment (0/100) · Work orders
(0/500) · Time punches (0/750) · Schedule assignments (0/500) · Purchase orders & vendors
(0/500) · Testing requests (0/300) · Shipments (0/500) · AR invoices (0/340) · **Licenses
(0/~200 — at a licensed cannabis company)** · Overhead (0/250) · Deviations/CAPA (0) ·
Maintenance (0) · Master actions (0) · Batch genealogy (0) · Legacy intakes (0) · Metrc
events (0) · SOP training (0) · Incidents (0) · Unrestricted cash: **$0 entered**

Sync coverage: **1 of 8 sources live** (Mfg Inventory). Blocked: Jackie's harvest calendar
(awaiting link), manufacturing production sheet (permission), cultivation inventory (needs
Google-format conversion). SKU mapping executed: **0 of 295 inventory rows** (142 mfg + 153
cultivation).

## The 12 defects that make the gauges lie

| # | Defect | Where | Effect |
|---|---|---|---|
| 1 | Mass-balance check counts empty scaffold | Model Checks / Harvest Weight & Grading rows 5–504 | **"495 exceptions" = 1 real variance (−0.08 lb) + 494 no-data rows** — alarm noise |
| 2 | Roster column shift (AA/AB/AC formulas misaligned) | Workforce Roster → Department Budget K | **$16,440/wk of real wages reads as $880**; current staff costed ~$0 |
| 3 | Exact-string role matching | Position Plan vs Roster | **~11 of 17 recommended hires are phantoms** (real need ≈ 5–6) |
| 4 | Stale cached statuses (saved w/o recalc) | Daily Control Tower D; Dept Budget totals | 495 exceptions show "INFORMATION" not "ACTION REQUIRED"; totals contradict own details |
| 5 | Row count keyed into currency column | Source Sync Registry P7 | **$556,094 variance on the one live sync — no alert fires** |
| 6 | Alerts blind at zero demand | Weekly Production & FG P; S&OP U | **15M phantom pre-rolls by 2030, all reading "OK"/"BALANCED"** |
| 7 | Placeholder evasion in coverage checks | Leadership Matrix AF18; Stage Matrix X22 | "CFO — INPUT REQUIRED" scores as **COVERED** |
| 8 | Pre-filled defaults on empty rows | "On Hand"×249, "Vincent"×500, "Pending"×300, Active "Yes"×100 | Counts poisoned; 100 garbage SLA rules are *live* |
| 9 | Testing lead time: SUMIFS not lookup + all-zero SLA matrix | Testing & Release L; SLA Matrix | Overlapping rules **sum**; today all lab lead times = 0 days |
| 10 | In-Full logic on blank shipments | Warehouse & Shipping T | Unshipped orders read In-Full "YES" while OTIF reads "FAIL" |
| 11 | Allocation gate not netted or linked | Material Allocation Control J/M/N/V | Cumulative over-allocation of a lot undetectable; release gate satisfied by typing "Released" |
| 12 | 4-row SUMIF anchor | Product Standards A5:A8 hardcoded in Sales Demand / Weekly FG | Any 5th product family silently computes $0 cost, 0 capacity |

## Urgent business items (not software)

1. **Triage 8 expired-dated lots** (~6,500 units) sitting "Ready To Ship" — probable 2026→2027
   year typos, but as written it's expired product staged to sell. Confirm or quarantine.
2. **21 of 94 RTS lots have no COA link** (and existing links are bit.ly shorteners).
3. **License register empty** — renewal/filing risk untracked at a licensed operator.
4. **Cash ($0) and overhead (0 rows) unentered** → runway/break-even are fiction; the model
   currently projects −$6.49M by 2030 off a *hypothetical* fully-staffed payroll while real
   staff cost is invisible (defect #2).
5. **Vincent is a single point of failure** ("manufacturing remains blocked until Vincent
   approves") — every Escalation/Backup cell in the workbook is INPUT REQUIRED.
6. **The cultivation actuals pipeline died in March** — 3 completed harvests sit unweighed as
   text ("Packaging / Machine Trimming / Harvesting") in the source; nothing after 4/27.
7. **Two harvest calendars in force** (Cultivation Harvest Plan "Grow Room 1–4"/14-day cadence
   vs the real F1–F4 63-day history) — and the 56-day room-cycle limit is structurally
   incompatible with a 4-room × 63-day operation (flagged 21 times, never resolved).
8. **Metrc tags stored as 4–5 digit suffixes** everywhere — full 24-char tags exist nowhere;
   two truncated-tag collisions already observed.
9. **6 open P0 implementation questions** (late orders, MPS owner, testing owner, lab SLAs,
   cash, overhead) — all unowned, all Status=Open.

## Naming/identity fractures (break every lookup)

Departments: "Quality/Compliance" vs "Quality & Testing"; "Flower & Specialty Equipment"
exists only in leadership sheets. Roles: "Cultivation Technician" vs "Cultivation Team".
Families: "Flower 3.5g" vs "3.5g Flower". Rooms: "Grow Room 1–4" vs "F1–F4" (no map).
Strains: Biscotti/Bicotti, Sherbet/Sherbert, MAC/MAC 1, Spec Ops/SpecOps, plant counts
embedded in names ("Apple Fritter (380)") splitting cultivar identity into 11 duplicate
scorecard rows. Statuses: RTS/Production Queue (47) vs On Hand (13) vs Pending (17) — no
shared state model. Week starts: Monday per Controls vs Saturday defaults in all view sheets.

## What holds together (credit where due)

Zero formula errors in 161,690 formulas. The one populated production thread (Regular
Pre-Rolls 6,800×2×1 = 13,600/day) is consistent across Product Standards, Weekly Production,
and the legacy schedule. Range wiring between big sheets matches (400/500-row windows agree).
The blueprint, Monday map, requirements traceability, and rollout plan are genuinely
well-designed. The bones are excellent — that is precisely why the data starvation and the
12 gauge defects matter: they're cheap to fix relative to the value of the machine.
