# DASHBOARD SPECIFICATION — everything the owner has said, gathered once

**Written 16 Aug 2026 by Agent I, on the owner's instruction: "parse chat for what we
spoke of about this for dashboard i do not want to repeat all that again."**

He has stated these rules across many sessions and been asked to restate them. That is
the failure this file exists to end. **If you are building or changing a dashboard, read
this first and do not ask him to repeat himself.**

Nothing here is invented. Every line traces to something he said or to a rule already in
CLAUDE.md. Where a decision is still his to make it is marked **OPEN** — those are the
only things worth asking about.

---

## 1. THE SIX HARD RULES (CLAUDE.md, owner-set 5 Aug 2026)

These are requirements, not preferences.

1. **Every category has a dashboard.** Command, Cultivation, Inventory, Quality, Sales &
   Cash, Manufacturing, Metrc, Workspace, Human Resources, Infused Pre-Rolls & Flower,
   Settings. It is the **first item in its category**. Every subcategory beneath it feeds
   into it.

2. **Every dashboard is actionable, to ClickUp standard.** A manager with access must be
   able to **assign a task directly from any tile** — to a named person, with a due date
   and a priority — and the task carries **the number that triggered it, captured as it
   stood at that moment**. Not a link to somewhere else. On the tile.

3. **Every dashboard carries extensive reporting and KPIs.** Live tiles. Drill from any
   tile straight into the underlying records. The full report set for that department
   reachable from the same page.

4. **Everything replicates up.** Every category dashboard feeds the two master dashboards
   — Control Tower and Chief Executive Dashboard — so all of it is collected in one place.

5. **Users personalise their layout.** Toggle individual tiles off, drag to rearrange.
   **Saved per user**, so two executives can hold completely different views of the same
   data. *Extended 16 Aug 2026, see section 3.*

6. **Nothing is ever omitted, sacrificed or shortened** when consolidating.

---

## 2. THE APPROVED VISUAL PATTERN

**Eight tile types. Sunk wells with coloured spines. Almost no prose. Four-level
drilldown.** That is the pattern he approved; do not invent a ninth tile type without
asking.

**The DDC scale, measured and enforced:**

| element | size |
|---|---|
| chrome (labels, chips, meta) | 9–11px |
| body | 12px |
| **KPI figure** | **22px HARD CAP** |
| padding | ≤ 16px |
| table rows | 26px |
| border radius | ≤ 2px |
| accessibility floor | 12px |

**LOCKED and not yours to change:** the colour theme, the side menu design, the top menu
design. Layout, sizing, spacing, grid and shadow geometry are NOT locked — provided every
colour comes from a token that already exists. A genuine palette change needs his explicit
approval and `TG_THEME_UNLOCK=owner-approved`.

**Frozen surfaces (11 Aug ruling):** on the frozen menu list you may only rename,
consolidate, add or remove entries. Nothing else.

---

## 3. THE ARRANGEABLE SECTION — every dashboard, not just two

**Owner, 16 Aug 2026:** *"every single dashboard need to have section as I stated where i
can drag and put where i want to arreange dash for user preference."*

**Owner, earlier:** *"SIMILAR TO TRADING PLATFORM i CAN MOVE AND RESIZE EACH AS I WANT."*

This supersedes rule 5's "the two master dashboards" — it is now **every dashboard**.

**The test he applies, and nothing else counts:**
- He drags a widget somewhere else and **it stays there**.
- He grabs a corner, resizes it, and **it stays that size**.
- He reloads and **his layout is exactly as he left it**.
- It behaves like a trading terminal, not a form with a save button.

**Build it ONCE as a shared primitive.** His standing rule: *"share primitives, never
layouts"*, and he cites **522 pages through one ReportScreen as the CAUSE of the bugs**.
So: one arrangeable-section component, mounted by each dashboard with its own widgets.
Twelve implementations is wrong. One template forcing twelve dashboards into the same
shape is also wrong — *"a roster is not a ledger is not a punch log."*

**The storage already exists. Do not build a second one.**

