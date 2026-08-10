# The Data Traps Register — every way this platform has been lied to

**Owner, 7 August 2026: "All these issues must be settled so they do not appear
again with other uploads, and every agent must understand every issue we ran
into so they immediately fix."**

**Read this before importing, mapping, counting, or reporting anything.** Every
trap below actually happened. The **GUARD** column is the only part that
matters — a documented trap with no guard will happen again, and this project
has proved that twice in two days.

Legend: **🟢 GUARDED** = code stops it · **🟡 PARTIAL** = detectable, not
blocked · **🔴 OPEN** = nothing stops it happening tomorrow.

---

## A · IMPORT AND MAPPING

| # | Trap | How it shows up | Guard |
|---|---|---|---|
| A1 | **Summary/footer row imported as a transaction** | A grand-total line becomes a sale. Cost: **$1,692,460 of fabricated revenue, quoted to the owner** | 🟢 `f_is_summary_row()` at the mapper + `v_import_outliers` flags any line >5% of a money total |
| A2 | **One licence stamped on a multi-licence file** | 3,440 cultivation rows filed as manufacturing | 🟢 Per-row licence from the first column naming one of ours, filename as fallback. Fixture 9/9 |
| A3 | **Silent zero-row success** | Detected, validated, reported `ok`, wrote nothing — mapper dispatched on a literal report key | 🟢 Rows in with no rows out is now a rejection and rollback |
| A4 | **New export vocabulary** | Same fact, different column name (`Shipper Dollar Amount` vs `Shipper Wholesale Price`) | 🟢 `column_aliases` + `maps_as`, server-side in `tg_import_report_do`. Config rows, no deploy |
| A5 | **Comma inside a name** | `TG Dr, J` shredded by naive comma-splitting; 11 package↔harvest links silently dropped | 🟡 Handled in `pushreports.py` with a sentinel. **Not guarded anywhere else** |
| A6 | **Repeated headers** | Two-tier header (Tracked/Destroyed × Vegetative/Flowering) mis-files every future upload | 🟢 File with repeated headers is refused outright |
| A7 | **Proposed mapping invents a column** | A draft named two columns the export does not have | 🟢 A proposal may only reference columns the uploaded file contained |

## B · WEIGHTS, PRICES AND UNITS

| # | Trap | How it shows up | Guard |
|---|---|---|---|
| B1 | **$0.01 placeholder prices** | ~319 Buds lines. Dragged the blended rate to **$363/lb against a true ~$807**. **In `metrc_rpt_wholesale` they aggregate to $0.02/$0.03, so `> 0.01` does NOT catch them — use `>= 1.00`** | 🔴 **OPEN.** No automatic filter anywhere |
| B2 | **Manifest-level weight repeated onto every package line** | 74.9902 lb stamped on six lines; per-lb figures become nonsense | 🔴 **OPEN** |
| B3 | **Flat 6,822 g packaged default** | 41 harvests, 28 strains, identical to the gram across plant counts 79–210. A one-package default, not a measurement. Moved fleet yield 64.2 → 81.5 g/plant | 🔴 **OPEN** |
| B4 | **Repackaged material counted as production** | Downstream packages keep the original harvest name. Counting them inflates production by **up to 142%** | 🔴 **OPEN.** Filter on `SourcePackageCount = 0` for primary production |
| B5 | **Wet and dry summed** | Fresh frozen is packaged WET at ~78% of wet weight; dried flower at ~15.5%. Summing them once overstated open harvests by 3,800 lb | 🟡 Rules B3/B4 exist; **no code guard** |
| B6 | **Countable items given a weight** | "17,001 Each" treated as pounds. A pound of "each" is not a quantity of anything | 🟡 `f_is_weight()` / `f_uom_label()` exist; nothing forces their use |
| B7 | **Assuming grams** | 18.2 lb once vanished because pounds were divided by 453.592 | 🟡 `f_to_pounds()` exists; nothing forces its use |
| B8 | **Truncated Metrc tags** | Custody register holds `1479`, `4722` — not 24-char tags. **Two collisions already observed** | 🔴 **OPEN.** Resolve full tags before any join |

