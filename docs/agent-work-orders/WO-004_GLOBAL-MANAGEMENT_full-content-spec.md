# WO-004 · Global Management view — the owner's full content spec

**Ordered by:** Owner (Vinny), 12 Aug 2026, verbatim requirements. This is the content
contract for Command Center as TOTAL company management. Grade of the current band: passing
on structure, failing on content depth — this order closes the depth.

## The owner's spec, mapped honestly

### EMPLOYEES (data consumed from the HR module's exports — HR *pages* stay with their designer)

| Requirement | State | Source / gap |
|---|---|---|
| Who is scheduled today, per department | **EXISTS, unwired** | `employee_schedules`, `departments` — needs `v_scheduled_today` rollup (Agent I) |
| Attendance issues | **PARTIAL** | `punch_devices`/punch queue + `time_entries` (0 rows — the known gap); no-show = scheduled with no punch. View buildable now, honest about empty punches |
| Changes to posted schedule | **EXISTS, unwired** | `shift_swaps`, `time_off_requests` — count + list per day |
| Zone they are working in | **MISSING** | No zone concept in schema. Build `zone` + `zone_assignment` (employee, zone, shift, assigned_by, signed). Zones ≈ rooms/areas — reuse `room_department` geography where possible |
| Re-arrange staff zones from the board | **MISSING** | Drag-reassign writes `zone_assignment` through an RPC (role-gated, logged) — the assign-from-tile pattern applied to people |
| Employee tasks | **EXISTS as of tonight** | `tasks` + `tg_assign_from_tile` — per-employee open orders, overdue red |
| Messages | **PARTIAL** | `alert_outbox`/`alert_recipient` (in-app) + `channels` table exists; a person-to-person thread is NOT built — decide: build lightweight `messages` or wire ClickUp comments via existing bridge |

### INVENTORY

| Requirement | State | Source |
|---|---|---|
| On hand | **EXISTS** | `v_stock_by_department` (owner's departments), `v_stock_proof` drill |
| Production schedule (daily/weekly/monthly tracking) | **PARTIAL** | `harvest_schedule` (cultivation) exists; manufacturing runs = TG-03 pipelines tables — need `v_production_calendar` union (Agent I) |
| Quotas | **PARTIAL** | Goals & Targets carries targets; per-department production quotas need rows there (owner sets, same edit pattern) |
| Low stock | **MISSING → task #19** | Not-to-exceed caps + restock levels (owner already specified for manufacturing); generalise to all streams. Tile: items below restock, red |
| Order shipping & delivery | **EXISTS as of tonight** | "Going out today" tile — expand to list view: today's manifests with destination, driver, ETA (`metrc_transfers` raw fields) |
| Transfers between licences | **EXISTS** | `v_cross_license_tags` + MC↔MP transfer lines ($960 internal population, known) — needs a small `v_interlicense_transfers` list view |
| Sales going out today / orders / returns / all order items | **PARTIAL** | Apex `shipping-orders` mirror (1,758) + sold-by-tag; RETURNS: Metrc rejected/returned transfer legs — the Eagle Eyes work proved the pattern; needs `v_returns` (inbound legs of our own outbound manifests) |

## Build order (each item ships with its validator, per the page-package rule)

1. **Agent I:** `v_scheduled_today`, `v_schedule_changes`, `v_production_calendar`,
   `v_interlicense_transfers`, `v_returns`, zone tables + reassign RPC, low-stock caps
   (folds task #19 in), quota rows. Each additive, each guarded.
2. **Agent B:** the Employees band (schedule grid per department, zone chips,
   drag-reassign via RPC, attendance flags) and the expanded Inventory/Sales bands —
   DDC-tight, in-place drills, one page package per band.
3. **HR designer boundary:** consumes exports only; no HR page is touched.
4. **Messages decision → OWNER:** lightweight internal thread vs ClickUp-bridge comments.
   One word: "build" or "clickup".

## Locks

Frozen surfaces, theme, menus per standing list. All writes through role-gated RPCs,
signed and logged. No manual inventory edits from the OS (owner rule — spreadsheet only).
