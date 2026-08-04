# Intake #1 — Pre-Roll Production Planner + Daily Scheduler ("pp.py")

*Concept analysis only, per owner rule: theme not used, code not copied. 2026-08-04.*

**Intake record:** Single-file Streamlit app (monthly planner + daily employee scheduler,
pre-roll department). Owner: production leadership. Cadence: monthly plan, daily schedule.
Decisions it drives: daily unit quotas per task, crew/machine assignment, cross-department
labor pulls, printable per-employee day sheets. **Absorbed by:** CODE-003 Production +
CODE-002 Scheduling + a new Machine Registry. **Disposition: sync during shadow → retire at
cutover** (its *configuration* — rates, machines, tiers — imports as data; its logic is
re-implemented natively).

## The 10 concepts we are adopting (they're missing from our blueprint)

1. **Derating chain as first-class planning math:** Finished goal → +scrap% → Gross goal →
   ×OEE → effective per-task rates → daily unit targets. Scrap and OEE become configured,
   per-task values — not hidden assumptions.
2. **Machine/Station Registry** — every physical asset is a named row: station(s) served,
   *actual sustained* pcs/min (vs. rated spec), **Rate Basis = Per-Operator vs Whole-Machine**
   (a 3-person pod on a paced machine does NOT triple output), Min/Max operators per machine,
   Active (park a machine without deleting it), Run-Through-Breaks flag. **Combo units** serve
   multiple stations — one pass credits every station it completes.
3. **Worker tiers + borrowed labor:** Dedicated Operator → Assembly Specialist → Flex/Trimmer
   → Cross-Department, with **daily pull-hour budgets per person**, a per-day pull lockout,
   and a floor-manager master mode (Full / Capped-Relief-only-for-shortfalls / Do-Not-Pull).
   Trimmers are a relief valve, not standing assembly labor.
4. **Per-machine qualification matrix** (trained on *this machine*, not just the station) +
   skill multipliers (Trainee/Standard/Expert) + per-block rate overrides.
5. **Demand-driven auto-scheduler:** per time block, staff whichever task is furthest behind,
   under hard rules — quota cap with small buffer (never schedule overproduction), crew pods
   (min/max per machine), capability routing (tags are permission filters, not homes; people
   re-route when their task closes), WIP credits.
6. **Starting-WIP stage buffers:** floor inventory at each stage credits upstream (owes less
   today) while downstream keeps full targets and starts from minute 1 — with
   units-per-group conversion (5,000 banded joints ≠ 5,000 packs).
7. **Shift-shape as config:** blocks/break/lunch derive net schedulable hours (a 9–5 with
   15+30 gaps = 7.25h, and that difference is why single-machine stations miss targets).
   Block granularity + minimum block length; trim blocks once quota met.
8. **Physical daily ceiling check:** max output = Σ(station pace × station hours). If ceiling
   < target, *no amount of labor closes the gap* — the constraint is equipment/hours. This
   alert belongs in the Control Tower.
9. **Flow-balance monitor:** scan the day in 30-min steps for the worst upstream/downstream
   pacing mismatch and recommend "move N heads to X" — live line balancing, plus lookahead
   that reserves quota share for combo machines in later blocks.
10. **Printable per-employee day sheets** — a paper handout per person per shift (name,
    blocks, machines, targets, notes) as a first-class report.

## The 7 ways the OS does it structurally better

1. **One database, no snapshot files:** their planner hands the scheduler a JSON file and
   falls back to hardcoded rates when missing — a drift risk our single-DB design cannot have.
2. **Actuals close the loop:** it schedules *expected* output only. The OS records actual
   output per block (shift capture → later scale/mobile), so OEE, rates, and skill
   multipliers get *learned from history*, not typed and trusted.
3. **Law #4 compliance:** rates, tiers, pull budgets, shift shapes, multipliers = admin-editable
   configuration tables with audit — in the app they're constants in code.
4. **Real-Records-Only:** its fallback/default roster and rates violate our no-fake-data law;
   the OS shows honest empty states instead.
5. **Whole company, not one department:** the tier/pull concept generalizes — trim ⇄ pre-roll
   ⇄ extraction borrowing with budgets, visible to every department head at once, multi-user
   with RLS instead of one JSON state file on one machine.
6. **Cost-aware scheduling:** every scheduled block prices at that employee's actual rate
   (Requirement #1) — labor cost per block/task/SKU, which their scheduler never sees.
7. **Connected gates:** schedule blocks link to work orders → allocations (Vincent's gate) →
   testing/COA → shipping. Their app plans labor in isolation from compliance and material.

## Schema additions this triggers (migration 0005, next build step)

`machines` (registry per concept #2) · `machine_qualifications` (employee×machine) ·
employees + `tier`, `pull_budget_hours`, `pull_lockout` · `shift_templates` (blocks/breaks
as config) · skus/product task standards + `scrap_pct`, `oee_pct`, `units_per_group`,
nominal vs effective rates · `wip_snapshots` (stage buffers by day) · schedule_assignments +
`machine_id`, `rate_override`, `expected_units` · Control Tower + `daily ceiling < target`
and `flow mismatch` metrics.

**Fidelity note:** real machines named (STM roller — 3–4 person pod, PreRoll-ER, cap/fill
line, two semi-auto labellers at different speeds, manual benches) and current pre-roll crew
tiers — all of it enters the OS as *imported configuration data* during M2/M3, keyed to the
canonical roster, never as code.