## C · WHAT A NUMBER ACTUALLY MEANS

| # | Trap | How it shows up | Guard |
|---|---|---|---|
| C1 | **Custody movement counted as a sale** | Eagle Eyes: **$901,430 of storage booked as revenue**, 26 out and 20 back. Metrc's own `ShipmentTransactionType` would say "Transfer" (custody only) vs "Wholesale Transfer" (ownership) — **the field exists and is NULL on all 3,723 rows** | 🔴 **OPEN.** Rule: a transporter-licence destination is never a sale |
| C2 | **Internal transfers counted as sales** | 1,035 affiliated manifests between our own two licences | 🟡 `v_manifest_ledger` classifies them; blending still possible downstream |
| C3 | **Resale blended with own production** | Own $950/lb vs resale $289/lb averaged into one false number, then compared to a $1,100 **production** cost | 🟢 Rule C6c now forbids it. 🔴 No code guard |
| C4 | **Cost basis used as a sale price** | $1,100/lb is `valuation_rates` **cost**. Agent D reported it as revenue for hours | 🟡 The table says "Owner-set **cost**". Read the `basis` column |
| C5 | **Bought-in failure read as supplier quality** | 93.5 lb of failed bought-in flower was **deliberately purchased at a discount** | 🟢 Rule C6a |
| C6 | **Maturity censoring** | A pull takes ~8 months to package out; ~46% lands in 30 days. Comparing young to mature manufactured a fake 2026 decline — **2026 is ~40% AHEAD** | 🔴 **OPEN.** Always truncate both sides to the same window |
| C7 | **A moved denominator** | "Plants per pull fell 979 → 725" — total occupancy was flat at ~87%; fresh frozen took the difference | 🔴 **OPEN.** Dry / FF / total always as three columns |

## D · STATUS AND SILENCE — the false-green family

| # | Trap | How it shows up | Guard |
|---|---|---|---|
| D1 | **`k.data ?? []`** | **129 read sites.** A failed query is indistinguishable from an empty table. One surface site in the whole app | 🔴 **OPEN.** The architecture |
| D2 | **`errors.length && tests === 0 ? "error" : "ok"`** | A run with 500 errors and 1 success reports **"ok"** | 🔴 **OPEN** in `metrc-lab-sync` |
| D3 | **Runs stuck in `running`** | 17 open, oldest 5 Aug. Never error, so no failure check sees them | 🔴 **OPEN.** Needs a timeout that marks them failed |
| D4 | **"ok, records: 0" every run** | Delta endpoints return only a recent window unless given explicit start/end. Cost: **60% of harvests, 41% of manifests, every reference table** | 🟡 Fixed once by walking windows; **no guard against recurrence** |
| D5 | **`pageSize` > 20** | Reference endpoints return HTTP 400 | 🟡 Known; not guarded |
| D6 | **Asking a licence for records it cannot hold** | Manufacturing asked for plants: **~600 impossible 401s a day, 27% of all traffic** | 🟢 Fixed 7 Aug — endpoints bound to licence type via `metrc_endpoint_capability` |
| D7 | **A check that cannot fail** | `room-capacity-never-exceeded` compares global max to global max, and capacity appears to be derived from the pulls | 🔴 **OPEN** |
| D8 | **Catalogue row counts read as truth** | `reltuples` is a planner **estimate** and reads 0 on small tables. Agent D called five populated tables empty | 🔴 **OPEN.** Always `select count(*)` |

## E · THE META-TRAP — and it is the worst one

**A decision recorded is not a decision implemented.** Proven twice:
- Sales endpoints "permanently disabled" 6 Aug — **still firing 401s on 7 Aug.**
- Nine sync rules drafted 6 Aug for CLAUDE.md — **never merged.**
- `sync:sales` marked disabled in its own description — **`enabled` stayed true** until 7 Aug.

**Rule: a decision is not closed until something in code, config or a check
enforces it.** Write the guard in the same session as the decision, or record
plainly that it is unguarded. **This register's GUARD column is that test.**

## F · THE CHECK ITSELF IS WRONG — measured 9 Aug 2026

