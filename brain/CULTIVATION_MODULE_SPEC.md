# The Cultivation module — specification

**Owner mandate, 9 August 2026:** *"Every aspect of running cultivation, planning
harvests, from seed to sale, must be here."*

And the standard it must meet: *"A manager for each category can log in and get a
microscopic detailed auditing visual of every aspect of what is going on without
even clicking a tile or button — then it drills down to the most advanced forensic
audit possible."*

> **Read this first.** Almost nothing below needs building from scratch. Every
> capability the owner asked for **already has a table, and most have views**. The
> work is a surface and a wiring job. Where a table is empty this file says so,
> because an empty table behind a live button is a dead control, and a zero on a
> tile reads as "nothing to see" rather than "never recorded" (rule A3).

---

## 1 · What the owner asked for, and what backs it

| Capability | Backed by | State, measured 9 Aug 2026 |
|---|---|---|
| Rooms, plants, cycle | `metrc_plants`, `conversion_factors` | **15,595 plants** · 15,465 flowering, 130 veg · 4 rooms |
| Genetics / strains | `metrc_plant_batches` | **35 strains** · 754 clone batches · 100% own genetics |
| Harvest stages | `mv_harvest_yields.current_stage` | **6 curing · 24 packaging · 350 finished** |
| Harvest schedule | `harvest_schedule`, `harvest_plan_2026` | **137 rows · 26 pulls · 15 done · 1 never recorded** |
| Weights, wet and dry | `metrc_harvests`, `v_pull_yield` | 13,095 lb wet 2026 · 2,024 lb dried (a floor) |
| Water loss | `v_moisture_loss_register` | **72.8% measured** against a 73.5% goal |
| Waste | `metrc_harvests.TotalWasteWeight` | **3,895 lb** |
| Destroyed | `metrc_plants.DestroyedDate` | **97 plants** |
| Seed to sale, where flower is | `mv_harvest_yields.sitting_in`, `v_inventory_room_proof` | 862 held packages across 12 rooms |
| Packaged inventory by tag | `metrc_packages`, `v_stock_proof` | **862 packages held** |
| Out for testing | `metrc_packages.LabTestingState` | **32 bud · 11 concentrate out now** |
| Never tested | same | **96 bulk concentrate never submitted** ⚠ |
| Failed, needing disposition | same | **9 bud packages failed** ⚠ |
| Certificates | `metrc_documents`, `f_package_documents()` | **983 on file** |
| Manifests | `metrc_documents`, `metrc_transfers` | **2,685 files · 3,725 transfers** |
| **Allocation** | `allocation_requests`, `v_allocation_queue` | **0 rows — never used** ⚠ |
| **Crew scheduling** | 11 tables incl. `employee_schedules` | **all 0** ⚠ |
| **Zones** | `zones`, `zone_staffing_requirements`, `v_zone_now` | **all 0** ⚠ |
| **Teams / messaging** | `teams`, `team_members`, `messages` | **all 0** ⚠ |
| **Tasks from a tile** | `tasks`, `tg_task_from_dashboard()`, `AssignTask` | **built and correct · 0 rows · rendered on 1 tile** |
| Alerts and reminders | `alert_outbox`, `item_alert_route`, `alert_recipient` | built, running on cron |

---

## 2 · Allocation — the critical function

**Owner: *"forensically auditing allocation of all harvests, tracking finished
weights, is a critical function for us to stop the bleed."***

### ⛔ WHAT ALLOCATION ACTUALLY IS — corrected by the owner, 9 Aug 2026

*"Cultivation only has one licence. It allocates to manufacturing licence weight,
like fresh frozen. 909 gets weight allocated to it."*

**Allocation is the hand-off of weight from one licence to the other.**

```
CULTIVATION            MC281714      grows it, one licence only
        │
        │  ALLOCATION — this is the event being tracked
        ▼
MANUFACTURING          MP281909      receives the weight
```

This is **not** an internal bookkeeping note. It is material crossing a licence
boundary, which in Massachusetts is a real regulated movement, and **fresh frozen is
the named example** — cut wet, allocated to 909, extracted there.

**Why this is where the bleed would be.** Weight leaves cultivation and appears
under a different licence. If nobody records *what was allocated, how much, and who
approved it*, then the cultivation ledger and the manufacturing ledger can never be
reconciled against each other — and the difference between them is invisible by
construction. **0 of 380 harvests carry an allocation**, so today that reconciliation
cannot be performed at all.

**Consequences for the build, all binding:**
- `destination` on a request means **the receiving licence and room**, not a vague
  purpose. It must resolve to a real Metrc location **under MP281909**.
- The module must reconcile **allocated out of MC281714** against **received into
  MP281909**, and disagreement is the finding — never averaged (the house rule).
- Fresh frozen is the highest-volume case: **4,499 lb packaged wet in 2026**, most of
  it destined for extraction under 909. It must be measured in wet pounds and never
  added to dried flower (B3).
