# Complete Menu Map — every menu, button and page

Twisted Growers Enterprise OS · 6 August 2026 · **262 enabled pages across 6 surfaces**

Menus are not hardcoded. Every item is a row in `nav_registry`, and the `surface`
column decides which menu it appears in. Change a row, the menu changes. Nothing
requires a code deploy.

| Surface | Menu | Items |
|---|---|---|
| `side` | Left rail — the production floor | 85 |
| `launcher` | Grid icon — the ClickUp-style workspace | 17 |
| `reports` | Reports dropdown | 27 |
| `finance` | Finance dropdown | 20 |
| `tax` | Tax dropdown | 4 |
| `hr` | Human Resources dropdown | 10 |
| `deep` | Not in any menu — appears on its category dashboard | 82 |

---

# 1 · THE TOP BAR

Left to right, always visible.

| Element | What it does |
|---|---|
| **TG logo + "Twisted Growers"** | Brand. Not clickable. |
| **Grid icon** | Opens **TG Workspace** — the ClickUp-style full-screen launcher (section 2). |
| **Breadcrumb** | Shows where you are: *"Cultivation / Harvests"*. Live, follows the page. |
| **Finance ▾** | Dropdown, 20 pages in 6 groups (section 5). |
| **Tax ▾** | Dropdown, 4 pages (section 6). |
| **Human Resources ▾** | Dropdown, 10 pages in 4 groups (section 7). |
| **Reports ▾** | Dropdown, 27 reports grouped by department (section 4). Built like QuickBooks — all reports in one place, never as side-menu items. |
| **Control Tower** | Jumps to the executive overview. |
| **Tasks** | Task boards. |
| **Dashboards** | Dashboard picker. |
| **Whiteboards** | Collaborative whiteboards. |
| **Microphone** | Talk to type — dictates straight into TG Brain. |
| **Alerts** | Alerts and reminders. Carries a count badge. |
| **Messages** | Internal messaging. |
| **Help** | Help and support. |
| **AI ready / LIVE** | Two status lamps: whether an AI backend is reachable, and whether the Metrc sync is current. |
| **Avatar** | Opens the user profile menu (section 3). |

---

# 2 · TG WORKSPACE — the ClickUp clone

Opened by the grid icon. Full-screen overlay, search box at the top, closes with ✕.
**This menu is for work management only** — production pages live on the side rail.

**17 items in 5 groups:**

### Dashboard
- **Workspace Dashboard** — KPIs for work in progress, overdue items and capacity.

### Work — 7 pages
- **Tasks & Boards** — kanban and list views of every task.
- **Timeline & Dependencies** — Gantt-style scheduling, what blocks what.
- **Workload & Capacity** — who is loaded and who is free.
- **Recurring Tasks** — anything that repeats on a schedule.
- **Action Register** — formal actions with owners and due dates.
- **Issue Reports** — issues raised by staff.
- **Dashboard Tasks** — tasks raised directly from a KPI tile, carrying the figure that triggered them.

### People & Spaces — 4 pages
- **Teams** · **Spaces** · **Messages** · **Whiteboards**

### Tools — 3 pages
- **Template Center** — reusable task and project templates.
- **Intake Forms** — request forms that create tasks.
- **Saved Views** — stored filters and layouts.

### Imported from ClickUp — 2 pages
- **ClickUp Tasks (Imported)** · **ClickUp Lists (Imported)** — the migrated history.

---

# 3 · USER PROFILE MENU

Opened by the avatar. Two working sections; the rest are registered and marked **SOON**
so nobody clicks a dead control.

**Working now**
- **Signed in as …** — the account, with role.
- **Change profile photo / Upload photo** — sets the avatar.
- **Theme** — light and dark. *(Neon green is the brand and is not user-changeable.)*
- **Sign out**

**Registered, marked SOON** — each says why in its tooltip
- Presence status — *arrives with the notifications engine*
- Notification preferences — *arrives with the inbox*
- Keyboard shortcuts — *ships with the views engine*
- Install mobile app (PWA) — *registered*
- **Personal tools:** My Work home · Notepad · Screen and voice clips · Personal reminders · Docs · AI notetaker

---

# 4 · REPORTS DROPDOWN — 27 reports

Grouped by department, QuickBooks style.

- **Reports (8)** — Audit Log · Full Accountability (month by month) · Request Scorecard · Harvest Exceptions · Harvest Detail · Drying Room Performance · Monthly Meeting Pack · Metrc Glossary & Page Help
- **Metrc (8)** — Plant Census · Strain Census · Package Inventory · Lab Testing Status · Transfer Ledger · Harvest Yields · Seed to Sale (Strain Chain) · Planting History
- **Cultivation (5)** — Underperforming Harvests · Drying Room Best vs Worst · Drying Room by Month · Late Pulls & Dries · Yield Gap
- **Quality (2)** — Deviations & CAPA · Failed Testing On Hand
- **Inventory (2)** — Aging Stock · Awaiting Allocation
- **Finance (2)** — Unconfirmed Manifests · Loss Register