**Seven defects recorded in `check_defect` in one day. Every one a FALSE ALARM
or an overstatement. NOT ONE was "the check missed something real."** The checks
were not failing to catch problems — they were inventing them, at 4× to 15×.
That is its own trap family, and until 9 Aug there was nowhere to record it.

| # | Trap | What it claimed → what was true | Guard |
|---|---|---|---|
| F1 | **No age band** — a difference judged with no maturity window | 201 packages "never confirmed received" → **47**; 154 had shipped within 3 days | 🟢 `check_defect` #1. Band both sides before comparing |
| F2 | **A comparison that cannot match** — a hidden prefix, a format difference | "the strain field is never wrong" → wrong **99 times**; `item` carries an `M00004123705: ` prefix so the join never matched | 🔴 **OPEN.** Run every new comparison on one known-good row first |
| F3 | **The population has more shapes than the model** | 956 strain discrepancies → **99**; 468 were BLENDS with 2–6 source harvests, 337 were product names | 🟢 `f_strain_by_tag` returns BLEND, never a strain (rule D4) |
| F4 | **A legitimate variant read as malformed** | 82 harvest names "off convention" → **6**; `F2 FF`, `F4 H`, lower-case `f3` are all valid | 🟢 G-C rewritten to test what actually breaks the ladder |
| F5 | **Absence of a thing that was never expected** | 175 certificates "unparsed" → **12**; 163 are pesticide and microbial screens with no THC by nature | 🟢 `backfill_watch.accepted_floor`, and a floor above zero is refused without its evidence |
| F6 | **A check that cannot fail** | `room-capacity-never-exceeded` compares max observed pull to a capacity that IS the max observed pull | 🟡 `check_defect` #4 recorded; the capacity figures still need the owner |
| F7 | **Hardcoded evidence, ignoring the registry** | 4 agents "NEVER RAN" → **1**; `v_agent_health` hardcodes its sources and never reads `agent_registry.evidence_table`. Its `ELSE` branch also credits QA's work to `watch:sales` | 🟡 `check_defect` #2, #3 recorded. Watchdog's lane to fix |

**THE GUARD FOR THE WHOLE FAMILY, built 9 Aug 2026:** `trg_require_fixture` on
`checker_registry`. A check cannot be enabled without naming a fixture that
proves it **fires on a real violation** AND **stays quiet on a legitimate case**.
***All six of F1–F6 would have been caught by the negative half alone.***

**A baseline is not a fixture.** It records the present so a count cannot rise;
it never shows the check firing. Applying that distinction found **nine checkers
claiming `fixture_proves_it_fails` with no fixture in existence** — the honest
proven count fell from 15 to 6, and 42 are now grandfathered debt on a ratchet
that may fall and may never rise.

**Why this family is the most dangerous one in this register:** a trap that
corrupts data is bounded. A check that cries wolf at 4–15× **trains people to
ignore the whole register**, and then the 16% that are real go unread. There are
**179 critical alerts queued unread right now**. That is this trap, already
paid for.

---

## What every agent must do

**Before importing:** run A1–A7. Preview before writing. Back up. Rows in with
no rows out is a rejection.

**Before counting:** exclude repackaged material (B4), the 6,822 g artifact
(B3), $0.01 lines at `>= 1.00` (B1), repeated weights (B2). Never mix wet and
dry (B5). Never assume grams (B7). **Never quote a catalogue row estimate (D8).**

**Before reporting a figure:** state the basis — wet or dry, cost or price,
own or resale, plants started or harvested. Derive it twice. **Truncate both
sides of any comparison to the same maturity window (C6).** Run the
**challenger** agent over it.

**Before closing a finding:** name the guard that stops it recurring. If there
is none, say so in the finding itself.

**Before you BELIEVE a finding — the five questions (section F):**
1. **Can this comparison ever match?** Run it on one known-good row first.
2. **Does the population have more shapes than my model?** List them before counting.
3. **Is there an age band?** A verdict about a period needs that period of history.
4. **Can this check fail at all?** Write down the input that would make it fire.
5. **Does it tell "nothing" from "nothing checked"?**

**If a number looks alarming and round, check the comparison before you check the
business.** On 9 Aug 2026 it was the comparison seven times out of seven.
