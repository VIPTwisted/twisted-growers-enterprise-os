# Backlog — planned but not built, ranked

> ## OWNER REQUIREMENT, 7 August 2026 — binding
> **"From this platform, those with permissions must be able to work, plan,
> set goals, run budgets and forecast."**
> *(Owner's correction: "from this platform" — the whole OS, not one screen.)*
>
> ### Budgets and forecasting — the surfaces exist, the data does not
> Already built as screens: **Production Calculator**, **Harvest Labor
> Calculator**, **Overhead Inputs**, **Valuation Rates**, **Business Rules**,
> **Planner**. The machinery is further along than anywhere else in the OS —
> `harvest_pace_scenarios` holds 4 scenarios and `schedule_proposals` /
> `schedule_proposal_lines` hold a real proposal (1 and 11 rows).
>
> But the tables those screens should fill are empty: **`labor_budgets` 0 ·
> `demand_forecasts` 0 · `cash_snapshots` 0 · `hiring_plan` 0 ·
> `portfolio_targets` 0 · `product_economics` 0 · `overhead_items` 1.**
> The canary confirms it live — Labor Budgets, Demand Forecast and Cash &
> Overhead all render EMPTY. Per the audit: *"break-even and runway are
> fiction until entered."*
>
> **Defect to fix before forecasting is trustworthy:** `ProductionCalculator`
> carries hardcoded formula constants (÷454, ÷0.877 decarboxylation) under a
> subtitle that reads *"Nothing is hardcoded."* A forecast built on constants
> nobody can edit is not a forecast the team can own (G1, A2). Agent B lane.
>
> Five capabilities, all role-gated:
> - **WORK** — create, edit and approve real records from the dashboard.
>   Today the app is **100% read-only**: not one order, weight, punch or
>   approval can be created in the OS. This is backlog item #1.
> - **PLAN** — build and adjust the schedule and forecast. `PlannerScreen`
>   exists; `harvest_plan_2026` holds 26 rows; nothing can be changed from
>   the dashboard.
> - **SET GOALS** — targets and KPIs, owner-editable rows never code (G1).
>   `kpi_targets` holds **7 rows against 43 tiles**; a `goals` table **does
>   not exist**.
>
> **The permission model behind "those with permissions" is empty:**
> `permission_catalog` **0 rows**, `app_roles` **0 rows**,
> `role_permissions` **0 rows**. Only `nav_role_visibility` (71 rows) gates
> anything today, and it gates *visibility*, not *action*.
>
> **Sequencing rule (Rule Zero):** the permission gate ships **with** the
> first write, never after it. A write path added first and gated later is a
> security hole with a scheduled fix date.
>
> **Why this is also the 2027 gate:** an AI cannot decide anything without a
> definition of good. **Human goal-setting is the input to AI
> decision-making** — every target set here becomes something the thinking
> layer can act on. See [AI_BRAINS_2027.md](AI_BRAINS_2027.md), gates 1 and 3.


*Assembled 7 Aug 2026 from a full read of every design doc and gap register.
Rank = how often and how emphatically the docs stress it. Provenance in
[sources/2026-08-07-docs-forensic-digest.md](sources/2026-08-07-docs-forensic-digest.md).
The platform's own registers (`actions_register` seed blocks in the gap
files) are still marked "not executed" — this page is the readable summary,
not a replacement for them.*

## The big fifteen

1. **Create/edit/approve UI — the app is 100% read-only.** Not one
   operational record (order, weight, punch, PO, approval) can be created in
   the OS. The single finding that substantiates the owner's "90% omitted."
2. **The work layer (CODE-023)** — work items, boards, automations, forms,
   goals, dashboards, time tracking. Whole docs exist; M4/M5.
3. **Testing & COA pipeline with a hard ship-gate.** Owner's standing
   requirement #2 ("Very important"). 39,531 lab-result rows are STAGED;
   `lab_result_values` and `coa_documents` are canonical-empty — called "the
   single largest unrealised gain in the entire system."
4. **`metric_registry` — the one metric spine** so the three dashboard tiers
   stop computing the same fact three ways. Called "the keystone."
5. **Per-employee actual pay rates** — 17 of 21 rates are still the $22/hr
   placeholder. Owner's standing requirement #1.
6. **Notifications/alerts engine + Inbox (CODE-013)** — the topbar bell and
   mail icons are static; owner asked twice.
7. **Production planner + daily scheduler** (pp.py parity, doc 06): derating
   math, time-blocked schedules, printable per-employee day sheets.
8. **Filtering, sorting, saved views, calendar/board/timeline rendering** —
   ModuleScreen shows the first 20 rows unfiltered.
9. **The M2 data loads** — 295 lots, 770 production standards, SKU master,
   BOMs, open orders, POs, cash, overhead, licences (licences = 0 at a
   licensed operator).
10. **Mobile/shop-floor capture (CODE-015)** — "the single intervention that
    makes actuals real."
11. **`page_preferences` + universal DataGrid + unified Tile** — the audit:
    "the heart of your ask and it does not exist."
12. **Metrc reports module** over the staged mirror tables (owner asked three
    times: "EVERY SINGLE REPORT METRC OFFERS").
13. **Goals & scorecards + drag-to-rearrange dashboards** (`goals` table does
    not exist; dashboards only append/remove).
14. **Adoption telemetry** — freshness SLAs, heartbeats, live readiness gate.
    Doc 07's "#0, the one that matters most."
15. **AI layer (CODE-014)** — Ask-the-OS grounded read-only SQL. M5.

Just below the line: router + error boundaries + data-access wrapper (audit
Part 4), document management (CODE-016), batch genealogy / one-click recall
trace, sitewide export/import/print baseline.

## Fastest-moving open items (P0s from the registers, still open 7 Aug)

- Load the ~40 Controls parameters (`configurations` has 1 row → Law #4 unmet).
- Real pay rates; testing/COA pipeline; licence register; cash + overhead
  ("break-even and runway are fiction until entered").
- Load 295 lots (triage the 8 expired-dated ones) and the 770 production
  standards (resolve the $50-vs-$140 extraction-labor and 35%-vs-75%
  diamonds-yield conflicts first).
- SKU master + 0/295 lot-to-SKU mappings; open orders + customers ("stop
  off-system promises"); allocation request/approval queue + a deputy.
- Restart harvest actuals (`harvest_grades` = 0, dead since March).
- Supabase Auth Site URL still `localhost:3000` — every team signup errors.
- Connect GitHub → Netlify for CI deploys.
- Owner accounts still use build-phase passwords (audit Part 8).