---

# 5 · FINANCE DROPDOWN — 20 pages

- **Dashboard** — Finance Dashboard
- **Cash & Cost (6)** — Cash & Overhead · Invoices & AR · Overhead & Outlook · Cost Model (per pound) · True Cost Per Pound · Harvest Economics
- **Costs & Loss (1)** — **Actual Cost Per Pound — from real payroll.** Payroll plus overhead ÷ saleable pounds, currently **$591.39**, set against the assumed $1,100, stating exactly which cost lines are missing.
- **Loss (3)** — Cost of Loss · Real Loss (not trim waste) · Real Loss Summary
- **Sales History (2)** — Sales History (every manifest) · Sales History by Month
- **Planning & Forecast (2)** — S&OP & Demand · Demand Forecast
- **Orders & Customers (5)** — Orders · Customers · Shipping · Customer History · Customer Manifests & Documents

---

# 6 · TAX DROPDOWN — 4 pages

- **Tax: Year End Inventory 2025** · **Tax: Year End Summary 2025** — closing position reconstructed for 31 Dec 2025.
- **Tax: Current Inventory Valuation** — today's position at the confirmed rates.
- **Tax: Year End 2025 — what can actually be established** — **read this first.** Only 10 of 271 rows carry a quantity; Metrc exposes no historical snapshot. States plainly that the report is not fileable and names the export needed.

---

# 7 · HUMAN RESOURCES DROPDOWN — 10 pages

- **Dashboard** — Human Resources Dashboard
- **People (2)** — Employees · Wage Bands & Roles
- **Payroll & Budget (4)** — Payroll · Payroll Forecast · Labor Budgets · Staffing & Hiring Plan
- **Time & Scheduling (3)** — Scheduling & Zones · Work Schedules · Time & Attendance

---

# 8 · SIDE RAIL — 85 pages, the production floor

Collapsible categories with **Expand all / Collapse all** at the top. Each category
opens with its own dashboard.

## COMMAND CENTER — 12
- **Overview (3)** — **Control Tower** (executive overview) · **Chief Executive Dashboard** · **Dashboards**
- **Dashboard (1)** — **Command Center Dashboard.** KPIs, seed-to-sale flow strip, money position, stock by stream, watchdog feed. Every tile drills to per-item proof.
- **Decisions Waiting (2)** — **Open Questions** (30 open, 3,444.9 lb at stake) · **Open Issues — a decision is required.** Nothing clears itself; an owner or executive must record fix / leave / ignore / reset with a reason.
- **Alerts & Watchdog (1)** — **Intelligence Briefing.** Every finding as a written investigation: what, where, who, when, why, how detected, what to do, the arithmetic, plus a plain-English tab and the evidence records.
- **Inventory Position (1)** — **Stock On Hand**
- **Assistant (4)** — Budz Assistant · TG Brain · Planner · Goals & Scorecards

## CULTIVATION — 17
- **Dashboard (1)** — Cultivation Dashboard
- **Harvests (4)** — **Harvests** · **Mass Ledger — every pound accounted for** (ten lines per harvest: wet in → water evaporated → dry available → packaged → waste → still to package → what Metrc shows → water not yet entered → what we recorded → whether it reached Metrc) · **Moisture Loss — record it per harvest** (88 closed harvests, 6,796 lb; entries cannot be deleted and cannot claim Metrc entry without a reference) · **Weights & Grading**
- **Rooms & Plants (5)** — **Grow Rooms** (4 tables × 287.5 = 1,150 plants, 56-day cycle) · Room Board (live) · Facility Live Map · Genetics · **Room Turn Audit — PASS or FAIL on 56 days**
- **Schedule & Calendar (6)** — Harvest Schedule · Harvest Calendar (8-Week) · **Plan versus Actual — the 2026 calendar** (all 26 pulls against Metrc; 13 currently off plan) · **Harvest Labour Calculator** (live plant counts, four pace scenarios, fits-the-clock test) · Modify Harvest Schedule · Department Board
- **Discipline & Alerts (1)** — Goals & Targets

## INVENTORY — 13
- **Dashboard (1)** — Inventory Dashboard
- **Stock & Location (9)** — Lots & Tags · **Proof — every item behind every total** (the evidence view: 30 fields per package) · Where Is Everything · Finished Goods (Live Sheet) · SKUs · Supplies & Materials · **Location History — every move with dates** · **Sheet versus Metrc — every disagreement** · **Weight Audit — every unit of measure checked**
- **Allocation Control (2)** — Allocations · Allocation Requests
- **Purchasing (1)** — Vendors & POs

