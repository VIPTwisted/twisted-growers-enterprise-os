# RUNBOOK — Metrc Exception Queues

**Ticket C2. Written 26 August 2026 by Agent I (Claude).**
**For the floor. Every step below happens in Metrc, by a licensed user, with a keyboard.**

---

## Read this first

This platform is a **read-only mirror of Metrc**. It holds no write credentials and has never
written back. Nothing on the Metrc Exception Queues page changes Metrc — not a weight, not a lab
state, not a harvest. Every fix in this runbook is a person clicking in Metrc.

**A caveat you must know before you follow a click path.** I could not open the Metrc UI to write
this — I have no Metrc login and would not use one if offered. The navigation below is written from
Metrc's standard Massachusetts layout and from the field names our own API mirror returns
(`TotalWetWeight`, `CurrentWeight`, `LabTestingState`, `FinishedDate` and so on, which are Metrc's
own names for the same things you see on screen). **Confirm the exact menu wording the first time
you use each path, and correct this file if it differs.** The figures, tags and harvest names are
measured from the mirror and are exact.

---

## The four queues at a glance

Read live from `v_xq_summary`. The figures below are as at 26 August 2026 and will move.

| Queue | Items | Need action now | What "need action now" means |
|---|---:|---:|---|
| Harvest moisture / residual | 201 | 10 | Impossible arithmetic, or an open harvest past the dry window with nothing off it |
| Never submitted for testing | 130 | 48 | Untested past the 180-day ageing threshold, or untested and staged for fulfilment |
| Failed test, no disposition | 249 | 10 | Live material with a disposition promised and not completed |
| Harvest open past the limit | 23 | 15 | More than twice the 28-day limit |

Severity is ranked by **consequence, not by size**: what is arithmetically impossible first, then
live material still on the floor, then the historical record. That ordering was corrected twice
during the build — see *What changed during verification* at the end.

---

## Queue 1 — Harvest moisture and residual

### What Metrc's CurrentWeight actually is

`CurrentWeight` on a harvest is the **residual**: wet weight, minus recorded waste, minus everything
packaged off it, plus anything restored. Verified on all 385 harvests in the mirror — the identity
holds to within 0.005 g on every one. It is **not a water measurement**. For a dried harvest it is
mostly water, but it can equally hold weighing error or loss nobody recorded, which is why this
queue never diagnoses a cause.

### Severity 1 — IMPOSSIBLE (2 harvests)

Metrc holds a negative residual: packaged plus waste exceeds the wet weight that was entered.

| Harvest | Wet | Packaged | Waste | Residual |
|---|---:|---:|---:|---:|
| TG Gush Mintz - 20240618 F4 | 0.309 lb | 0.201 lb | 0.201 lb | **−0.093 lb** |
| TG Apple Fritter - 20240606 F4 | 4.828 lb | 4.004 lb | 0.950 lb | **−0.126 lb** |

**In Metrc:** Plants → Harvested → *Inactive* tab → search the harvest name. Open it and read the
wet weight, the waste entries and the package weights.

**What to do.** One of the three numbers is wrong. These are 2024 harvests and the material is long
gone, so nothing is recoverable — but if the wet weight was mistyped, the same typing habit may be
live today. Check whether the wet weight was entered per-table or per-room, and whether the waste
was double-recorded. **Do not adjust anything from this platform.** A correction is a Metrc
adjustment made by a licensed user, and it must be recorded as a Metrc adjustment, not as a note here.

### Severity 2 — OPEN, PAST THE DRY WINDOW, NOTHING TAKEN OFF (8 harvests, 1,794.5 lb)

Cut more than 14 days ago (`dry_window_max_days`), still open, and not one package has come off it.
Metrc still shows the full wet weight sitting on the harvest.

The largest three:

| Harvest | Room | Cut | Days | Wet | Metrc CurrentWeight |
|---|---|---|---:|---:|---:|
| TG Spec Ops - 20260810 f4 | Dry Room #2 | 10 Aug 2026 | 16 | 439.6 lb (199,380 g) | 439.6 lb (199,380 g) |
| TG Apple Fritter - 20260727 F3 | Dry Room #2 | 27 Jul 2026 | 30 | 392.3 lb | 375.0 lb |
| TG Apple Fritter - 20260811 f4 | Dry Room #2 | 11 Aug 2026 | 15 | 275.1 lb | 275.1 lb |

**In Metrc:** Plants → Harvested → *Active* tab → find the harvest by name.

**What to do — walk the room.** There are only two possibilities and they need different actions:

1. **The material is still hanging.** Then packages are owed. Weigh and package off the harvest in
   Metrc as normal (Harvested → select the harvest → *Create Packages*). The residual falls as you do.
2. **The material has moved and Metrc was never told.** This is the serious case. Find where it
   went, package it off the harvest retrospectively, and if that is not possible raise it with the
   compliance lead before touching anything.

Nothing coming off a 439 lb harvest for 16 days is not a drying schedule — it is a recording gap.

### Severity 3 — CLOSED WITH NOTHING TAKEN OFF (29 harvests, 20.1 lb between them)

Closed in Metrc with the whole wet weight written off as residual at finish, and nothing ever
packaged or wasted. **These are all small: 0.10 lb to 1.50 lb.** They are listed because the record
is odd, not because there is material to recover. Check the wet weight before treating any of them
as a loss — a tenth of a pound is a sample or a mis-keyed entry, not a harvest.

### Severity 4 — OUTSIDE THE OWNER-SET EXPECTED BAND (162 harvests, 15,295.3 lb)

> **Owner ruling, 26 August 2026, verbatim:** *"Moisture: 70–77% stays the official expectation.
> Percentile cuts are extra context only, not the main flag."*

The flag is the owner-set band: **70% to 77%** residual, held in
`conversion_factors.expected_moisture_pct_min` / `_max`. A closed dried harvest outside it lands here.

**Below the band** means more mass came off as packages than the water loss allows — the packaged
weight is carrying water. **Above the band** means too little came off and more was written off at
finish than drying should have taken.

**The percentile cut is context, not the flag.** Every row carries an `outlier_context` column that
says whether the harvest is *also* outside our own measured spread — below 46.2% or above 86.1%, the
5th and 95th percentiles of our own 263 closed dried harvests. That is a stronger statement than
missing the owner band, and it is the right thing to work through first inside this tier, but **it
decides nothing**. The `harvest_residual_outlier_min_pct` / `_max_pct` rows exist only to feed that
sentence.

**What to do.** Work the tier by `outlier_context` first — the harvests outside our own record as
well as the owner band. Pull the harvest paperwork and compare the wet weight and the package
weights to what was written on the floor. Record what you find. Do not adjust Metrc from this screen.

**Fresh frozen is excluded from the band test.** 83 harvests are packaged wet and correctly show
no moisture loss; treating them as dried harvests is the known trap that produced a false 62.5%
figure once already.

---

## Queue 2 — Packages never submitted for testing

130 live packages Metrc records as `NotSubmitted` or `NotRequired`. Every row carries Metrc's own
proof — if a lab result, a manifest line or a certificate exists that would contradict the claim,
the proof column says so. **All 130 currently read PROVEN. Nothing self-refutes.**

### Severity 1 — past the ageing threshold (47 packages)

Untested and held longer than 180 days (`ageing_stock_days`). The three oldest:

| Tag | Item | Room | Quantity | Packaged | Days held |
|---|---|---|---:|---|---:|
| 1A40A030000E5B2000000009 | Fruit Salad Crude Oil Bulk | Hydrocarbon | 92 g | 27 Feb 2024 | 911 |
| 1A40A030000E5B2000000041 | Strawberry Candy Live Crude Bulk | Solventless | 0.65 lb | 3 Apr 2024 | 875 |
| 1A40A030000E5B2000000043 | Kerosene Berry Terpenes Bulk | Hydrocarbon | 0.03 lb | 4 Apr 2024 | 874 |

