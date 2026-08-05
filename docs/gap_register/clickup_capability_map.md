# Gap Register — ClickUp Capability Map (CODE-023 intake)

**Date:** 2026-08-05 · **Sources:** public marketing pages (clickup.com/features/*, /templates,
/brain, /integrations, /plans/enterprise, /download) reviewed live this date.
**Legal boundary:** capability *concepts* only. No code, CSS, copy, screenshots, or branding
was captured. Every MISSING spec below is re-specified natively against TG's regulated
object model (lots, COAs, harvests, work orders, Metrc sync, per-employee labor rates).

**Status legend:**
- **HAVE** — live in the TG OS today
- **PLANNED** — covered by the M4/M5 work-layer scope (doc 08, migration 0009)
- **MISSING** — in no current plan; TG-native build spec given

TG baseline (verified against doc 02/05/08): DB-driven nav + Menu Manager, dual themes,
Control Tower KPIs + tiered alerts, Metrc sync mirror, effective-dated payroll rates,
time entries, machines, harvest schedule, lot/COA ship-gate + allocation netting, append-only
audit, action register, integrations vault, Help guides. PLANNED stubs: work items/boards,
messages, goals & scorecards, dashboards, docs/wiki, automations, forms, granular RBAC,
templates.

---

## 1. Tasks & Work Items

| Capability | What it does for the user | TG status | TG-native build (MISSING only) |
|---|---|---|---|
| Tasks (assignee, due date, status) | Atomic trackable unit of work | PLANNED (`work_items`, 0009) | — |
| Subtasks, nested to N levels | Break work into a tree | PLANNED | — |
| Checklists inside a task | Micro-steps without full subtasks | PLANNED | — |
| Custom statuses per container | Pipelines match the team's real process | PLANNED (per-space pipelines, Law #4) | — |
| Custom task **types** (e.g. Bug, Lead) | Different work shapes with own fields | HAVE-equivalent | TG's types are native domain objects: WO, CAPA, IPM event, maintenance ticket. Add `work_item_types` registry so ops can add their own without a migration. |
| Priorities (urgent → low) | Flag what matters first | PLANNED | — |
| Dependencies / relationships (blocking, waiting-on, link-to-anything) | Sequence work; connect tasks to other records | PLANNED | TG twist: `work_item_links(target_type, target_id)` points at ANY regulated row — a task on a lot reads the lot's COA state live. |
| Multiple assignees + watchers | Shared ownership, passive followers | PLANNED | — |
| Tags | Cross-list categorization | PLANNED | — |
| Recurring tasks (daily/weekly/monthly rules) | Scheduled routine work auto-recreates | PLANNED (recurring rules in work-item spec) | Ensure generator covers cultivation cadences: per-room daily checks, weekly IPM scouting, tied to `rooms`/`machines`. |
| Milestones | Mark critical timeline points | MISSING | A `milestone` flag on work_items + rendering in Timeline view. Cannabis anchors: harvest date, COA due, transfer window. One column, one badge. |
| Task templates | Reuse pre-made task structures | PLANNED (templates system) | — |
| Task tray / minimize | Park open tasks without losing place | MISSING | Client-side only: pinned-work-items strip in the shell footer (localStorage + `user_prefs`). Low effort, do with M4 UI. |
| Epics / groupings | Roll related tasks into a larger objective | PLANNED (folders/parents) | — |
| Reminders (personal) | Private nudges not tied to team work | MISSING | `reminders(user_id, due_at, note, target_type/id)` + surfacing in Inbox and My Work. Small table, big daily-driver value. |
| My Tasks / Home page | Personal mission control: assigned work, recent, agenda | MISSING | **P0.** `/me` home: today's assigned work items, clock-in state, unread SOP acknowledgments, my harvest-schedule shifts, my open approvals. All queries over existing tables + work_items. |

## 2. Hierarchy & Organization

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Workspace → Space → Folder → List | Nested containers scope work, views, permissions | PLANNED (spaces/lists in 0009) | — |
| Subfolders / deep nesting | Extra layers for big orgs | MISSING | Defer; TG's facility → room → table physical hierarchy already covers the real nesting need. Revisit only for multi-license. |
| Everything view (cross-container) | One flat view over the whole workspace | PLANNED (saved views, no container filter) | — |
| Spaces settings (features on/off per space) | Turn views/automations on per team | MISSING | `space_settings jsonb` on spaces — Menu Manager pattern already does this for nav; extend it, don't rebuild. |

## 3. Views

| Capability | What it does | TG status | Build |
|---|---|---|---|
| List view (sort/filter/group) | Dense triage list | PLANNED | — |
| Board / Kanban (drag by status or any field) | Visual pipeline flow | PLANNED | — |
| Calendar view | Date-placed work | HAVE (harvest schedule) + PLANNED (generic) | — |
| Gantt / Timeline (dependencies drawn) | Schedule with dependency arrows | PLANNED | TG twist: overlay Metrc phase windows (veg→flower→harvest→cure) as fixed bands under the bars. |
| Table view (inline-edit spreadsheet / no-code DB) | Fast bulk editing | PLANNED | — |
| Workload / Box view (capacity per person) | See who's over/under capacity | PLANNED (feeds from schedule + time modules) | TG twist: capacity in labor **dollars** via effective-dated rates, not just hours. |
| Mind Map view | Hierarchical idea tree → tasks | MISSING | Skip (P2). Whiteboard-class; no regulated-ops payoff. |
| Map view (geo tasks) | Location-pinned work | MISSING | P2 unless outdoor/delivery: `location geography` field on work_items + Leaflet pane. Useful later for transfers/manifests routing. |
| Activity view | Stream of all edits/comments | HAVE (append-only audit) | Surface the audit table as a filterable saved view — read-only UI over what exists. |
| Embed view | External web app inside a view tab | MISSING | `saved_views.kind='embed'` + URL allowlist in integrations vault. One sprint-day. |
| Portfolios (cross-project rollup) | Health of many projects at once | MISSING | P1-late: `portfolio` = saved set of harvests/WOs with computed health (on-time %, COA pass rate, cost vs plan). Reuses KPI layer; becomes multi-facility rollup later. |
| Saved views: filters, sorts, grouping, sharing, pinning, role-scoping | Personal + team lenses over same data | PLANNED (`saved_views`) | — |
| "Me mode" / personal filter | One click to only-my-work | MISSING | A default filter token (`assignee = me`) honored by every saved view. Trivial once views land. |

## 4. Docs & Knowledge

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Rich docs with nested pages | Wikis, SOPs, structured documents | PLANNED (`doc_pages`) | — |
| Real-time co-editing + live cursors | Simultaneous editing | MISSING | Defer real-time CRDT (P2); ship last-writer-wins + edit-lock banner in M5. Supabase Realtime presence covers "who's viewing" cheaply. |
| Inline comments → convert to task | Feedback becomes work | PLANNED (comments) + one action | — |
| Version history + rollback | Audit trail of edits, restore any state | PLANNED | TG twist: versions are append-only rows — same discipline as the audit ledger; regulators love diffable SOP history. |
| Doc templates | Start from proven structures | PLANNED | — |
| Embeds (image/video/code/live views) | Rich media inside docs | PLANNED (embed live views per doc 08) | — |
| Per-doc permissions (view/comment/edit) | Control exact access | PLANNED (RBAC layer) | — |
| Wiki verification / knowledge management | Mark canonical, keep fresh | MISSING | `verified_by/verified_at/review_due` on doc_pages + stale-SOP alert into the tiered-alert system. This is a compliance feature for TG, not a nicety. |
| Notepad (personal scratch) | Private quick notes → tasks | MISSING | P2: per-user `notes` table + convert-to-work-item. |
| Read receipts on docs | Prove who read the SOP | PLANNED (training evidence, doc 08) | — |

## 5. Whiteboards & Canvas

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Infinite canvas, shapes, connectors, sticky notes | Visual brainstorming | MISSING | P2. If ever: thin tldraw-style canvas persisted to `whiteboards(doc jsonb)`; convert sticky → work_item. Not a cannabis differentiator. |
| Convert canvas objects to tasks | Ideas become execution | MISSING | Bundled with above. |
| Canvas/Cards (freeform dashboard layouts) | Portable info cards anywhere | MISSING | Covered better by TG dashboards widget grid — skip separate canvas. |
| AI image generation on canvas | Text-to-visual inside the board | MISSING | Skip. No regulated-ops value. |

## 6. Automations

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Trigger → condition → action rules | No-code busywork removal | PLANNED (`automation_rules`) | — |
| Triggers: task created/status/date/field change, form submitted | React to workspace events | PLANNED | TG adds regulated triggers: COA result posted, Metrc sync delta, lot state change, harvest stage advance, timesheet submitted. **This is the moat — their automations end at notifications; TG's enforce compliance (auto-quarantine on failed COA).** |
| Actions: assign, comment, status, move, email, webhook | Do the routine work | PLANNED | — |
| Dynamic assignees (creator, watcher, triggerer) | Route to contextual person | PLANNED (small enum in action config) | — |
| 100+ prebuilt automation templates | Start from recipes | PLANNED (templates system) | Ship a cannabis recipe pack: "COA fail → quarantine + P0 CAPA", "harvest −3d → prep checklist per room", "Metrc mismatch → assign compliance". |
| AI automation builder (describe → rule) | Natural-language rule creation | MISSING | P2, after AI layer: LLM emits `automation_rules` JSON, human confirms before save. |
| Automation audit log | Every automation run recorded | MISSING (cheap) | **P0-adjacent:** every rule execution writes to the existing append-only audit with rule id + before/after. One insert in the engine loop; regulators will ask who changed the lot status — the answer must never be "a robot, no record." |

## 7. Forms

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Form builder writing into tasks | Intake requests become work | PLANNED (`form_defs`, `form_submissions`) | — |
| Conditional logic (branching questions) | Dynamic forms per answer | MISSING (not in forms v1 scope) | Add `show_if` JSON per field in form_defs — evaluate client-side. Needed for incident-report forms (branch by incident type: pest / equipment / safety / diversion). |
| Public (unauthenticated) forms | Outside submitters | MISSING | Signed public URL + edge function inserting with service role + rate limit. Use cases: visitor log kiosk, vendor intake, wholesale order request. |
| Custom branding/themes on forms | Match brand | HAVE-adjacent (dual themes) | Inherit OS theme tokens; done. |
| Routing rules on submission | Auto-assign by content | PLANNED (automation on form-submit trigger) | — |
| Forms Hub (all forms + response views) | Manage every form centrally | PLANNED (a saved view over form_defs) | — |

## 8. Goals & Scorecards

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Targets: number/currency/%/true-false/task-completion | Measurable objectives | PLANNED (deep-spec in doc 08) | — |
| Goal folders / OKR grouping, roll-up % | Related goals aggregate | PLANNED | — |
| Auto progress from linked work | No hand-typed progress | PLANNED — TG stricter: targets feed from live KPI queries (yield, OTIF, cost/g), never manual (Law #2) | — |
| Employee scorecards | Weekly per-person metrics | PLANNED | TG twist: scorecard lines join `time_entries` × effective-dated rates → real labor cost per outcome. |
| Goal permissions/owners | Who sees, who edits | PLANNED (RBAC) | — |

## 9. Dashboards & Reporting

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Widget-grid dashboards (60+ cards) | Self-serve visual reporting | PLANNED (M5 widget grid) | — |
| Card families: charts, tables, calculations, time, workload | Building blocks | PLANNED | TG card set adds: lot aging, COA pass-rate, ¢/gram trend, Metrc sync health, labor $ per room/day. |
| Sprint cards (burndown/burnup/velocity/CFD) | Agile pacing charts | MISSING | Recast as **cycle charts**: work remaining vs days-to-harvest per room; "velocity" = tasks closed per crew-week. Same math, TG's clock. P2. |
| Advanced filters on cards (owner/status/date/field) | Slice any card | PLANNED | — |
| Live data + refresh | Always current | HAVE (Control Tower pattern) | — |
| Shareable / client-portal dashboards | External stakeholders see curated views | MISSING | P1-late: signed read-only dashboard URLs (edge function, no auth, row-filtered). Use: wholesale buyer order status, investor snapshot. Never expose regulated PII. |
| AI cards (auto-summary/anomaly) | AI narrates the numbers | MISSING | With AI layer (P1): nightly LLM pass over KPI deltas → plain-English "what changed" card; grounded only in OS queries. |
| Control-tower exec exception board | Leadership overview | HAVE | — |

## 10. Time & Resource Management

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Global start/stop timer on any item | Capture time as it happens | MISSING | **P0.** Timer widget in shell → writes `time_entries` rows (table exists). One open timer per user, close-on-switch. |
| Manual entries + edit | Retro fixes | HAVE (`time_entries`) | — |
| Timesheets (day/week/custom range) | Consolidated review of hours | MISSING | **P0.** Weekly grid view over time_entries per employee; totals × effective-dated rate = labor cost line, feeding batch costing. |
| Approvals (submit → review → approve) | Manager sign-off on hours | MISSING | **P0.** `timesheet_periods(status: open→submitted→approved→locked)`; approval writes audit row; locked periods feed payroll export. |
| Billable flag / labels / notes on entries | Categorize time | MISSING (cheap) | TG recast: `cost_center` (room / lot / WO / overhead) instead of "billable" — time attributes to WHAT it grew or made. |
| Estimates vs actual | Predict, then compare | PLANNED (estimate field on work_items) | — |
| Recurring/scheduled work | Routine cadence | PLANNED | — |
| Workload capacity | Who's overloaded | PLANNED (workload view) | — |
| Timer integrations (Toggl/Harvest) | External trackers sync | MISSING | Skip — TG *is* the tracker; rates live here. |

## 11. Templates System

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Template center: 1,700+ across 14 categories (Ops 305, PM 279, Marketing 193…) | Instant workflow starts | PLANNED (templates system) | — |
| Templates at every level (space/list/task/doc/checklist/automation/view) | Anything reusable | PLANNED | — |
| Cannabis template pack | — | PLANNED (doc 08: "New Harvest Cycle", CAPA, New-Hire) | Extend pack: state-inspection prep, recall drill, Metrc reconciliation day, changeover cleaning, IPM scouting week. Ship as **data**, not migrations. |
| Community/marketplace templates | Third-party sharing | MISSING | Skip until multi-tenant. Export/import template JSON is the 90% version. |

## 12. Collaboration — Chat, Inbox, Clips, Email

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Channels, DMs, threads, posts | Team messaging beside work | PLANNED (messages, M4/M5) | — |
| Convert message → task; link msgs ⇄ tasks | Talk becomes execution | PLANNED | — |
| FollowUps (comment → assigned action) | Nothing said gets lost | HAVE-adjacent (action register) → merges into work_items | — |
| Assigned comments | Comment carries an owner + resolve state | PLANNED (threaded comments spec) | — |
| Voice/video calls, SyncUps | Instant meetings in-app | MISSING | Skip (P2). Embed link-out to Meet/Zoom; building WebRTC is off-mission. |
| **Inbox / notification center** (important-vs-other, snooze, clear, act inline) | One triage surface for everything | MISSING | **P0.** `notifications(user_id, kind, target, read_at, snoozed_until, tier)` — the tiered-alert system already produces events; give every user a personal triage pane with snooze + done. Without it, automations shout into email. |
| Collaboration detection (who's viewing/editing) | Avoid collisions | MISSING | P2: Supabase Realtime presence badge on record headers. |
| Clips (screen/voice recording, timestamped comments, auto-transcribe, hub) | Async visual explainers | MISSING | TG recast (P1): **evidence capture** — MediaRecorder in-browser → Supabase Storage, attach to work item/lot/CAPA; timestamped comments. Pest photos, equipment faults, training walkthroughs. Transcription later via AI layer. |
| Email-in (create tasks / reply by email) | Work from the inbox | MISSING | P2: inbound-parse webhook → form-submission pipeline. Useful for vendor emails → intake. |
| Profiles (activity + details per person) | Know your team | HAVE-partial (employees + rates) | Add activity tab reading the audit ledger. |
| Public sharing links (views/docs) | Send read-only work outside | MISSING | Bundled with portal-dashboard spec (§9). |

## 13. AI Layer

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Ask/answers over workspace ("Brain") | Conversational answers with work context | MISSING | P1: **Ask-the-OS** — LLM with SQL-tool access to RLS-scoped views ("which lots ship-blocked on COA?", "labor cost of Harvest 24?"). Grounded, cited, read-only. |
| Enterprise/connected search | One search across everything | MISSING | **P0-adjacent:** Postgres FTS across work items, lots, docs, COAs, employees first — a `search_index` materialized view + one omnibar. AI not required for v1. |
| AI writing/summarization | Draft and distill | MISSING | P1, inside docs editor (SOP drafts) — human approves, versioned. |
| AI fields (auto-computed field values) | Fields fill themselves | MISSING | P2: `custom_field_defs.kind='ai'` with prompt + refresh policy; values marked machine-generated in audit. |
| Standups / catch-up digests | Auto "what happened" | P1 (cheap without AI): morning digest = audit-ledger diff per user | — |
| Agents (auto-answer, triage, custom) | Autonomous workflow workers | MISSING | P2. Triage agent = automation rules first; LLM agents only after Ask-the-OS proves grounding. |
| Notetaker (joins meetings) | Meeting minutes auto-captured | MISSING | Skip. |
| Talk-to-text | Voice-first input | MISSING | P1-late but cannabis-real: gloved workers in grow rooms — Web Speech API dictation into work-item comments/forms on mobile. |
| AI image generation | Visuals on demand | MISSING | Skip. |
| Model choice (GPT/Claude/Gemini) | Pick the brain | MISSING | Config detail of AI layer; store per-workspace in integrations vault. |

## 14. Integrations & Platform

| Capability | What it does | TG status | Build |
|---|---|---|---|
| 1,000+ integrations, native + Zapier/Make | Connect the stack | HAVE-pattern (integrations vault; Metrc live) | Vault already generalizes; add connectors on demand (QuickBooks for payroll export is the first real ask). |
| Metrc (state track-and-trace) | — | **HAVE — ClickUp has nothing like it.** TG's defining integration. | — |
| Public REST API | Build on the platform | MISSING | P2: PostgREST already exposes RLS'd endpoints — document + issue scoped API keys via the vault. Mostly a docs task. |
| Webhooks out | Push events to other tools | MISSING | P1-late: `webhook_subscriptions` + delivery worker with retries; events = the audit stream. |
| Import from competitors (Asana/Trello/Jira/Monday…) | Switch cheaply | MISSING | Skip until sales need. CSV import for work items is the 80% (one edge function). |
| Chrome extension / Outlook add-in | Capture from anywhere | MISSING | Skip; PWA share-target covers mobile capture. |
| Embed external apps in views | Bring tools inside | MISSING | See §3 Embed view. |

## 15. Permissions, Admin & Security

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Roles: owner/admin/member/guest | Base access tiers | PLANNED (granular RBAC, CODE-022) | — |
| Custom roles (build-your-own permission sets) | Precise control | PLANNED | — |
| Per-item sharing + private spaces (view/comment/edit/full) | Granularity to one record | PLANNED | — |
| Guest / external limited access | Contractors, auditors | MISSING (beyond RBAC stub) | P1: **auditor mode** — time-boxed read-only role scoped to compliance objects (lots, COAs, audit ledger, SOPs) with its own access log. State inspectors are a persona ClickUp never designed for. |
| SSO / SAML / 2FA | Enterprise auth | MISSING | P1: Supabase Auth already supports Google SSO + TOTP — enable + enforce-2FA flag for admin roles. Config, not code. |
| SCIM provisioning | Auto user lifecycle | MISSING | Skip until enterprise customers. |
| Audit logs | Who did what, when | HAVE (append-only, platform-wide) — stronger than theirs | — |
| Data residency / SOC2 / HIPAA posture | Compliance assurances | MISSING (formal) | Post-revenue: inherit Supabase SOC2; document data map. Not build work. |
| Admin user management dashboard | Seats, roles, deactivation | HAVE-partial (employees module) | Fold auth-user admin into the employees screen when RBAC lands. |
| Custom color themes / dark mode / localization | Personal comfort | HAVE (dual themes) — localization MISSING, skip | — |
| Notification preferences + quiet hours | Per-user alert control | PLANNED (doc 08 §10) | — |

## 16. Mobile & Apps

| Capability | What it does | TG status | Build |
|---|---|---|---|
| Native iOS/Android apps | Full OS in pocket | MISSING | **P1: PWA first** — manifest + service worker + offline queue for the floor-worker loop (my tasks, timer, form submit, photo evidence). Grow rooms have bad Wi-Fi; the offline outbox is the feature. |
| Desktop apps (Win/Mac/Linux) | Focus app | MISSING | Skip — browser + PWA install covers it. |
| Apple Watch / voice apps | Glanceable | MISSING | Skip. |
| Mobile capture (camera, dictation) | Field input | MISSING | Bundled in PWA: camera → evidence attach; dictation via §13. |

---

## Prioritized build order — MISSING set only

**P0 (build with M4 core — daily-driver + compliance-critical):**
1. **Inbox / notification center** — snooze, tiers, act-inline; the alert system finally gets a human surface.
2. **My Work home (`/me`)** — assigned items, clock state, approvals, SOP acks, today's schedule.
3. **Timer + Timesheets + approval lock** — closes the loop from time_entries to real batch labor cost via effective-dated rates.
4. **Omnibar search** (Postgres FTS across lots/COAs/work items/docs/employees) — pre-AI version.
5. **Automation run → audit ledger** — one insert in the engine; non-negotiable for regulated automation.

**P1 (fast follows in M5):**
6. Evidence capture (Clips recast): photo/video/screen attach with timestamped comments on lots/CAPAs/work items.
7. Auditor mode (time-boxed read-only compliance role with its own access log).
8. SSO + enforced 2FA for admin roles (Supabase config).
9. Mobile PWA with offline outbox (floor-worker loop).
10. Ask-the-OS (grounded, read-only AI over RLS'd views) + morning digest from the audit ledger.
11. Conditional-logic + public (signed-URL) forms.
12. Milestones flag; "Me mode" filter token; cost-center labels on time entries (cheap riders).

**P2 (opportunistic / demand-driven):**
13. Portfolio rollup (multi-harvest → multi-facility health), portal dashboards (signed read-only URLs), outbound webhooks, embed view, cycle charts (burndown recast), AI fields, AI automation builder, email-in, canvas/whiteboards, map view, collaboration presence, CSV import, public API docs, marketplace templates.

**Explicit skips:** WebRTC calls, notetaker, AI image gen, watch apps, SCIM, third-party timer sync, localization — no cannabis-operator payoff for the cost.

---

## The standing TG difference

ClickUp's objects float free; every TG object is welded to a regulated spine. A task knows its
lot's COA state; an automation can quarantine, not just notify; a timesheet prices a batch at
the employee's real effective-dated rate; the audit ledger is append-only platform law, not an
enterprise add-on; and Metrc sync is a first-class citizen no horizontal tool will ever ship.
Build the P0 five and TG covers ~85% of ClickUp's daily-use surface while doing things ClickUp
structurally cannot.
