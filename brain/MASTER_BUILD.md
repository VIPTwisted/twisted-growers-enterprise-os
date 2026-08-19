# THE MASTER BUILD DOCUMENT — CEO VERSION

**Owner-issued 19 August 2026. This is the source of truth for what the OS must
be.** It outranks any design decision an agent has made or will make. Where an
existing object contradicts it, the object is wrong.

> **THE CEO RULE.** No number exists anywhere in the OS unless it drills down to
> TAG → events → documents.

Status columns below are **measured**, not asserted, and dated. Every "DONE"
names the object that makes it true so the claim can be checked in one query.
"PARTIAL" and "NOT BUILT" are stated plainly — an overstated status is how a
gap survives.

---

## 1 · Core principle — the tag spine

Every TAG tracked seed → harvest → package → transfer → sale → destruction,
with timestamps, locations, documents, events.

| Piece | Status 19 Aug 2026 | Object |
|---|---|---|
| Tag identity, one row per tag | **DONE** | canonical `distinct on (tag)` survivor rule, used by every primitive |
| Event history | **PARTIAL** | `tag_event` — 33,131 events over 24,900 tags, but only 4 event types |
| Documents per tag | **DONE** | `mv_tag_documents` (COA + manifest + invoice) |
| Drill from any number to its tags | **DONE** | `f_drill_tags(jsonb)` |
| Drill from tag to events / documents | **DONE** | `f_drill_events(tag)` |
| Time in every stage and room | **DONE** | `v_tag_stay` |

## 2 · The TAG object

Spec: `tag_id, strain_id, current_stage, current_location_id, status,
created_timestamp, destroyed_timestamp`.

**PARTIAL.** The mirror (`metrc_packages`) carries all of these fields and the
canonical dedup makes one row per tag, but there is no single named `tag` table
presenting them under those column names. `f_drill_tags` returns exactly this
shape today. A physical `tag` table is a consolidation, not new truth.

## 3 · TAG lifecycle — time in every room and stage

**DONE — `v_tag_stay`.** One row per stay: stage, room, start, end,
`duration_hours`, `duration_days`, `is_current`. Open stay = current location,
duration runs to now. **Derived** from `tag_event` rather than stored, so it
cannot drift from the events it reads. Carries the document trinity.

## 4 · TAG events

**PARTIAL — this is the biggest remaining gap in the spine.**
`tag_event` holds `received` (19,256), `location_change` (7,242), `packaged`
(4,864 after the 19 Aug backfill), `tested` (1,769).

**Missing event types:** `planting`, `harvest`, `transfer_out`, `sale`,
`adjustment`, `destruction`. The facts exist in the mirror and in Apex — they
have not been promoted into the event ledger. Until they are, the event
timeline for a sold tag stops at its last movement.

## 5 · Documents — manifest, COA, invoice

**PARTIAL.** Content is present and per-tag resolution is DONE
(`mv_tag_documents`, on 57 drill views). There is no single `document` table
with one `document_id` per document; documents live in `metrc_documents`,
`coa_extract`, `manifest_extract` and the Apex sales record. Consolidation to
one document table with a stable id is outstanding.

## 6 · Lots and packages as collections of tags

**PARTIAL.** Packages are tags. `lot` as a first-class object with `tag_ids[]`
is not built; harvest → tags is served by `v_harvest_tag_index`.

## 7 · Hard compliance gates

| Gate | Detection | Enforcement (blocks the write) |
|---|---|---|
| No transfer without manifest | **DONE** rule B | **NOT BUILT** |
| No sellable package without COA | **DONE** rule A | **NOT BUILT** |
| No sale without invoice | **DONE** rule C | **NOT BUILT** |
| No movement without timestamps | **DONE** rule F | **NOT BUILT** |
| Every KPI drills to tag | **DONE** resolver + contract `docs.trinity_on_every_drill` | front-end wiring outstanding |

**The distinction matters.** Detection tells us what the gates *would* have
caught across 2.5 years of history. Enforcement stops it happening again and
requires the write paths (Apex sync, manual entry, imports) to call the gate.

## 8 · Cultivation engine — the 56-day cycle

