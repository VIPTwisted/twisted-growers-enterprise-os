# Intake #2 — Work Management Layer (CODE-023)

*Owner mandate 2026-08-04: adopt the full capability class of modern work-management
platforms (ClickUp-style), customized for TG. Same intake law as always: capabilities
re-engineered natively on our data model — no external code, copy, branding, or design
reproduced. Deep feature mining continues per-milestone from public feature/template/support
pages; this contract defines the scope.*

## Why this belongs in the OS (not beside it)

TG already runs on actions, schedules, approvals, documents, and dashboards — scattered
across modules. The Work Layer unifies them: every operational object (harvest, work order,
CAPA, allocation, shipment) can carry tasks, comments, checklists, and automations without
leaving the system of record. One OS, one work surface — Law #1.

## Capability contract (the classes to build, TG-mapped)

**1. Work items (tasks) everywhere**
Statuses (configurable pipelines per space — Law #4), priorities, assignees + watchers,
start/due dates, recurring rules, subtasks, checklists, dependencies (blocking/waiting),
relationships to ANY OS record (lot, harvest, WO, CAPA…), custom fields (text/number/money/
dropdown/date/person/formula), threaded comments with @mentions, attachments, activity log.
*Upgrades `actions_register` → full `work_items` model.*

**2. Views over the same records**
List · Board (by status/assignee/any field) · Calendar · Timeline/Gantt (dependencies drawn)
· Table (inline edit) · Workload (per-person capacity vs assigned — feeds from
schedule/time modules) · "My Work" home per person. Saved views with filters/sorts/grouping,
shareable, role-scoped. *The workbook's 45 defined views + the 7 view sheets become saved
views here.*

**3. Docs & wiki**
Rich docs with nesting, templates, versioning, approvals, audience scoping — merges into
CODE-016 (SOPs, Employee Manual, batch records). Docs can embed live views and link records.

**4. Automations (no-code)**
Trigger → condition → action engine: status changes, date arrivals, field changes, form
submissions, sync events → assign, notify, create work items, change fields, start
checklists. *This is CODE-013's notification service grown into a full rules engine — and
it's how "when a lot goes RTS without COA, open a P0 task for QA" becomes user-configurable.*

**5. Forms**
Public/internal form builder writing into any module (intake requests, incident reports,
maintenance requests, visitor log). Submissions create work items with routing rules.

**6. Goals & scorecards**
Targets (number/currency/percent/task-completion) rolling up from live records — OKRs for
harvest yield, OTIF, revenue; feeds from the KPI layer (CODE-020), never hand-typed (Law #2).

**7. Dashboards**
Widget grid per user/team: metric cards, charts, view embeds, workload, sprint-style burn.
Control Tower stays the executive exception board; dashboards are the configurable layer.

**8. Time tracking**
Timers + manual entries on any work item, rolling into `time_entries` (already live) —
labor cost per task via per-employee rates (Requirement #1 synergy).

**9. Templates system**
Any space/list/doc/checklist/automation saved as a template and instantiated (e.g. "New
Harvest Cycle" template spawns the full task tree per room per cycle; "CAPA" template;
"New Hire Onboarding" from deep-scope #18). Template gallery curated for cannabis ops —
our answer to their template library, born from OUR workflows.

**10. Collaboration & permissions**
Comments/mentions/notifications with per-user preferences + quiet hours; guest/limited
roles (Phase-3 personas), space-level permissions on top of RBAC (CODE-022); read receipts
on SOPs (training evidence).

## Build placement

- **M4 (Flow)** grows into the Work Layer core: work_items + comments + custom fields +
  saved views + automation engine v1 + forms v1.
- **M5** adds goals, dashboards, templates gallery, workload, docs editor.
- Schema lands as migration 0009 (`work_items`, `work_item_comments`, `custom_field_defs`,
  `custom_field_values`, `saved_views`, `automation_rules`, `form_defs`, `form_submissions`,
  `goals`, `doc_pages` + template tables) — all RLS'd, all audited, nothing hardwired.
- Source mining: public feature/template/support pages reviewed per-milestone for capability
  completeness (concepts only; the 1,170-page feature PDF exceeds machine extraction limits
  — the live pages are the better source anyway).

## The TG difference (why ours beats a clone)

Their tasks float free; ours attach to regulated objects with gates (a task on a lot KNOWS
the lot's COA state). Their automations end at notifications; ours can enforce compliance
(auto-quarantine on failed COA). Their time tracking bills clients; ours costs batches at
real per-employee rates. Work management fused with the system of record — that's the moat.

## Deep-spec: Goals & Scorecards (parsed from the goals feature page, 2026-08-05 — capabilities re-specified, nothing copied)

**Target types:** number · currency · percent · true/false · task-completion — plus the
TG-exclusive **live-metric target**: bind a target to any OS measure (lbs harvested, OTIF %,
COA pass streak, revenue) and progress computes itself from operations. Their goals wait for
humans to update tasks; ours read the business.

**Structure:** a Goal holds multiple targets; goal progress = roll-up % across its targets.
Goals group into **folders** — harvest cycles, OKR periods, weekly employee scorecards —
with a folder view showing every member goal's percentage on one screen.

**Accountability:** one or multiple owners per goal · deadlines tracked · view/edit
**permissions** per user or group (rides the CODE-022 permission framework).

**Cycle goals:** link a harvest cycle's or production week's work to a single goal — the
sprint pattern, translated to cultivation reality.

**Scorecards:** periodic (weekly) roll-ups per person/team/department, fed by the KPI layer.

**Dashboards module (paired):** per-user widget grids — drag, drop, resize, arrange; layouts
persisted per account; widget types: metric card, chart, view embed, goal progress, workload.

**Schema (migration 0012, M4):** goals · goal_targets · goal_folders · dashboard_layouts.
Both modules registered in the nav (Command) with honest M4 tags.
