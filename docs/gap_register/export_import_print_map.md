# Export / Import / Print Map — sitewide audit

*Audit date: 2026-08-05. Method: `app/web/src/App.jsx` read in full (2,350 lines). Every view
enumerated: the 19 special-map keys (`tower`, `fg_inventory`, `alerts`, `brain`, `teams`,
`planner`, `dashboards`, `whiteboards`, `tasks`, `messages`, `people`, `integrations`,
`settings`, `help`, `metrc_mirror`, `metrc_mc`, `metrc_mp`, `fg_metrc_check`, `menu_manager`),
the top-bar tools (TimeTools tracker/timer, SyncCenter, Launcher), and the generic
`ModuleScreen` that renders every other `nav_registry` entry (49 entries; drill keys observed
in code: harvest_schedule, testing, lots, licenses, harvests, allocations, work_orders, cash,
orders, action_register, shipping, emp_schedule, time, inv_summary, materials, third_party,
harvest_recon, plan_payroll, issues, spaces, templates…).*

**Owner demand:** "many pages sitewide need export, import and print options."

**Baseline in flight:** a generic **Export CSV + Print** is being added to `ModuleScreen`.
That covers every registry-table screen at once. This document defines (a) what that generic
baseline must do to be worth having, and (b) which custom screens need their **own**
treatment because the generic table path never renders them.

---

## 0 · Global requirements (prerequisites for everything below)

### Generic ModuleScreen baseline (in flight — acceptance bar)
- **Export CSV** must export **all rows matching the current filters** (search term, status
  chip, date range, sort) — not just the 100-row page — and **all scalar columns**, not just
  the 9 displayed. Filename: `{view_key}_{yyyy-mm-dd}.csv`. UTF-8 BOM so Excel opens tags
  (`1A4…`) and `µg` symbols cleanly; quote everything (strain names contain commas).
- **Print** must render the same filtered set with a header (module label, active filters,
  row count, timestamp, printed-by email) and page numbers.

### Print stylesheet (one `@media print` block, app-wide)
The app is dark-first with a black rail/topbar; printing it as-is wastes toner and is
illegible. The print stylesheet must:
- **Force light**: white background, black text, table borders visible, status pills as
  outlined text (no solid fills), no gradients/shadows/animations.
- **Hide**: `.topnav`, `.nav` rail, `.launcher`, filter bars (`.filterbar`, `.statchips`),
  all forms (`.teamform`, `.taskform`, `.chatbox`, credential panels), all buttons
  (`.btn`, `.tibtn`, Sync Center), the drag bar, the rail Metrc widget, the user menu.
- **Show**: a print-only header line per page (screen title · license context where relevant
  · date/time · printed by) — cannabis floor paper gets picked up by inspectors; every page
  must be self-identifying.
- **Unclip tables**: `.tablewrap { overflow: visible }` so no columns are cut; `tr { break-inside: avoid }`.
- **Never print secrets**: the Integrations credential form is `display:none` in print, always.

### CSV import framework (shared component, used per-screen below)
One reusable importer: file/paste input → header mapping (auto-match on normalized names) →
dry-run preview with per-row validation errors → commit with count + audit_events row.
Import is **per-screen and allow-listed** — a generic "import into any table" would bypass
DB gates (COA ship-gate, allocation netting) and is explicitly out of scope.

---

## 1 · Custom screens — Ops side