Owner constraints: **4 rooms · 56-day cycle · harvest every other week ·
minimum 180 lb per pull · high-yield strains only · no strain below 26 % THC.**

| Rule | Status | Where |
|---|---|---|
| 180 lb minimum per pull | **DONE** | `conversion_factors.required_lb_per_pull = 180` |
| 2 pulls per month / bi-weekly | **DONE** | `conversion_factors.monthly_pulls_target = 2` |
| Tables maximised | **DONE** | `conversion_factors.tables_maximized = 1` |
| **56-day cycle length** | **NOT BUILT** | no rule row; `harvest_open_max_days = 28` is the closeout window, a different thing |
| **4 rooms in the rotation** | **NOT BUILT** | rooms exist, the rotation is not declared |
| **Strain table with yield + THC minimums** | **NOT BUILT** | no `strain` table with `min_allowed_thc_percent = 26`, target yield, `active_flag` |

## 9 · Harvest planning engine

**PARTIAL.** `harvest_plan_2026`, `harvest_schedule`, `harvest_pulls` exist.
Auto-generation of dates every 56 days per room, staggered to bi-weekly, and
the under-180 lb flag on the PLAN are **NOT BUILT**.

## 10 · Harvest actuals engine

**PARTIAL.** Actuals are served by `v_harvest_forensic` / `v_moisture_accounting`
(wet, packaged, waste, conversion, g/plant). The three flags — actual under
180 lb, average yield under the strain minimum, COA missing blocks release —
are **NOT BUILT** as gap rules.

## 11 · Potency enforcement engine

**NOT BUILT.** `coa_extract` holds potency, so the data exists. The rules —
flag a COA under 26 % THC, auto-disable a strain that repeatedly tests under,
block planting of a disabled strain — require the `strain` table from §8.

## 12 · Gap detection engine

**BUILT — `v_tag_gap` / `v_tag_gap_summary`, rules A–G.** Standing state
19 Aug 2026:

| Rule | Gap | Count | At stake |
|---|---|---|---|
| A | COA missing (PASSED, unevidenced) | 47 tags | 117.1 lb |
| A | COA missing (other live) | 100 tags | 109.5 lb |
| B | Manifest missing | **0** | — |
| C | Invoice missing on a shipped sale | 4,823 lines | 8,822.3 lb |
| D | Broken tag chain | **0** (512 backfilled) | — |
| E | Location gap | 490 tags | 564.7 lb |
| F | Timestamp gap | 746 tags | — |
| G | Document mismatch (certificate names another licensee) | 23 tags | 175.6 lb |

**Missing gap types from the owner's list:** `metrc_chain_mismatch` (quantity
and transfer mismatches), `yield_gap`, `potency_gap`,
`harvest_underperformance` — all blocked on §8's strain and cycle rules.

**Rule D is the discipline example.** Its first run flagged 14,636 of 18,980
packages. A rule firing on 77 % of the population is finding its own defect:
14,124 were inbound packages created at another licensee, where no creation
event by us can exist. Challenged, corrected, and 512 genuine gaps backfilled
before the number ever reached the owner.

## 13 · The compliance dashboard

**DATA LAYER DONE, FRONT END OUTSTANDING.** Every tile the owner named is one
query on `v_tag_gap_summary`, and each drills to `v_tag_gap` → tag → events →
documents. The tiles are not yet rendered.

## 14 · The performance dashboard

**PARTIAL.** Yield per room, conversion, dry time and cycle adherence exist as
views. Yield per plant by strain and THC average by strain need the `strain`
table.

## 15 · The CEO rule

Enforced two ways today: the contract `docs.trinity_on_every_drill` fails
within 30 minutes if any tag-bearing page ships without COA + manifest +
invoice, and `f_drill_tags` **raises** on an unknown filter key rather than
silently returning more rows than the tile it came from.

---

## The honest headline

The **spine, the resolver, the stay ledger and the gap engine are built and
measured.** What is not built is named above without softening: the missing
event types (§4), the write-path gates (§7), the strain and cycle governance
(§8, §11), and the front-end wiring of the drill path (§13, §15).
