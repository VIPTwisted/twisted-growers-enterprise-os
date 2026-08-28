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

---

# Continuation — manufacturing and pre-rolls, re-measured 28 August 2026

Sixteen days after the census above, the manufacturing domain was re-measured while putting
those pages on the period bus. The 12 Aug line — *"production_runs, work_orders, task_standards
| 0 | Manufacturing side unfed"* — is still true, and it is now possible to say **how much
work is missing, not just that some is.**

## The gap has a number

Metrc — the legal record — says manufacturing is running, and has been for nearly three years:

| Measured in `metrc_packages` (API mirror) | Value |
|---|---:|
| Packages carrying a Metrc production batch number | **1,810** |
| Distinct production batches | **1,738** |
| First batch | 9 Oct 2023 |
| Last batch | **28 Aug 2026 — today** |
| Packages made from other packages | **4,591** |

This platform's own record of that same work:

| Table | Rows |
|---|---:|
| `pipeline_runs` | **0** |
| `pipeline_stage_events` | **0** |
| `work_orders` | **0** |
| `work_order_stages` | **0** |
| `schedule_assignments` | **0** |
| `task_standards` | **0** |
| `turnaround_policies` | **0** |

**1,738 production batches happened. Zero were recorded as runs here.** That is not an unfed
table waiting for a first row — it is a measurable divergence between the legal record and the
operating system, running for 1,054 days and continuing today.

## The configuration is finished; only the operating is missing

This is the part that changes the order of work. The pipelines are not a stub — they were
fully modelled and then never used:

| Pipeline | Stages | Defined |
|---|---:|---|
| Cultivation — Seed to Sale (per Harvest) | 14 | 5 Aug 2026 |
| Infused Pre-Rolls | 8 | 5 Aug 2026 |
| Vape Cartridge Production | 7 | 5 Aug 2026 |
| Non-Infused Pre-Rolls (from Trim/Flower) | 7 | 5 Aug 2026 |
| Concentrate Manufacturing | 6 | 5 Aug 2026 |
| Purchased Flower Turnaround | 5 | 5 Aug 2026 |
| Packaged Flower | 5 | 5 Aug 2026 |
| Purchased Concentrate Turnaround | 5 | 5 Aug 2026 |
| Clone / Veg Production | 4 | 5 Aug 2026 |
| Purchased Material Intake | 3 | 5 Aug 2026 |

**10 pipelines, 64 stages, all defined on one day and not touched since.** `machines` holds 8
rows and `cost_inputs` 41. So the manufacturing module is *configured and never operated* —
a different problem from the unbuilt ones above, and a cheaper one.

## What has data in these two modules

Only the infrastructure reporting, which is the platform watching itself rather than the
company making anything: `verification_runs` **38,641**, `watchdog_runs` **3,453**,
`canary_runs` **1,537**, `import_check_run` **49**, `import_reconciliation_run` **1**.

Worth saying plainly: the Manufacturing category's populated pages are all self-monitoring.
Every page about *product* is empty.

## What this means for the pages

Every manufacturing and pre-roll nav row is `page_kind='report'` and renders through
`ReportScreen`. Those pages were brought onto the period bus and given working search on
28 Aug, and the fix is correct — but **it is not visible on any of them**, because there is
nothing to range or search. The work is real and the pages are honest; the feed is the gap.

The rule at the end of the census still governs: a page over an empty table says the table is
empty. It must not imply that zero runs means zero manufacturing, when Metrc says 1,738
batches.

## The cheapest next step, and why it is not "start entering work orders"

There is an existing source. Metrc already carries the production batch number, the source
packages and the dates for all 1,738 batches. A backfill from `metrc_packages` into
`pipeline_runs` would give the manufacturing pages three years of real history without a
single keystroke on the floor, and would make the turnaround and stage-aging views mean
something on their first load.

That is a proposal, not a decision: it needs an owner ruling on whether a Metrc-derived run is
the same thing as a floor-recorded run, and it must not be started on the assumption that it
is. Raised here rather than acted on.

*Measured 28 Aug 2026 against the live database. Re-measure before relying on any figure — the
first census went stale in sixteen days.*