- **This is also why the duplicated room names matter** (J7). Eleven names exist
  under both licences. An allocation whose destination is recorded as bare
  "Fulfillment Vault" does not say which building it went to — which defeats the
  entire point of tracking the hand-off.
- The **cultivation** dashboard therefore needs an outbound view (what left, to whom,
  approved by whom) and **manufacturing** needs the matching inbound view. Same
  events, two sides, and they must agree.

`allocation_requests` already implements the exact workflow and holds **zero rows**:

```
requested_by · requester_name · requester_department      the Chief Cultivator asks
material_name · strain · quantity · uom · pounds · stream  WHAT
destination · purpose · needed_by · priority               WHERE and WHY
decided_by · decider_name · decided_at · decision_reason   the decision
approved_quantity                                          may differ from requested
status · fulfilled_at · fulfilled_note                     the close
```

- **`approved_quantity` separate from `quantity` is the point.** Approving less than
  was asked is allowed, and the gap between requested and approved is itself a
  measurable signal about where weight goes.
- **The approver is a PERMISSION, never a name.** Vincent approves today; the code
  must never say Vincent. Granting the authority is an admin action on a database
  row, several people may hold it, and revoking it is audited with a reason (H1).
- **Vincent may raise and approve on the Chief Cultivator's behalf** — both names are
  recorded, so the trail never loses who wanted the material.
- **0 of 380 harvests carry an allocation.** There is no record anywhere of where
  harvested weight went or who decided. That is the blind spot being described.

### 2b · THE COMPLETE WEIGHT LEDGER — three sources in, one hand-off out

**Owner, 9 Aug 2026:** *"We must be able to pull all detailed history of our weight
from harvests, and 3rd party flower and trim purchases, and given to licence 909."*

Every pound must be traceable from where it entered to where it went. Three
inbound streams, one outbound event, on **one ledger**:

```
IN   1. Our own harvests          MC281714    39,853 lb wet · 380 harvests
     2. Third-party flower bought  inbound manifest  1,210 packages carry one
     3. Third-party trim bought    same route
                    │
OUT  ───────────────┴──►  ALLOCATED TO MP281909
```

**What is traceable today**
- **Own harvests:** complete. Wet, waste, packaged, water loss, per harvest, to tag.
- **Bought-in material:** the **movement** is traceable — 1,210 packages carry a
  `ReceivedFromManifestNumber`, and 2,685 manifest documents are on file. Origin is
  resolved with `f_material_origin(tag)`, which walks `SourcePackageLabels` to the
  root. **Never** use `ItemFromFacilityLicenseNumber` for this — it names whoever
  defined the item, not who owned the material, and it flips to us on any repack
  (rule C0).

**⚠ What is NOT traceable, and it is the money half**
- **`material_purchases` is EMPTY. `third_party_purchases` is EMPTY.** So **what we
  paid** for bought-in flower and trim exists nowhere. The pounds are known; the cost
  is not.
- Consequently **margin on remediation and on distribution is uncomputable**, and any
  figure claiming otherwise is invented (A1).
- `third_party_material` holds **16 rows, 65.7 lb** of other companies' material in
  the Fulfillment Vault, every row physically counted and marked *"CONFIRMED 7/31
  VT"* — and **nothing reads it.** No view, no tile, no reconciliation against the
  Metrc mirror.
- That register uses **truncated tags** (e.g. `1479`, `4722`), not full 24-character
  tags, so it cannot be reliably joined to `metrc_packages`. Two collisions are
  already on record. Any reconciliation must resolve full tags first.
- Nine suppliers already appear on stock: Canna Provisions, Holyoke Wilds, Jushi MA,
  ACS, berkley botanicals, Gibby's Garden, LC Square, Nature Medicines, Solar
  Therapeutics. **30 of 32 suppliers still have `bought_as` unset.**

**So the ledger page must show pounds for all three streams and state plainly that
cost is absent for two of them, and why** (A3) — rather than rendering a blank
column that reads as zero.

### 2c · MATERIAL TYPES ARE ROWS, AND THE LIST MUST GROW

**Owner, 9 Aug 2026:** *"We must track our trim, flower vs 3rd party, and any other
materials we may want to add later. We must be able to add such materials — and
packaging too."*

Two independent dimensions, and they must never be collapsed into one field:

| Dimension | Values today | Must be extensible? |
|---|---|---|
| **What the material is** | flower · trim · fresh frozen · concentrate · packaging · … | **YES — by the owner, without a deploy** |
| **Whose it is** | ours · third-party purchased · tolled/consigned (owned by neither) | Fixed — these three are structural |

**Ours versus third party is NOT a material type.** The same trim can be ours or
bought in. Storing "third-party trim" as a single type makes it impossible to ask
"how much trim do we hold" across both, which is exactly the question. Two columns,
never one.