| table | what it holds |
|---|---|
| `dashboard_layout` | `user_id, page, widget_key, x, y, w, h, visible, instance_id, config, title_override` — keyed by **page**, so it already serves every dashboard |
| `widget_catalog` | 54 widgets: `widget_kind, options_schema, multi_instance, drill, format` |
| `user_settings` | `collapse_state`, `canvas_theme`, sidebar width |
| `user_dashboard` | `dashboard_key, name, is_default, from_template` |
| `dashboard_template` | 6 templates |

**Check RLS on `dashboard_layout` before building.** If a user cannot write their own row,
drag will appear to work and silently forget on reload — the worst possible outcome for
this feature and the exact silent-failure pattern that has cost days.

---

## 4. NAVIGATION AND DRILL-DOWN

Stated after he hit all three himself:

- **There must be a way back from a drill without going to the menu.** There was not.
- **Going back must not take 15 seconds.** It did.
- **A drill must be closeable** — when the user has finished reading it they close it and
  the normal dashboard is there again.
- A page that resolves to nothing must **say what was asked for and why it is not here**,
  never silently fall through to the Control Tower.

---

## 5. REPORTS AND WORKSPACE

- **Reports organised like QuickBooks.** Grouped, navigable. *"not a mile long list."*
- **Tiles like DDC.** DDC is the design bar: system discipline, one chip vocabulary,
  honest state everywhere. Patterns cross between projects; data never.
- **Workspace is our own ClickUp clone** — *"build workspace as our own clone as similar
  copy to clickup."*

---

## 6. ALERTS, TASKS AND THE COURSE-OF-ACTION BUTTON

**Owner:** *"The operating system should alert upper management and managers of
manufacturing and cultivation items of discrepancies to be resolved and create a detailed
task and alert."*

**And the course-of-action trigger:** any month that falls behind immediately triggers a
plan for the **current** harvest, so it does not happen again in this one. The plan covers
employees zoned, shifts extended 8→10 hours, weekend working, or a second shift. The user
pushes a button connected to **Budz Assistant**, which reviews and proposes the course of
action. **CEO, CFO and admins only for now.** They can then edit it and create tasks and a
meeting agenda from it.

---

## 7. HONESTY RULES THAT APPLY TO EVERY TILE

Learned the hard way, repeatedly, and non-negotiable:

- **A refused read is not zero.** `count ?? 0` published `0 records` on the Control Tower
  when permission was denied. `data?.role ?? "member"` locked the owner out of his own
  Command Center and made a page he had built for weeks look deleted.
- **An empty box must say which absence it is** — no data, no permission, or a failed
  read. Never render nothing.
- **Never fabricate a figure.** If the basis is unconfirmed the tile says so. He has been
  given wrong numbers more than once and every time the fault was presenting an assumption
  as a measurement.
- **Every tile must reconcile with its own drill.** `tile_drill_contract` enforces it;
  89 contracts across 12 dashboards are swept hourly.
- **Averaging across mixed rows is wrong** where future rows contribute zero.
- **Apex `_raw` money fields are minor units**, and `order_price_raw` on a line is a UNIT
  price. Summing it bare understates revenue by 59%.
- **`metrc_packages.provenance = 'metrc report'`** rows are historical — shipped, received
  or adjusted out, all `source_state = 'inactive'`. **Never present them as current
  inventory.** Current inventory is the 508 tags in `metrc_rpt_packages_inventory`.

---

## 8. SCOPE

- **Skip all HR.** Owner, 15 and 16 Aug 2026. All 87 HR pages are out of scope until he
  says otherwise.
- **Inventory is view and sync only** — *"no manual edits allowed from OS must be made
  only on spreadsheet this is for reporting and planning."*
- **Metrc is read-only, forever.**

---

## 9. OPEN — his call, do not guess

- Which money figure the schedule dollar tile shows: **210 days discipline** vs **94
  room-days net drift**. Recommendation on file is 94 for money, 210 for discipline, and
  to publish days rather than dollars until Finance confirms price and yield.
- Whether the three never-harvested pulls belong in the cost views at all.
- Which harvest calendar governs — `harvest_pulls` (26 pulls) or `planner_v4` (22). The
  headline moves by a factor of four between them.
- Default-deny authorisation across the remaining pages.

---

*If something about dashboards is not in this file and he has said it before, add it here
rather than asking him again.*
