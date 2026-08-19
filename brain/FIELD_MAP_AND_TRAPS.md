# The field map, the five traps, and the checks that catch them

**Owner instruction, 11 August 2026.** Agent D owns this file. It exists because
of one sentence that describes every expensive mistake this platform has made:

> **Read the wrong field, concluded the business had a problem.**

Not one of the five below was a data error. In every case the data was correct
and an agent asked it the wrong question, got a confident number back, and was
about to tell the owner his company was broken.

**Trap 1 caught Agent D on 11 August 2026, with full database access, twice in
one afternoon.** That is the reason this file is a field map and not a warning.
A warning is prose. A path is checkable.

---

## PART ONE — THE FIVE TRAPS

### Trap 1 · A batch counter is not a plant count
**Read:** `metrc_plant_batches.raw->>'DestroyedCount'`, and the plant-waste
report's `Total Plants`.
**Concluded:** roughly half of all clones die in propagation — a 52% survival
rate — and the cultivation team was losing the crop before it started.
**The truth:** `DestroyedCount` sums to **14,972** across plant batches while
real plant loss is **2,963**. Five times inflated. And plant *waste* is
post-harvest disposal: one record reads `Total Plants 1,050`, `Waste 13,075 g`,
`Material Mixed: Soil` — an entire room's root balls composted after a
**successful** harvest.
**The right field:** `metrc_plants.raw->>'State' = 'Destroyed'`.
**Real 2026 loss: 68 plants, none of them in flower.**
**What it would have cost:** a fabricated accusation against a named team, on a
record the owner may use in a contract conversation. **Waste is evidence of a
successful harvest. It is never loss.**

### Trap 2 · The item's licence is not the material's owner
**Read:** `metrc_packages.raw->>'ItemFromFacilityLicenseNumber'` to answer
"is this ours?"
**Concluded:** 191 active packages / 420.6 lb are ours.
**The truth:** that field names whoever defined the *item*, not who owned the
*material*, and it flips to us on any repack under a new item name. All 4,384
packages carry it, and on every one of them it answers a different question than
the one asked.
**The right field:** `f_material_origin(tag)`, which walks `SourcePackageLabels`
to its roots. **On any doubt, open the COA and read `Client Info`.** An internal
field cannot disconfirm an internal field — a check that cannot fail proves
nothing.

### Trap 3 · A field that usually holds one value sometimes holds a list
**Read:** `coa_extract.client_license` through `f_is_ours()`.
**Concluded:** our own product belonged to another company. A three-package
question inflated to 164.
**The truth:** laboratories print `License #: MC281714, MP281909`, so the column
holds that whole string. **621 of 983 certificates are stored that way**, and
`f_is_ours()` returns FALSE because it matches neither member. It never errored;
it answered the wrong question.
**The right field:** `f_any_ours(text)` or `f_all_ours(text)`. `f_is_ours()`
remains correct for exactly one licence.

### Trap 4 · A converted value that kept its source unit
**Read:** `v_plant_loss_by_batch.weight_qty`, with the neighbouring `uom` column
reading `g`.
**Concluded:** 29,874 grams of plant waste in total — trivial, ignore it.
**The truth:** the real figure is **13,550,773 g**. The view converts to pounds
and keeps the gram label. **Wrong by a factor of 453.**
**The right move:** sanity-check magnitude against unit before quoting. Treat any
`f_to_pounds()` output as pounds no matter what a neighbouring column says.
**Rule 5 — data must say what it is — applied to views, not just columns.**

### Trap 5 · Reading the report table when the API mirror holds the field
**Read:** `metrc_rpt_plants_destroyed.destroyed_on`.
**Concluded, twice:** first that **zero plants were destroyed in 2024** — reported
to the owner, when 3,025 were. Then again on 11 Aug 2026, that the destruction
date does not exist at all and weeks-into-flower could not be derived.
**The truth:** `destroyed_on` is NULL on all 3,773 rows because **the Metrc export
has no such column — it was invented locally.** An always-null column answers
zero; it does not error. Meanwhile `metrc_plants.raw->>'DestroyedDate'` is
populated on **2,963 of 2,963** destroyed plants — 100% — and 747 of them carry a
`FloweringDate`, so weeks-into-flower is fully derivable.
**The right order:** the API mirror first. The report tables only for fields the
API genuinely lacks — moisture being the real one.

---

## PART TWO — THE FIELD MAP

**Every path below was read from the live JSON on 11 August 2026, not from
memory.** Say the path, never the English name. "The item name" is how trap 2
happens; `raw->'Item'->>'Name'` cannot be misunderstood.

### `metrc_packages.raw`
| Want | Path | Note |
|---|---|---|
| Item name | `raw->'Item'->>'Name'` | **`Item` is an OBJECT.** `raw->>'Item'` returns JSON text, not a name |
| Tag | `raw->>'Label'` | Full 24 characters. Never a truncated tag |
| Quantity now | `raw->>'Quantity'` | With `raw->>'UnitOfMeasureName'`, always |
| Quantity at creation | `raw->>'CreatedQuantity'` | Primary production, not current stock |
| Unit | `raw->>'UnitOfMeasureName'` | Check `f_is_weight()` before assuming a weight |
| Is it a repack | `raw->>'SourcePackageLabels'` | Non-null ⇒ repack. Primary production is NULL |
| Source harvests | `raw->>'SourceHarvestNames'` · `raw->>'SourceHarvestCount'` | Count > 1 ⇒ **BLEND, no single strain** |
| Who defined the item | `raw->>'ItemFromFacilityLicenseNumber'` | **NOT ownership — trap 2** |
| Packaged date | `raw->>'PackagedDate'` | |
| Lab state | `raw->>'InitialLabTestingState'` | |
| Production batch | `raw->>'ProductionBatchNumber'` | |