**⚠ THE TRAP, and it is already in the database.** `suppliers.bought_as` is
constrained by a **CHECK constraint** with a fixed vocabulary — `sound material`,
`failed for remediation`, `biomass for extraction`, `our own licence`, `not yet set`.
A check constraint is **code, not rows**, so adding a material category later needs a
migration. That directly contradicts G1 and the owner's instruction above.

*(This is on record: on 7 Aug an agent tried to write a new value and the constraint
correctly rejected it. The design was right to reject the write and wrong to be a
constraint.)*

**So the module must move the vocabulary into a table** — a `material_types`
register with the same shape as `reason_code_catalog` (code, label, description,
active, sort, set_by, updated_at) — referenced by foreign key, editable in Settings.
Existing values migrate across unchanged; nothing is lost.

**Packaging counts as a material.** It is consumed, it has a cost, and it is already
modelled inside the vape cost calculator — *but what was actually paid for it exists
nowhere*, because `material_purchases` is empty. Adding packaging as a material type
without recording its purchases just moves the invented number somewhere new.

**And destination is per-lot, not per-supplier** (already ruled, 7 Aug): material
bought as an input may end up consumed, sold on, or held — decided after arrival, and
allowed to change with the reason recorded (H1). A supplier-level field cannot carry
it.

---

## 3 · The harvest schedule surface

**One page, two views of one timeline** — calendar answers *what is coming*, list
answers *what slipped*. Both must carry **past, current and planned together**; a
calendar showing only the future cannot show drift.

**⚠ "Per the synced spreadsheet" is not yet true.** `SYNC_SOURCES` marks the 8-week
harvest calendar **not live** — loaded once from the .xlsm on 5 Aug, with re-sync
available only when the workbook is shared as a Google Sheet. The page must say so.

Plan against actual belongs here: **15 of 26 pulls complete · pull 3 (8 Feb, F1)
never recorded · 12 of 15 in a different room than planned.**

---

## 4 · Rules this module is bound by

- **Share primitives, never layouts.** Table, chip, filter, drawer, money cell,
  weight cell, drill, assign-from-tile are shared. Page layout, column choice, what
  is above the fold and what the empty state says are decided per page.
- **Every tile assigns.** `AssignTask` exists, captures the KPI value at the moment
  it was raised, and calls `tg_task_from_dashboard()`. Rule 2 says every tile; today
  it is on one.
- **Every tile drills to the items behind it** (C1) and totals reconcile to those
  items (C2).
- **Wet is never added to dry** (B3). The `FF` suffix in the harvest name is the
  *only* fresh-frozen marker — `HarvestType` is `WholePlant` on all 380 and is
  useless for this.
- **A room name alone is not a room** (J7). Eleven names exist under both licences as
  physically different rooms. Always show the department.
- **Nothing hardcoded** (G1). Targets, bands, windows and the approver are rows.
- **Absence is explained, never blank** (A3). Every empty section states why it is
  empty and what would fill it.
- **Compact over spacious.** The owner works from dashboards and has asked for
  density: small tiles, high information content, no large cards.

---

## 5 · Build order, and why

Dependencies run in one direction. Building out of order produces buttons wired to
empty tables — the `dead-controls` failure the repo already guards against.

1. **Seed zones from `metrc_locations`** (38 real rooms already synced from Metrc).
   Nothing can be staffed until zones exist; `v_zone_now` and `v_zone_staffing`
   return nothing today purely because `zones` is empty.
2. **Create teams from the 15 active staff.** Messaging "the cultivation team" is
   impossible while `teams` and `team_members` are empty.
3. **Shift templates**, so scheduling is not typed by hand each week.
4. **The allocation request-and-approve surface** — the highest-value item, and the
   one the owner named as critical. Table, queue views and audit columns all exist.
5. **The console itself**, wiring stage board, seed-to-sale locations, weights
   against goal, crew, alerts and assign-from-tile to what is now populated.

---

## 6 · Live issues this module must surface on day one

| Issue | Detail |
|---|---|
| **Metrc harvest sync FAILING** | licence MP281909 — nothing new arriving from the state |
| **Delta sync reports success, returns nothing** | a green light over an empty pipe |
| 96 bulk concentrate packages never tested | 55% of concentrate packages |
| 9 bud packages failed, no disposition | rule C6b: the undecided package is the loss |
| Harvest open 194 days | limit is 28 |
| Pull 3 never recorded | planned 8 Feb, F1, 183 days ago |
| F4 six days past cycle | 62 days against a 56-day cycle |
| 24,826 lb water on finished harvests | see the Metrc runbook — needs a two-minute check in the Metrc UI |
| Shake/Trim holds more than was created | 565.2 lb on hand against 558.7 lb created — arithmetically impossible |
| 47 open questions | each blocks a number |

---

*Assembled 9 Aug 2026 from a full parse of nav_registry, the live schema and the
owner's own words in session. Every figure measured, none estimated. Proposed page
counts and layouts are proposals; the counts of what exists are measurements.*