| Screen (component) | EXPORT | IMPORT | PRINT |
|---|---|---|---|
| **Control Tower** (`ControlTower`, view `tower`) | CSV of `v_control_tower` (metric, value, timestamp) for trend-keeping until `kpi_snapshots` lands; "Daily Ops Brief" PDF snapshot: hero status + KPI counts + Today's Operations tiles + metric groups, values frozen with timestamp | None — every number is computed; importing would violate Law #2 | **Yes — high floor value.** One-page morning-huddle brief (portrait): operational status, alert count, Today's Operations as a compact list, red metrics first. Hide Sync Center, pulse animation, KPI card chrome |
| **Alerts & Reminders** (`AlertsScreen`) | CSV of current alerts (level, text, source module, computed-at timestamp) — attach to shift-change email | None — computed live | **Yes.** Morning exception sheet: tiered list, checkbox column added in print for huddle sign-off. Pairs with the Control Tower brief |
| **Finished Goods** (`FinishedGoods`, 9 tabs of `product_inventory`) | **Highest value.** Per-tab CSV using the tab's exact `FG_TABS` column spec (roundtrips with the team's Google Sheet); "all tabs" export = one CSV per category zipped or a single file with a `category` column | **Yes.** CSV import per tab as the manual alternative to sheet-sync (crew uploads the sheet when Google API hiccups); validates Metrc tag format, expiry dates, statuses; dry-run diff against current rows before commit | **Yes — physical count sheets.** Per-tab landscape sheet: batch, strain, tag (last 8), cases available, size, expiry + **blank Counted / Variance / Initials columns**. Also a pick-sheet variant filtered to `Ready To Ship` |
| **Metrc mirror** (`MetrcMirror`, views `metrc_mirror`, `metrc_mc`, `metrc_mp`) | CSV per dataset tab (packages, plants, harvests, batches, transfers, items, strains, locations, sales), honoring the license filter; **Audit Pack** export: JSON of full raw payloads for a tag/date range — the inspection-ready evidence bundle (registered gap #54 companion) | **Never.** The mirror is the state system of record, read-only by design. Say so in the UI — an import affordance here would be a compliance defect | **Yes — inspector-facing.** Transfer-manifest list and package list per license (MC281714 / MP281909), each page stamped with license number + sync freshness ("synced Xh ago"). Hide dataset tabs |
| **fg_metrc_check** (ModuleScreen + SyncCenter) | Covered by generic CSV; ensure export includes `check_result` | None | Exception worksheet: rows where tag not found in synced Metrc, blank Resolution/Initials columns |
| **People** (`People`) | CSV roster (code, name, position, departments, status); exec-only variant adds current effective rate from `employee_rates` | **Yes (exec-only).** Roster + rates CSV import, effective-dated, audited — the interim write path until the People edit UI ships (register: "Make People screen the write surface"). Validates employee_code uniqueness, department names against `departments` | **Yes.** Floor roster / phone list (name, position, departments, status) for huddles and emergency musters. Rates never print unless the exec explicitly picks the rates variant |
| **Integrations** (`Integrations`) | CSV of `metrc_sync_runs` log (endpoint, license, status, records, error) for support tickets | None — credentials are write-only by design | Sync-run log only. **Credential form must be unprintable** (print CSS `display:none` on the form panel, not just the values) |
| **Time tools** (`TimeTools` top-bar panel) | CSV of my `time_tracks` for a picked week (started, ended, h:mm:ss, note) — the payroll hand-off until the timesheets suite (registered P0) lands | Deferred to timesheets suite (supervisor corrections belong there, not in a personal widget) | **Yes.** Weekly personal timesheet: day rows, daily totals, week total, **signature + date lines** — cannabis payroll is cash-adjacent and wants wet signatures |

## 2 · Custom screens — Work layer

| Screen (component) | EXPORT | IMPORT | PRINT |
|---|---|---|---|
| **Planner** (`PlannerScreen`) | **iCal (.ics)** of the loaded month — every event (harvest, shipment, work order, expiry, shift) as VEVENT with category; CSV of month events (date, type, label, source module) | **iCal import → deferred** until external-calendar connects (registered); **CSV import of harvest_schedule rows** is the useful one now — the planner's own history loaded from spreadsheets (137 rows came in that way) | **Yes — high floor value.** Month grid landscape + a **week/day list variant** (the printable day sheet the auto-scheduler spec keeps promising). Legend stays; nav arrows and Today button hidden |
| **Tasks** (`TasksScreen`) | CSV of tasks (title, status, assignee name, due, priority, tags, created, completed) | **Yes — the onboarding path.** CSV of tasks (ClickUp/Monday export shape: name, status, assignee, due date, priority, tags); assignee matched by employee full name/code with unmatched-row report | **Yes.** Daily task sheet grouped by assignee then status ("who's doing what, by when" on paper); done section collapsed to a count. Hide the create form |
| **Teams** (`TeamsScreen`) | CSV of memberships (team/department, member, status, type=dept\|custom) | CSV of custom-team memberships (team name, employee code) — bulk-staff a crew | Crew roster cards per team for the wall. Low priority |
| **Dashboards** (`DashboardsScreen`) | PDF/PNG snapshot of the active template (widget titles + values + timestamp); CSV of widget values | Layout JSON import belongs to the M4 custom builder — none now | **Yes.** One-page snapshot for the exec meeting; hide "Change template" |
| **Whiteboards** (`WhiteboardEditor` / `WhiteboardsScreen`) | **PNG** of the canvas (strokes are already SVG polylines — serialize SVG + note boxes, rasterize) + **JSON** of `content` for backup/duplication | JSON re-import ("duplicate board" / restore) | Print = the same rendered SVG, fit-to-page. Toolbar and swatches hidden |
| **Chat / Messages** (`ChatScreen`) | Per-channel transcript export, CSV or TXT, with date range (HR investigations, incident documentation — history is append-only for exactly this reason) | None | **Yes.** Transcript print with channel + range header; hide channel rail and input box |
| **Brain** (`BrainScreen`) | CSV of current search results (finder, label, detail); memory text export (.txt, exec-only) | Memory import already exists (textarea); extend to **.txt/.md file upload** into the same `configurations.brain_memory` path | None — interactive surface, nothing to put on paper |

## 3 · Custom screens — Admin & shell

| Screen (component) | EXPORT | IMPORT | PRINT |
|---|---|---|---|
| **Menu Manager** (`MenuManager`, exec-only) | CSV of nav state (view_key, category, label, enabled, admin_only) — config backup before bulk changes | CSV re-import to bulk-toggle visibility (exec-only, audited) | None |
| **Settings** (`Settings`) | None (preferences are per-account and trivial) | None | None |
| **Help** (`Help`) | None | None | Print-friendly full guide: print CSS expands all accordion answers. Nice-to-have |
| **Auth / Launcher / SyncCenter** | None | None | None |

---

## 4 · PRIORITY — top 10 by floor value

1. **Global print stylesheet** — prerequisite; nothing else prints legibly from a dark-themed
   app without it, and it is one CSS block.
2. **Finished Goods count sheets (print) + per-tab CSV export** — the one paper artifact a
   cannabis facility generates weekly without fail; blank Counted/Variance/Initials columns.
3. **ModuleScreen export honors filters + full columns** — the in-flight generic gains 10×
   value if it exports the filtered set, not the visible page.
4. **Planner print (month + week/day sheet) + iCal export** — the printable day sheet is
   already a registered scheduler promise; this is its cheapest first delivery.
5. **Metrc mirror CSV + audit-pack export + license-stamped inspector print** — compliance
   paper on demand; pairs with registered gap #54 (audit-pack).
6. **Control Tower daily ops brief (print/PDF) + Alerts exception sheet** — the two-page
   morning huddle packet; ship together.
7. **Tasks CSV import + daily task sheet print** — import is the ClickUp/Monday migration
   path the owner keeps referencing; the day sheet puts assignments on the wall.
8. **Time tools weekly timesheet print/export with signature lines** — payroll hand-off
   until the timesheets suite lands.
9. **People roster CSV import (exec, effective-dated) + printable floor roster** — the
   interim write path for the roster and the emergency-muster sheet.
10. **Chat transcript export/print** — HR/incident documentation from append-only history;
    small build, disproportionate value the day it is needed.

---

## 5 · Action seeds — `actions_register`

Not executed. Columns: title, priority, source, note, status.

```sql
insert into actions_register (title, priority, source, note, status) values
('Add global print stylesheet (force-light, hide chrome, page headers)', 'P0', 'exports_audit', 'Prerequisite for all printing. @media print: white bg, hide topnav/rail/forms/buttons/filterbars, unclip .tablewrap, break-inside avoid on rows, per-page header with screen title + license + timestamp + printed-by. Integrations credential form display:none always.', 'open'),
('Finished Goods: physical count sheets (print) + per-tab CSV export', 'P0', 'exports_audit', 'Per-tab landscape count sheet using FG_TABS column spec + blank Counted/Variance/Initials columns; RTS pick-sheet variant. CSV roundtrips with the team Google Sheet columns. Highest floor usage of any paper in the building.', 'open'),
('ModuleScreen export: all filtered rows + all columns, not the visible page', 'P0', 'exports_audit', 'Generic Export CSV must apply q/status/date/sort filters server-side and export every matching row and every scalar column (not the 9 shown). UTF-8 BOM, quoted fields, {view_key}_{date}.csv.', 'open'),
('Planner: printable month + week/day sheets and iCal (.ics) export', 'P0', 'exports_audit', 'Month grid landscape plus week/day list print (the promised printable day sheet, v1). .ics export of harvest/shipment/work-order/expiry/shift events with categories. CSV of month events.', 'open'),
('Metrc mirror: per-dataset CSV export, audit-pack JSON, inspector print', 'P0', 'exports_audit', 'CSV per mirror tab honoring license filter; audit-pack export of full raw payloads by tag/date range; license-stamped printable package and transfer-manifest lists (MC281714/MP281909) with sync-freshness line. NO import ever — state system of record.', 'open'),
('Control Tower daily ops brief + Alerts exception sheet (print/PDF)', 'P1', 'exports_audit', 'Two-page morning huddle packet: tower status/KPIs/Today board one-pager, plus tiered alert list with print-only sign-off checkboxes. CSV of v_control_tower for trend-keeping until kpi_snapshots exists.', 'open'),
('Tasks: CSV import (ClickUp/Monday shape) + daily task sheet print', 'P1', 'exports_audit', 'Importer maps name/status/assignee/due/priority/tags, matches assignees by employee name/code, reports unmatched rows, dry-run before commit. Print: tasks grouped by assignee then status, create form hidden. CSV export of all task fields.', 'open'),
('Time tools: weekly timesheet export/print with signature lines', 'P1', 'exports_audit', 'CSV of time_tracks for a chosen week (start, end, duration, note, daily totals); printable personal timesheet with signature+date lines. Payroll hand-off until the timesheets suite P0 lands.', 'open'),
('People: exec-only roster+rates CSV import (effective-dated) and floor roster print', 'P1', 'exports_audit', 'Interim write path for the roster: validated, audited CSV import into employees/employee_rates with effective dating. Print: name/position/department floor roster for huddles and emergency musters; rates excluded unless exec picks the rates variant.', 'open'),
('Chat: per-channel transcript export (CSV/TXT) and print with date range', 'P1', 'exports_audit', 'Append-only history exists for documentation; add the way to get it out. Header with channel + range; hide rail and input in print. HR/incident use.', 'open'),
('Whiteboards: PNG export of canvas + JSON backup/re-import', 'P2', 'exports_audit', 'Strokes are SVG polylines already — serialize with note boxes, rasterize to PNG; JSON content export/import doubles as board duplication and restore.', 'open'),
('Dashboards: one-page snapshot print/PDF and widget-values CSV', 'P2', 'exports_audit', 'Active template with titles+values+timestamp for exec meetings; layout import waits for the M4 builder.', 'open'),
('Teams: membership CSV export/import and crew roster print', 'P2', 'exports_audit', 'Export team/department memberships; bulk-staff custom teams by CSV (team name + employee code); printable crew cards.', 'open'),
('Menu Manager + Integrations: config/log CSV exports', 'P2', 'exports_audit', 'Nav-state CSV backup and re-import (exec, audited) before bulk menu changes; metrc_sync_runs log CSV for support tickets. Credentials remain write-only and unprintable.', 'open'),
('Build shared CSV importer component (map -> dry-run -> commit, audited)', 'P1', 'exports_audit', 'One reusable importer for Tasks/People/Teams/FG/Planner imports: header auto-mapping, per-row validation, dry-run diff preview, commit writes audit_events. Per-screen allow-list only — no generic import-into-any-table, DB gates must stay in the path.', 'open');
```
