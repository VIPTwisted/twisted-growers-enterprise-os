# WO-005 · Total micromanagement — the measured gap census

**Owner mandate, 12 Aug 2026, verbatim:** *"micromanage every aspect of every staff member,
inventory, production, packaging, finished inventory, manufacturing, managing stock of
packaging boxes, labels, ink etc, every dollar, payroll costs, COG, margins, scheduling
staff, production side — every single aspect under fine inspection, under a microscope, to
run as an elite well-oiled machine."*

**The finding that governs everything below: the schema is built and the data is not
flowing.** Almost every table he named EXISTS with the right shape and sits EMPTY. This is
not a build problem, it is a FEED problem — and no amount of dashboard work creates a
figure that has no source. Measured 12 Aug 2026, `pg_stat_user_tables`.

## The census

| Domain | Table | Rows | Verdict |
|---|---|---:|---|
| **Staff** | employees | **32** | Roster is real |
| | employee_schedules | **0** | No schedule = cannot show who works today |
| | time_entries / timesheets | **0** | **No hours anywhere** |
| | employee_availability, shift_swaps, time_off_requests | 0 | Schedule-change machinery unfed |
| | punch_devices | 0 | No clock-in source |
| **Payroll** | cost_classes | 4 | 280E labour classifier exists — LABOUR ONLY |
| | pay_runs, employee_tax_profile, payroll_lines | **0** | **No payroll cost anywhere** |
| **Production** | harvest_schedule | **137** | Cultivation plan is real |
| | production_runs, work_orders, task_standards | **0** | **Manufacturing side unfed** |
| **Packaging supply** | supply_items | **15** | EXISTS — boxes/labels/ink, with reorder_level, safety_stock, lead_time_days, cost_per_unit, cover_days |
| | supply_consumption_rule | **0** | Nothing consumes stock → levels never fall |
| **Money** | cost_inputs | 41 | Partial |
| | inventory_cost_rate | 13 | Partial |
| | overhead_items | **1** | One row carrying all overhead |
| | material_purchases | **0** | **No purchase evidence — the IRC 6001 gap** |
| | invoices, sales_orders, cash_snapshots | **0** | **No cash, no invoices** |
| **Finished goods** | product_inventory | 107 | Disputed against 246 (task #7, unresolved) |

## What this means, stated plainly

1. **COGS cannot be computed today.** Direct labour needs `time_entries` (0). Materials need
   `material_purchases` (0). Overhead needs more than one row. Under IRC 280E, COGS is the
   only surviving deduction — so this gap is the single largest money exposure in the company,
   and it is a data-entry problem, not an engineering one.
2. **Margins cannot be computed** — they need COGS (above) and revenue, and revenue currently
   has two disagreeing answers ($97,256 apart).
3. **Staff cannot be micromanaged** — no schedules, no hours, no zones. The roster is a list of
   names, not an operating picture.
4. **Packaging supply is the closest to alive**: 15 items with reorder levels and lead times
   already modelled. It needs consumption rules so levels fall as product is packed — then
   low-stock alerting works immediately. **Cheapest win on this list.**

## The order of work (Agent I)

1. **Packaging supply loop** — consumption rules + low-stock view + reorder alerting. Data
   exists; smallest gap to a working microscope. Folds in task #19 (caps/restock).
2. **Time capture** — the single highest-value feed in the company: unlocks labour hours,
   payroll cost, 280E direct labour substantiation, and staff scheduling reality.
3. **Purchase capture** — `material_purchases`, the IRC 6001 evidence gap.
4. **Production runs / work orders** — the manufacturing mirror of harvest_schedule.
5. **Then** margins and COGS become computable, not before.

## The rule for every dashboard built against these domains

Where the feed is empty, the section renders the **honest gap card** naming what is missing
and what would fill it (A1/A3) — never a fabricated figure, never a zero pretending to be a
measurement. A dashboard over an empty table must say the table is empty.
