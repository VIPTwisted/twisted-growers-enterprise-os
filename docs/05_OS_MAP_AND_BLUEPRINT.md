# Twisted Growers Enterprise OS — System Map & Build Blueprint

*The master reference. One system to run the entire company. 2026-08-04.*

## The Four Laws (binding, confirmed by owner)

1. **One system, whole company** — a single database of record with one audit trail.
2. **Fully dynamic** — every number computed from live records at read time. Nothing typed into dashboards.
3. **No fake data** — real connected records or an honest empty state ("no records connected yet"). Never samples.
4. **No code edits to operate** — every business value (rates, SLAs, thresholds, dropdowns, toggles, workflow rules) is database configuration, changeable from admin screens.

## The Operating Loop

**Genetics → Grow Rooms (F1–F4) → Harvest (wet→dry→grade, mass-balanced) → Vincent Allocation → Manufacturing (work orders, stages) → Testing (COA-gated) → Inventory (lots, full Metrc tags) → Shipping (manifested, OTIF) → Invoicing/AR → Cash → back into S&OP + purchasing + payroll.**
Metrc mirrors every regulated step; the OS reconciles nightly. People, schedules, and per-employee pay run underneath every stage.

## Module Map — three layers

**Layer 1 · Core operations** *(from the planner's own CODE-001…012 — schema LIVE today)*
| Module | Screen | State |
|---|---|---|
| Identity & Org (RBAC, per-employee rates) | Admin · People | DB live |
| Department Scheduling | Schedule Board (day/week/month) | DB live |
| Production Planning & Execution | Production Board / Shift Start | DB live |
| Cultivation & Harvest | Grow Rooms · Harvest & Grading | DB live |
| Inventory & Allocation (Vincent's gate) | Inventory · Allocation Queue | DB live + netting trigger |
| Quality & Testing + **COA Registry** | **Testing & COA Calendar** | DB live + COA ship-gate |
| Sales & S&OP | Demand · Commitments · S&OP | DB live |
| Purchasing & Cash | POs · Overhead · Cash · Runway | DB live |
| Shipping & AR | Shipments (manifest) · AR Aging | DB live + ship-gate |
| Executive Control Tower | **Home screen** — exceptions first | Live SQL view |
| Audit / Security / Change | Admin · Audit Log | Append-only, live |
| Monday Integration | Admin · Integrations | Mapping tables live, not connected |

**Layer 2 · Extensions** *(what the planner omitted — our additions)*
CODE-013 Notifications & escalation · CODE-014 AI (COA parsing, forecasting, anomaly detection, daily brief) · CODE-015 Mobile (time clock, scale capture, scanning) · CODE-016 Documents (versioned, approved, audience-scoped — SOPs/manuals/COAs) · CODE-017 Accounting + 280E · CODE-018 Metrc connector (**deployed, awaiting keys**) · CODE-019 Hardware (scales, printers, sensors) · CODE-020 BI & trends · CODE-021 SSO/2FA · CODE-022 Granular permissions + feature toggles + Policy Builder (Law #4's admin surface).

**Layer 3 · Admin/Config** *(how Law #4 is honored)*
Reference tables (departments, roles, families, cultivars+aliases, rooms, statuses) · configurations · testing SLAs · wage bands · toggles. Adding any of these = a form, never code.

## Personas & rollout
**Now (shadow, through 2026):** Executives only — full OS. **Phase 3 (readiness-gated, ≥ Jan 1 2027):** Manager and Employee personas (my shifts, my tasks, my approvals), permission-scoped. Matches the planner's own rollout plan.

## Integration Map
**Metrc (MA):** read-first nightly — packages, harvests, plants, plant batches, transfers → staging → reconciliation exceptions. Write phase later, approval-gated. **Labs:** COA PDF/portal → parsed into COA registry (pass/fail gates shipping). **Monday.com:** planner→Monday one-way pilot per MON-001…006 when board IDs are entered. **Accounting/payroll provider:** export + 280E tagging. **Hardware:** scale-side capture at trim, tag scanning at count, label printing at packaging.

## Build Milestones
- **M1 — App shell:** auth, Control Tower, Testing & COA Calendar, per-employee Payroll, Inventory. Deploy to Netlify (`twisted-growers-enterprise-os`).
- **M2 — Truth loaded:** v5-workbook loaders (people, harvest history, inventory→lots w/ full tags, standards) + Metrc first sync + reconciliation screen.
- **M3 — Operations:** allocation queue (Vincent), work orders + scheduling boards, shipping w/ manifests, AR.
- **M4 — Flow:** notifications/escalations, Monday pilot, document workflow.
- **M5 — Intelligence:** AI COA parsing, forecasting, daily brief; mobile clock + scale capture; BI trends.

## Current-Tools Intake (fill this when sharing what the team uses today)
For **each** spreadsheet/board/app currently in use, we record:
**(1)** name + link/file · **(2)** owner (who maintains it) · **(3)** update cadence · **(4)** what decisions it drives · **(5)** which module above absorbs it · **(6)** disposition: **import once** (history) / **sync during shadow** (living source) / **retire at cutover**.
Known candidates from the planner's own sync registry: Jackie's Harvest Calendar · manufacturing Production worksheet · Manufacturing Product Inventory · Cultivation Inventory Sheet · the four product schedules · payroll reports (PDF) · any Monday boards. Nothing gets absorbed without mapping here first — that is how "no omissions" stays true.
