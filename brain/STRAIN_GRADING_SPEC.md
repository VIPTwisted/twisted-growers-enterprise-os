# Strain grading and harvest planning — spec

**Owner requirement, 7 August 2026:** *"AI must track strains and yields,
grading yields so we can plan harvest with greater yields. Leave a table or
two for new strains to get a selection."*

Agent D owns the method and the grading. `strain_scorecard` exists and holds
**0 rows** — this is what fills it. Building the page is Agent B's lane.

---

## The unit of planning is a TABLE

Locked facts: **4 tables per room · 287.5 plants per table.** Capacities:
F1/F3 = 1,140 · F2/F4 = 1,050. So one table is **~25% of a room**, and a
trial allocation is a real physical unit, not a percentage on a slide.

| Allocation | Plants (F1/F3) | Plants (F2/F4) | Share of total capacity |
|---|---|---|---|
| 1 table in one room | ~285 | ~262 | **~6.5%** of 4,380 plants |
| 2 tables in one room | ~570 | ~525 | ~13% |
| 1 table in every room | ~1,095 | — | ~25% |

**Recommendation: one trial table, rotating between rooms each cycle** — 6.5%
of capacity, roughly 285 plants per trial, which is enough to judge a strain
and small enough that a failure costs about one-quarter of one pull.

## The metric: dollars per plant

Every strain occupies a room for the same 56-day cycle, so **dollars per plant
IS dollars per room-day, scaled.** That single number ranks the whole estate
fairly — it captures yield and price together, which is the point:
**Cap Junky sells at $1,301/lb (4th-best rate) and ranks 32nd**, because it
only yields 43.7 g/plant. **Yield dominates price when room time is fixed.**

## The grades

| Grade | Rule | Action |
|---|---|---|
| **FAVOUR** | ≥3 harvests AND ≥250 plants AND $/plant ≥ the proven benchmark | Main rotation. Plant these by default. |
| **KEEP FOR VARIETY** | Meets the evidence bar; $/plant within ~15% below benchmark | Plant for portfolio breadth, not for yield. |
| **TRIAL** | Promising but under the evidence bar (<3 harvests or <250 plants) | Goes on the trial table. Not in main rotation. |
| **RETIRE** | Meets the evidence bar AND $/plant well below benchmark | Stop planting. Record the reason. |
| **INSUFFICIENT EVIDENCE** | Below the bar and not promising | Say so. **Never grade on one harvest.** |

**The benchmark is TG Gush Mintz at $225/plant** — 14 harvests, 3,631 plants,
368 price lines. It is not the best; it is the **most evidenced**, which makes
it the honest floor to judge others against.

## Current grading (7 Aug 2026, flower revenue only)

**FAVOUR** — Strawberry Biscotti $331 · Spritzer $265 · Lemon Drop $232 ·
Carbon Fiber $231 · Spec Ops $227 · Gush Mintz $225 · Lemoncello Runtz $222 ·
Super Boof $221

**RETIRE** — Cap Junky $125 · Fatso $124 · Grapes and Cream $124 ·
Grape Animal $108

**TRIAL** — Hella Jelly **$525/plant** on one harvest (181.3 g/plant, double
the fleet). Best thing in the data, and one harvest is not evidence. **This is
exactly what the trial table exists for.**

**The cost of getting this wrong, measured:** Grape Animal ran 5 harvests over
911 plants at $108/plant. Against the $225 benchmark that is **$117 forgone
per plant slot ≈ $107,000** across the slots it actually occupied.

## Graduation — a strain earns the main rotation, it is not promoted on a hunch

Same discipline as the [shadow log](SHADOW_LOG_SPEC.md): **evidence, then
authority.**

1. New strain enters on the **trial table** (~285 plants).
2. After **3 harvests and ≥250 plants**, it gets a real grade.
3. FAVOUR → main rotation. RETIRE → stop, with the reason recorded.
4. **A strain in main rotation is re-graded every cycle** and demotes
   automatically if it falls below benchmark. Grading is a loan, not a title.

## Planning a pull

For each upcoming pull: 3 tables to FAVOUR-grade strains (highest $/plant
first, subject to portfolio and customer commitments), 1 table to TRIAL. Fill
every table — **occupancy is the largest lever in the business** and is
measured separately (F1 is currently at 760 of 1,140).

## What this grading CANNOT see — state it on the page

1. **Margin. These are REVENUE per plant, not profit.** There is no cost data
   in any of the source tables. A strain that trims slowly or needs more
   labour could rank very differently. **The single largest gap.**
2. **55% of transfer lines carry no strain at all** — concentrate, vape,
   pre-rolls, edibles. Bulk-concentrate lab records blend 3–6 source
   harvests. **If a strain's real value is as extraction input, this ranking
   cannot see it.**
3. **Fresh frozen has no price data** — 199 FF lines carry a strain, zero
   carry a price. FF volume is reported separately and never folded in.
4. **Terpenes cannot be graded** — 31 rows across 3 strains, one reading 0.00.
5. **No demand signal** — shipped pounds exist, but no order book, no
   rejections, no returns. The scorecard's `sells_well` column cannot be
   derived from this database.
6. **41 harvests across 28 strains are excluded** — the flat 6,822 g packaged
   artifact. Their true yields are unknown.
7. **The catalogue is dirty**: `metrc_strains` holds 209 rows but only **107
   distinct names**; only **72 have ever been harvested**; transfers use 203
   spellings of which 69 match exactly; and 6 of 350 harvest batches carry a
   strain that contradicts their own batch name.

## Next measurements needed to make planning real
- **Current strain mix per room per pull** — what is actually planted now, so
  the gain from replanting to FAVOUR grades can be quantified.
- **Cost per strain** — turns revenue-per-plant into margin-per-plant.
- **Trial results log** — every trial strain, its 3 harvests, its grade, and
  the decision taken. Feeds `strain_scorecard`.