### Severity 2 — staged for fulfilment (1 package)

Untested and sitting in a fulfilment location. **Nothing untested should ship.** This is one row.
Deal with it today.

### Severity 3 — in a production room (58 packages)

Sitting in Hydrocarbon, Solventless, Production Room or Biomass Prep.

> **Owner ruling, 26 August 2026, verbatim:** *"Long-sit untested in Hydrocarbon/Solventless stay on
> the queue. Do not classify as normal WIP without an owner age cap (not set tonight)."*

**They stay on the queue and they are not classified as normal work-in-progress.** No age cap has
been set, so nothing here is ever aged out as acceptable. `open_questions.untested_intermediates_in_production_rooms`
stays **open** for the cap itself; the ruling that they remain visible is settled.

### Severity 4 — Metrc says testing is not required (24 packages)

All 24 are Seeds in the Fulfillment Vault, held 981 days. Metrc records them as `NotRequired`. They
are listed so the count is complete. Confirm once that the item category genuinely carries no test
requirement, then leave them.

**In Metrc:** Packages → *Active* tab → search the tag. The Lab Testing column is the state this
queue reads.

**What to do.** Find the package on the floor, confirm what it is, and either submit a sample
(Packages → select → *Submit for Testing*) or record why it will never need one. Do not ship it
until one or the other is done.

### What this queue cannot see

**14,822 of the 20,113 package rows in the mirror came from a Metrc report import that carries no
lab testing state column at all.** They cannot be assessed for testing. Only the 5,291 packages the
Metrc API returns are in scope. That number is printed on the page — it is not hidden.

---

## Queue 3 — Failed tests with no disposition recorded

Built from three independent Metrc signals: the package's own `LabTestingState`, the API's per-line
lab results, and the Metrc Lab Results report import.

### Severity 2 — disposition promised, not completed (10 packages, 150.43 lb)

**This is the live material and the only thing in this queue that is on the floor today.** All 10
carry an owner ruling from 7 August 2026 — `bought_for_remediation` or `remediate_in_house` — and
none has been completed. `v_remediation_owed` tracks the wait.

**What to do.** Chase each to completion and record the evidence against the tag in *Quality → Failed
Material Disposition*.

### Severity 3 — failed and closed out, no disposition ever recorded (235 packages)

Failed, since finished in Metrc, zero quantity. The material is gone and the record does not say
where it went. **126 of the compliance failures are Total Yeast and Mold** — that one test accounts
for almost all of it.

> **Owner ruling, 26 August 2026, verbatim:** *"Zero-qty failed with no disposition stay on the queue
> as record gaps; lower urgency than live pounds."*

**They stay on the queue as record gaps and they rank below severity 2**, which is the live material.
Nothing is aged out and nothing is hidden. Whether the disposition gets backfilled for the record is
still open — `open_questions.failed_material_disposition_backfill`. Massachusetts expects a record of
what happened to failed material; right now the platform can prove they failed and cannot say what
was done with them.

### Severity 7 — R&D test failure only (3 packages)

**These are not compliance failures and they are not a Metrc disagreement.** The only failing line on
each is `N-Butane (ppm) R&D Testing`. An R&D test does not set a package's compliance lab state in
Metrc, which is why the state reads `SubmittedForTesting` or `TestingInProgress` rather than
`TestFailed`. Metrc is behaving correctly.

They are listed so the failure count reconciles, and because an R&D result may still matter to the
process that made it. **Nothing is owed on the compliance side.**

Example: `1A40A030000E5B2000000014`, Kerosene Berry Diamonds Bulk, Hydrocarbon, first failing R&D
line 17 March 2024, package finished, quantity zero.

### Severity 4 — compliance failure with a package state that disagrees: **zero**

Measured across every failing line in the mirror: **128 tags fail a compliance test and every one of
the 128 reads `TestFailed`.** There is not a single genuine state disagreement. If one ever appears,
it lands at severity 4 and means the two Metrc records contradict each other — open the tag in Metrc
and establish which is right.

### What this queue cannot see