## MANUFACTURING — 12
- **Dashboard (1)** — Manufacturing Dashboard
- **Costing & Yield (1)** — **Production Cost Calculator.** Every formula from the owner's worksheet with the workbook cell named on each line; 41 editable inputs; every change recorded.
- **Production (5)** — Production Flow · Production Pipelines · Pipeline Runs (Live) · Pipeline Stage Aging · Bill of Materials & Yield
- **Schedule & Capacity (2)** · **Turnaround (2)** · **Equipment (1)**

## INFUSED PRE-ROLLS & FLOWER — 6
Dashboard · Production Schedule · Work Orders · Weekly Production & Finished Goods · Machines · Scheduling

## QUALITY — 7
- **Dashboard (1)**
- **Testing (3)** — Testing & Certificates of Analysis · Certificate of Analysis Register · **Laboratory Turnaround — every return recorded** (permanent log, 3-day limit from measured 2026 performance)
- **Compliance (3)** — Licenses · SOP & Training · Safety & Incidents

## METRC — 9
- **Dashboard (1)**
- **Live Mirror (5)** — Metrc · Metrc Cultivation · Metrc Manufacturing · Forensic Trace · Package Forensic Record
- **Report Import (2)** — Report Import · Imported Report Rows
- **Compliance (1)** — **Metrc Corrections — step by step.** Things wrong in Metrc itself, with numbered instructions written for a non-technical operator. Cannot be closed without who, when and a Metrc reference. Cannot be deleted.

## SETTINGS — 26
- **Dashboard (1)** — carries the **admin alerts that cannot be dismissed.**
- **General (5)** — General · Users & Permissions · Menu Visibility by Role · **Menu Manager** (edit the menus themselves) · Help & Support
- **Money & Costs (4)** — **Valuation Rates — what a pound is worth** · **Where every money figure comes from** · **Business Rules — the numbers everything depends on** · **Our Licences**
- **Business Rules (5)** — Storage & Allocation Limits · Conversion Factors · Suppliers & Costs · Purchase Intent by Supplier · Industry Benchmarks
- **Artificial Intelligence (6)** — Assistant · AI Settings · AI Access · Who Pays for AI · AI Usage · AI Spend
- **Data & Imports (1)** — **Sheet Sync — restricted sheets.** Paste or upload; auto-detects the package-tag column and reconciles against Metrc hourly.
- **Connections (2)** · **Programme (2)** — Agent Departments · Go-Live Tracker

---

# 9 · THE `deep` SURFACE — 82 pages not in any menu

These appear at the **bottom of their category dashboard**, collapsed, under
**"Still to be built out — temporary list"**, with a note that they still render
as plain tables. They come off the list as each is built properly.

The side rail was 168 items and unusable. This is where the other 82 went —
nothing was deleted, and everything remains one click from its dashboard.

| Category | Count | Groups |
|---|---|---|
| Command Center | 34 | Alerts & Watchdog · Decisions Waiting · Inventory Position · Laboratory & Quality · Loss & Accountability · Third Party |
| Cultivation | 22 | Discipline & Alerts · Harvests · Rooms & Plants · Schedule · Yield & Performance |
| Inventory | 18 | Allocation Control · Custody & Reconciliation · Purchasing · Stock & Location · Value & Margin |
| Metrc | 5 | Reference Data |
| Quality | 3 | Testing |

---

# 10 · How to change any menu

**Never in code.** Edit `nav_registry`:

| Column | Effect |
|---|---|
| `surface` | Which menu it appears in — `side`, `launcher`, `reports`, `finance`, `tax`, `hr`, `deep` |
| `category` / `category_order` | The heading and its position |
| `subcategory` | The group inside a category |
| `item_order` | Position within the group |
| `label` / `description` | What it is called, and its tooltip and page subtitle |
| `enabled` | Show or hide without deleting |
| `table_ref` | The view or table it renders |
| `view_key` | Matches a React component in `App.jsx` for custom pages; otherwise renders the generic table screen |

`nav_role_visibility` hides items per role — `owner`, `executive`, `planner`,
`dept_head`, `staff`, `readonly`.

**Settings → Menu Manager** does all of this without touching the database.

---

# 11 · FULL PAGE CATALOGUE — what each page records and what users see

**Every page's full description already lives in the database**, in
`nav_registry.description`. It is not documentation written separately — it is
the same text the product shows as the page subtitle and the menu tooltip. That
is deliberate: the description cannot drift from the page, because it *is* the page.

**To regenerate the complete catalogue for all 262 pages at any time:**

