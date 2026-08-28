# Empty manufacturing and pre-roll tables

**Measured 28 August 2026 against the live database.** Every table behind an enabled
Manufacturing or Infused Pre-Rolls & Flower menu entry was counted directly — not estimated
from `reltuples`, not inferred from a dashboard.

Re-measure before relying on any figure here. The 12 August gap census went stale in sixteen
days, and this one will too.

---

## The empty ones

Seven tables, each serving a live menu entry, each holding nothing.

| Table | Rows | The page it serves | Module |
|---|---:|---|---|
| `work_orders` | **0** | Work Orders | Infused Pre-Rolls & Flower |
| `work_order_stages` | **0** | Production Schedule · Manufacturing Schedule | both |
| `schedule_assignments` | **0** | Scheduling | Infused Pre-Rolls & Flower |
| `pipeline_runs` | **0** | Pipeline Runs | Manufacturing |
| `pipeline_stage_events` | **0** | Pipeline Stage Events | Manufacturing |
| `task_standards` | **0** | Production Flow | Manufacturing |
| `turnaround_policies` | **0** | Turnaround Policies | Manufacturing |

Two published views are empty as a consequence, not as a fault of their own — they read the
tables above:

| View | Rows | The page it serves | Empty because |
|---|---:|---|---|
| `v_pipeline_run_status` | **0** | Pipeline Runs (Live) | `pipeline_runs` is empty |
| `v_turnaround_watch` | **0** | Turnaround Watch | `turnaround_policies` is empty |

## What is not empty, for contrast

The same two modules are not uniformly dead, and the split is the interesting part.

| Table or view | Rows | What it is |
|---|---:|---|
| `verification_runs` | 38,641 | the platform checking itself |
| `watchdog_runs` | 3,453 | the platform checking itself |
| `canary_runs` | 1,537 | the platform checking itself |
| `pipeline_stages` | 64 | configuration |
| `v_pipeline_stage_aging` | 64 | reads the configuration |
| `import_check_run` | 49 | the platform checking itself |
| `cost_inputs` | 41 | configuration |
| `pipelines` | 10 | configuration |
| `machines` | 8 | configuration |
| `v_pipeline_timing` | 3 | derived |
| `import_reconciliation_run` | 1 | the platform checking itself |
| `mv_department_dashboard` | 5 tiles Manufacturing, 3 tiles Pre-Rolls | department tiles |

**Everything populated is either configuration or the platform monitoring itself. Every table
that would record a thing being made is empty.**

## The one number that stops this being a shrug

Metrc — the legal record — says the manufacturing described by these empty tables is
happening, and has been for nearly three years:

- **1,738 distinct production batches**, across 1,810 packages carrying a batch number
- first 9 Oct 2023, most recent **28 Aug 2026, the day this was measured**
- 4,591 packages made from other packages

So `pipeline_runs = 0` does not mean nothing was manufactured. It means **1,738 production
batches were manufactured and none of them were recorded here.** Any page, tile or report over
these tables must say the table is empty and must never let a zero be read as "no
manufacturing happened".

## What this file is not

It is **not** a plan to create work orders, and no work-order data should be invented to make
these pages look alive. A fabricated run is worse than an empty page: the empty page is
honest, and the platform's own rule (A1/A3) is that absence is explained, never filled.

There is a real source — Metrc already carries the batch number, the source packages and the
dates for all 1,738 batches — and a backfill from it is discussed in
`docs/agent-work-orders/WO-005_TOTAL_MICROMANAGEMENT_gap_census.md`. That remains a proposal
awaiting an owner ruling on whether a Metrc-derived run is the same thing as a floor-recorded
run. Nothing in this file authorises starting it.

## Method

```sql
-- the population: every table behind an enabled menu entry in the two modules
select distinct n.table_ref, t.table_type, n.module
  from nav_registry n
  join information_schema.tables t
    on t.table_schema = 'public' and t.table_name = n.table_ref
 where n.enabled and n.module in ('manufacturing','infused');

-- then count(*) on each, directly
```

Counts are exact `count(*)` at 28 Aug 2026. The Metrc figures come from `metrc_packages`
where `provenance = 'metrc api'`, reading `ProductionBatchNumber` and `SourcePackageLabels`
out of the raw payload.