**96 of the 249 tags exist only as Metrc report rows.** The API package sync returns nothing for
them, so their current state, room and quantity cannot be shown, and the failing analyte cannot be
named — the Lab Results report repeats the batch verdict on every analyte line, so a `No` against
`CBD (%)` means the batch failed, not that CBD failed. **Re-running the Metrc package sync over those
96 tags would fill in the state, room and quantity.** That is the single highest-value fix available
to this queue.

---

## Queue 4 — Harvests open past the 28-day limit

23 harvests. The limit is `conversion_factors.harvest_open_max_days` = 28, from the owner's TG 2026
8-Week Harvest Calendar (28 days is the median harvest-to-availability across 141 scheduled pulls).
Change it there and this queue changes with it.

### Severity 1 — more than three times the limit (3 harvests)

| Harvest | Room | Cut | Days open | Days over | Packaged so far | Last package off |
|---|---|---|---:|---:|---:|---|
| TG Blueberry Muffin #4 - 20260407 F4 | Fulfillment Vault | 7 Apr 2026 | 141 | 113 | 58.4 lb | 26 Aug 2026 |
| TG Satsuma Sherbet - 20260407 f4 | Fulfillment Vault | 7 Apr 2026 | 141 | 113 | 19.1 lb | 20 Aug 2026 |
| TG Blue Dream - 20260428 F1 | Fulfillment Vault | 28 Apr 2026 | 120 | 92 | 30.1 lb | 20 Aug 2026 |

Note the rooms: **Fulfillment Vault, Cure Vault, Pre Trim Storage Room.** The material has left the
dry room. The harvest simply was never closed.

**In Metrc:** Plants → Harvested → *Active* tab, sorted by harvest date.

**What to do.** Finish packaging what is left and close the harvest out (Harvested → select →
*Finish Harvest*). Two of the 23 have never had a single package taken off them — *TG Satsuma
Sherbet - 20260629 F1* and *TG Glitter Bomb - 20260629 F1*, both 58 days open, both showing 0.0 lb
packaged. Those two need the room walked before anything is closed.

---

## Verification pack — check these against the Metrc UI

The ticket asks for three tags or harvests to be compared to the Metrc screen. **I could not do this
myself: it needs a Metrc login, which I do not have and would not use.** Here is exactly what to
check and exactly what the mirror asserts, so it takes about five minutes.

Values are given in **grams** where Metrc shows grams — the harvest screens are in grams and the
mirror converts to pounds only for display.

### 1. Harvest — TG Spec Ops - 20260810 f4 · Queue 1, severity 2

Metrc harvest ID **2343203**, licence **MC281714**.
Metrc → Plants → Harvested → Active → search "TG Spec Ops - 20260810".

| Field on the Metrc screen | Mirror asserts |
|---|---|
| Harvest date | 10 Aug 2026 |
| Drying room | Dry Room #2 |
| Plants | 305 |
| Total wet weight | **199,380 g** (439.6 lb) |
| Total waste | **0 g** |
| Total packaged | **0 g** |
| Current weight | **199,380 g** (439.6 lb) |
| Finished date | *empty — harvest is open* |

**Pass if** every figure matches. **Fail if** Metrc shows packages against this harvest that the
mirror does not — that would mean the sync is behind, and the mirror's last read of this harvest was
17 Aug 2026 13:41 UTC.

### 2. Package — 1A40A030000E5B2000000009 · Queue 2, severity 1

Licence **MP281909**. Metrc → Packages → Active → search the tag.

| Field on the Metrc screen | Mirror asserts |
|---|---|
| Item | M00003180115: Fruit Salad Crude Oil Bulk |
| Location | Hydrocarbon |
| Quantity | **92 g** |
| Packaged date | 27 Feb 2024 |
| Lab testing | **NotSubmitted** |
| Finished | No |

**Pass if** Lab Testing reads NotSubmitted and no test result is attached.
**Fail if** Metrc shows a lab result on this tag — the mirror holds zero lab result rows for it, and
a result appearing in Metrc would mean this package does not belong in the queue at all.