```sql
select surface, category, subcategory, item_order, label, table_ref, description
from nav_registry
where enabled
order by surface, category, subcategory, item_order, label;
```

**To produce it as ready-made markdown:**

```sql
select string_agg(
  '- **' || label || '** — ' || coalesce(description,'no description recorded')
  || '  _(view: `' || coalesce(table_ref,'custom screen') || '`)_',
  E'\n' order by category, subcategory, item_order, label)
from nav_registry where enabled and surface = 'side';   -- change surface as needed
```

## The pages that carry the most weight

Of the 262, these are the ones a new agent must understand before touching
anything. Each is a custom React screen, not a generic table.

| Page | What it records | What the user does |
|---|---|---|
| **Proof — every item behind every total** | One row per package, 30 fields | Proves any tile. Tag, cultivar, source harvest, cut date, drying room, location and days there, quantity in its own unit, testing status in words, dates out and back, days at the lab, THC and terpenes or why absent, certificate, manifest, traceability, rate used, value. |
| **Mass Ledger** | Ten lines per harvest | Wet in → water evaporated → dry available → packaged → waste → still to package → what Metrc shows → water not entered → what we recorded → whether it reached Metrc. No pound unexplained. |
| **Moisture Loss** | Per-harvest water adjustment | Records how much, how measured, who, when, and the Metrc reference. Cannot be deleted. Cannot claim Metrc entry without a reference. Closed harvests first. |
| **Production Cost Calculator** | 41 editable cost inputs | Every formula from the owner's worksheet with the workbook cell named on each line. Change an input, everything recalculates, and the change is kept with who made it. |
| **Harvest Labour Calculator** | Pace scenarios vs live plant counts | Picks a room, reads the live Metrc standing count, tests four paces against the Day 1 clock, answers yes or no with the arithmetic. |
| **Valuation Rates** | Dollars per pound per stream | Sets the rate behind every money figure, with basis and who set it, plus per-batch overrides needing a written reason. |
| **Business Rules** | Every threshold the platform judges by | Dry window, ageing limit, harvest open limit, fresh frozen ratio, lab turnaround. Shows how many places use each and whether it is still an unconfirmed default. Requires a stated source before saving. |
| **Intelligence Briefing** | Findings from the forensic sweep | Each opens a written investigation — what, where, who, when, why, how detected, what to do, the arithmetic — plus a plain-English tab and the evidence records. |
| **Open Issues** | Owner decisions on findings | Nothing clears itself. Fix / leave / ignore / reset, each with a written reason, kept permanently. Ignoring is a decision, not a deletion. |
| **Metrc Corrections** | Things wrong in Metrc itself | Numbered instructions for a non-technical operator. Cannot close without who, when and a Metrc reference. Cannot be deleted. |
| **Sheet versus Metrc** | Spreadsheet reconciliation | Every imported row matched to Metrc package by package — in sheet not Metrc, in Metrc not sheet, quantity disagreements — with the gap and what it means. |
| **Weight Audit** | Unit-of-measure integrity | Every unit Metrc sends, whether it is a weight, the correct pounds, and the error a naive grams conversion would produce. |
| **Plan versus Actual** | 26 calendar pulls vs Metrc | Planned date and plants against actual, projected against packaged, verdict of on plan / early / late / missed. |
| **Room Turn Audit** | 56-day room cycle | PASS or FAIL per room-cycle, with days late or early. 54–58 passes for the Sunday/Monday stagger. |
| **Grow Rooms** | Room configuration | 4 tables × 287.5 = 1,150 plants, 56-day cycle. A room missing a measurement is flagged and excluded from per-square-foot figures rather than guessed. |
| **Laboratory Turnaround** | Permanent record of every return | When it went out, when it came back, days there, by month and category, percentage over the 3-day limit. |
| **Actual Cost Per Pound** | Payroll + overhead ÷ saleable pounds | The real figure ($591.39) beside the assumed one ($1,100), stating which cost lines are missing. |
| **Sheet Sync** | Restricted-sheet import | Paste or upload; auto-detects the package-tag column by Metrc's tag format; reports what changed and warns when stale. |
| **Command Center Dashboard** | The daily decision surface | KPIs, seed-to-sale flow strip, money position, stock by stream, watchdog feed. Every tile drills to per-item proof. |

## Every other page follows the same contract

Whether custom screen or generic table, all 262 obey the hard rules in
`CLAUDE.md`:

- The page subtitle states what it records, in plain English
- Every tile and total opens to the individual items behind it
- Missing values say **why** they are missing and what would make them appear
- Quantities show in their own unit — never an invented conversion
- Testing always states out date, back date and days at the laboratory
- Location always carries entered, days there, left, and where it went