### `metrc_plants.raw` — 52,839 rows, the whole life of every tagged plant
| Want | Path | Note |
|---|---|---|
| **Fate** | `raw->>'State'` | `Harvested` 46,893 · `Tracked` 2,983 · `Destroyed` 2,963 |
| **Real plant loss** | `raw->>'State' = 'Destroyed'` | **The only correct source. Trap 1** |
| Destruction date | `raw->>'DestroyedDate'` | 100% populated on destroyed plants |
| Who destroyed it | `raw->>'DestroyedByUserName'` · `raw->>'DestroyedNote'` | The accountability Metrc does record |
| Stage reached | `raw->>'GrowthPhase'` | Vegetative vs Flowering at the end |
| Clone start | `raw->>'PlantedDate'` | |
| Into veg | `raw->>'VegetativeDate'` | |
| **Flip** | `raw->>'FloweringDate'` | Cycle timing starts here |
| Harvest | `raw->>'HarvestedDate'` | |
| Wet weight | `raw->>'HarvestedWetWeight'` | **WET. Never add to dry — B3/B4** |
| Harvest link | `raw->>'HarvestId'` | |
| Batch it came from | `raw->>'PlantBatchName'` | The name carries the true date |
| Mother | `raw->>'MotherPlantDate'` | Mothers live years; they are not crop |

### `metrc_plant_batches.raw` — immature, untagged
| Want | Path | Note |
|---|---|---|
| Still in propagation | `raw->>'UntrackedCount'` | The live clone count |
| Promoted to tagged | `raw->>'TrackedCount'` | |
| **Do NOT use for loss** | `raw->>'DestroyedCount'` | **Sums to 14,972 vs 2,963 real. Trap 1** |
| Batch name | `raw->>'Name'` | **The name carries the true date; `PlantedDate` does not** |
| Where | `raw->>'LocationName'` | Clone Room vs Vegetation Room |
| Type | `raw->>'PlantBatchTypeName'` | |

> **⚠ `PlantedDate` on active batches reads the same value on every row.** On
> 11 Aug 2026 all 63 active batches carried `2026-08-04`, including ones whose
> names say June. **Parse the date from the batch name**, exactly as harvest
> rooms are parsed from harvest names.

---

## PART THREE — THE VERIFICATION SET

Run these before trusting anything derived from the paths above. **Expected
answers are baked in on purpose** — a check with no expected answer is a query,
not a check.

| # | Asks | Expected on 11 Aug 2026 | If it disagrees |
|---|---|---|---|
| **1** | **CANARY** — packages where `raw->'Item'->>'Name'` is not null | **4,384 — every package** | **STOP. Fix the JSON shape before reporting anything.** A zero here means the Item object changed and every item, strain and product figure downstream is wrong |
| 2 | Plants with `State = 'Destroyed'` | **2,963** | Real loss moved. Re-derive before quoting any loss figure |
| 3 | Destroyed plants carrying a `FloweringDate` | **747** | The weeks-into-flower population changed |
| 4 | Sum of batch `DestroyedCount` | **14,972** | Confirms it is NOT plant loss — it must exceed check 2 by roughly 5× |
| 5 | Packages carrying `ItemFromFacilityLicenseNumber` | **4,384** | Every one still needs `f_material_origin` before any ownership claim |

**Check 1 is the canary, and it is first for a reason.** It tests the assumption
every other query rests on: that the JSON has the shape we think. If check 1
blows up, fix the shape before reporting anything — the other four will still
return numbers, and all of them will be wrong.

The numbers above are perishable. **Re-run before quoting; a disagreement is the
finding, not an error to smooth over.**

---

## PART FOUR — WHAT BELONGS IN `conversion_factors`, NOT IN PROSE

**Specification for Agent I. Agent D proposes; Agent D does not write to the
database.** These are business rules currently living in documents, which means
each agent runtime carries its own copy and the copies drift. As rows they are
injected into every runtime and change in one place — rule G1: config is rows,
never code.

| key | value | unit | what it means |
|---|---|---|---|
| `room_floor_f1` · `room_floor_f3` | 1140 | plants | **Minimum** plants per flip. Owner ruling 11 Aug 2026, 2026 and beyond |
| `room_floor_f2` · `room_floor_f4` | 1050 | plants | **Minimum**, same ruling |
| `stage_days_clone_to_flip` | 27 | days | Median 2026, measured from `PlantedDate` → `VegetativeDate` |
| `stage_days_flowering` | 53 | days | Median 2026; independently reproduces `CAPACITY_TRUTH.md` |
| `plant_loss_source` | — | text | `metrc_plants.raw->>'State' = 'Destroyed'` — the only correct source |

Each row must carry `what_it_means`, `where_it_came_from`, `set_by` and
`evidence_status`, which `conversion_factors` already supports. **A floor is a
minimum, not a target to equal** — the check is "at least", never "equals".

---

## HOW THIS FILE IS KEPT HONEST

A field map that goes stale is trap 5 with extra steps. So:

1. **Every path here was read from live JSON**, and the date is stated.
2. **The verification set is the guard.** It should run on a schedule and fail
   loudly, with an output probe asserting it produced a verdict — otherwise it
   joins the 52 of 55 loops that report healthy while producing nothing.
3. **When a path changes, the check breaks before a person does.** That is the
   entire purpose.

*Written 11 August 2026 by Agent D — Brains, Loops, Agents & Guards. Traps 1, 4
and 5 were Agent D's own errors, made the same day, and are recorded here in
full because a lesson somebody else can dismiss as carelessness teaches nobody.*