### 3. Package — 1A40A030000E5B2000000014 · Queue 3, severity 7 (the R&D case)

Licence **MP281909**. Metrc → Packages → Inactive → search the tag.

| Field on the Metrc screen | Mirror asserts |
|---|---|
| Item | M00003189214: Kerosene Berry Diamonds Bulk |
| Location | Hydrocarbon |
| Quantity | **0 g** (finished) |
| Packaged date | 7 Mar 2024 |
| Lab testing | **SubmittedForTesting** |
| Lab testing state date | 28 Mar 2024 |
| Lab results on the tag | 61 result lines, of which **exactly one failed**: `N-Butane (ppm) R&D Testing`, 17 Mar 2024 |

**This is the important one.** It confirms or refutes the R&D distinction the queue now depends on.

**Pass if** the failing line is the R&D test and the compliance panel shows no failure.
**Fail if** Metrc shows a *compliance* failure on this tag — then the R&D split is wrong, severity 7
is hiding real work, and Queue 3 must be revisited.

### 4. Bonus — harvest TG Blueberry Muffin #4 - 20260407 F4 · Queue 4, severity 1

Metrc harvest ID **2262942**, licence **MC281714**. Plants → Harvested → Active.

| Field | Mirror asserts |
|---|---|
| Harvest date | 7 Apr 2026 |
| Drying room | Fulfillment Vault |
| Plants | 276 |
| Total wet weight | **145,700 g** |
| Total waste | **6,175 g** |
| Total packaged | **26,489 g** |
| Current weight | **113,036 g** |
| Finished date | *empty after 141 days* |

Record the result of each check — pass, fail, or could not find — and bring the failures back. A
failure here is a finding about the queues, not about the floor.

---

## What changed during verification, and why it matters

Three defects were found and fixed **after** the queues were first built. They are recorded because
the same mistakes are easy to make again.

1. **The sign test used the wrong tolerance.** A negative residual was tested against
   `harvest_mass_balance_tolerance_lb` (0.5 lb), a *ledger rounding* tolerance. Both genuinely
   impossible harvests are small, so 0.5 lb swallowed them and the queue showed zero. The test now
   runs on the native gram integers Metrc returns, before any unit conversion. **A negative is a
   sign error at any magnitude, not rounding.**

2. **Severity ranked by category instead of consequence.** 29 closed harvests holding 20.1 lb
   between them outranked 8 open harvests holding 1,794.5 lb. Live material now comes first, in
   both Queue 1 and Queue 3.

3. **R&D failures were being reported as Metrc contradicting itself.** Severity 4 collected three
   tags and called each "the two Metrc records disagree". Checked one at a time, the only failing
   line on each is an R&D test, which does not set a compliance state. **That was a false finding
   and it was one query away from reaching this runbook as fact.** R&D failures now have their own
   severity that explains why the state does not move.

A fourth thing was fixed that was not a correctness defect: the summary read each queue four times
and timed out. Two partial indexes on the failing lab lines and one aggregate per queue took it from
over eight seconds to 410 milliseconds.

---

## Where everything lives

| Thing | Where |
|---|---|
| The page | Metrc → Exception Queues → **Metrc Exception Queues** |
| Queue 1 | `v_xq_harvest_moisture` |
| Queue 2 | `v_xq_never_submitted` |
| Queue 3 | `v_xq_failed_no_disposition` |
| Queue 4 | `v_xq_harvest_open_past_limit` (wraps `v_overdue_harvests`) |
| The tile | `v_xq_summary` |
| The thresholds | `conversion_factors`, read through `f_rule()` |
| The tile-vs-drill guards | `tile_drill_contract`, keys `xq.*` — run `select * from tg_check_tile_drill()` |
| The questions for the owner | `open_questions` — the moisture-cut question is **answered** by the 26 Aug ruling; two remain open: the untested-intermediate age cap, and whether historical failed dispositions get backfilled |
| The component | `app/web/src/metrc-exceptions.jsx` |
