# Platform Build Blueprint — distilled from the workbook

Source: sheet **"Platform Code & Build Blueprint"** (rows CODE-001…CODE-012). Each row is a
software requirement — the workbook's own implementation contract for the future operating
system. All twelve modules are marked **Specified / not built**. Ten are P0, two are P1.

Global rules that repeat across every module:

- **Immutable audit** of every material change (actor, old/new value, reason, timestamp)
- **Approval gates drive state**: nothing moves without its named approver (Vincent = material
  allocation & release, QA = test release, CFO = spend/cost, CEO/CFO = decisions)
- **Conflict policy**: never silently overwrite; divergent edits go to a manual-review queue;
  compliance/Metrc facts always win over planner values; accounting actuals win over estimates
- **Sync posture**: read-first / one-way pilots before any bidirectional write; 2026 shadow
  mode is one-way with no source writeback without approval + rollback
- **Metrc mapping** exists per module (plants, harvests, packages, lab tests, transfers)

## The twelve modules

| ID | Module | Screen | Core entities | Priority |
|---|---|---|---|---|
| CODE-001 | Identity & Organization | Company / Users / Roles | users, employees, roles, departments | P0 |
| CODE-002 | Department Scheduling | Schedule board | schedule_assignments | P0 |
| CODE-003 | Production Planning & Execution | Master production board | work_orders, work_order_stages | P0 |
| CODE-004 | Cultivation & Harvest | Grow-room & harvest control | grow_rooms, harvests, harvest_grades | P0 |
| CODE-005 | Inventory & Allocation | Inventory, lots, allocation | items, skus, lots, inventory_balances, allocations | P0 |
| CODE-006 | Quality & Testing | Testing submission & release | test_requests, test_results, releases | P0 |
| CODE-007 | Sales & S&OP | Demand, commitments, S&OP | customers, orders, demand_forecasts, sop_cycles | P0 |
| CODE-008 | Purchasing & Cash | Purchasing, payroll, cash | vendors, purchase_orders, payroll_budgets, cash_forecasts | P0 |
| CODE-009 | Shipping & AR | Shipment & collections | shipments, shipment_lines, invoices, receipts | P1 |
| CODE-010 | Monday Integration | Monday-compatible boards | integration_mappings, sync_cursors, webhook_events, conflicts | P1 |
| CODE-011 | Executive Control Tower | Executive operations home | kpi_snapshots, exceptions, decisions, actions | P0 |
| CODE-012 | Audit, Security & Change | Audit, config, rollout | audit_events, configurations, source_connections | P0 |

## Module details worth holding onto

**CODE-001 Identity & Org** — effective-dated role hierarchy (role/approval rights follow it);
RBAC middleware; acceptance: every active employee has exactly one department, manager, pay
basis, effective role. Immutable audit on pay/role/reporting changes.

**CODE-002 Scheduling** — no overlapping employee assignments; every assignment needs an
accountable head + stage owner; day/week/month/timeline views must reconcile to the same
source records. Events: assignment_created, overlap_detected, shift_confirmed.

**CODE-003 Production** — rule: *no manufacturing without Vincent-approved allocation and
stage readiness*. KPIs: schedule adherence, throughput, labor variance, OEE. Acceptance: one
work order traces demand → allocation → production → testing → FG → shipping.

**CODE-004 Cultivation** — four-room cadence configurable; *every pound reconciled before
allocation*; mass-balance conflict blocks allocation; compliance record wins. KPIs: g/sqft,
grade yield, waste, mass balance, harvest adherence.

**CODE-005 Inventory** — every lot has owner, quantity, cost, disposition; low SKU triggers
replenishment; Metrc quantity wins on compliance; CFO approval needed on cost changes.
Acceptance: no active material unallocated, uncosted, or missing disposition.

**CODE-006 Quality/Testing** — promised dates must include validated batch-size/product SLA;
lab result + authorized release cannot be overwritten. KPIs: submission timeliness, lab lead
time, release cycle.

**CODE-007 Sales & S&OP** — *no off-system promises*; demand cannot exceed protected capacity
without exception; approved S&OP supersedes draft but both are preserved. KPIs: forecast
accuracy, backlog, OTIF, contribution margin.

**CODE-008 Purchasing & Cash** — buy only against approved need/budget; cash runway updated
weekly; approval immutable even after accounting actuals land. KPIs: inventory turns, cash
conversion, payroll, runway, break-even.

**CODE-009 Shipping & AR** — only released FG ships; delivery triggers invoice/collection
workflow; chain-of-custody audit. KPIs: OTIF, fill rate, DSO, cash collected.

**CODE-010 Monday Integration** — GraphQL adapter, webhook worker, retry queue; idempotent
upserts; read/one-way pilot first; API usage + sync lag KPIs; no public data exposure.

**CODE-011 Executive Control Tower** — exception-first daily review; every action gets one
owner + due date; dashboard must reconcile to transactional modules (no separately-typed
numbers). Read-aggregation in, approved decisions out.

**CODE-012 Audit/Security/Change** — append-only audit, daily recoverable backup, secrets
manager, config service; access-policy changes are themselves audited events.

## Monday.com pilot (MON-001…006)

Six boards specified: Department Scheduling, Production, Cultivation & Harvest,
Testing & Release, Inventory & Allocation, Executive Control Tower. All currently
**Not Connected**; workspace/board/column IDs are INPUT REQUIRED (must be copied from the
real Monday account by an admin). Direction: Planner → Monday one-way pilot (cultivation is
source → planner during shadow). Conflict rules per board (Vincent-release and QA fields
always manual-review). Privacy: company-only boards, finance/pay fields excluded from broad
boards, cost/margin restricted to financial authority.

## What the blueprint deliberately defers

- Employees get read access "later" (executive-only during shadow)
- Bidirectional sync everywhere is post-pilot
- Metrc is read-first; API write is a later phase
- Field-level rights configurable "later" (CODE-012)
