# The Critical Board — must-do today, ranked by consequence

**Computed live 7 August 2026, ~18:40 UTC.** This is the department's P0 from
the owner's own go-live tracker: *"Brain must be operations-critical, not a
search box. Critical Board — the must-do-today list computed live, ranked by
consequence."*

**Ranking is by CONSEQUENCE, not severity flag.** The order comes from the
owner's own words in `agent_registry`: *"These threaten the licence, which
outranks every cash figure."*

> 1 · Licence · 2 · Cash trapped · 3 · Capacity lost · 4 · Decisions blocking
> · 5 · System integrity

---

## ✅ TO DO — TODAY, 8 AUGUST 2026 (owner-set)

Set by Vinny on 8 Aug 2026 during the session-connection work. These are **his
rulings**, not an agent's ranking — they sit above the computed board below.

| # | To do today | Why it is here | State |
|---|---|---|---|
| **T1 ✅ BUILT 8 Aug** | **`v_moisture_loss` — measured nightly, never typed. And it names the phantom weight.** **Measured 72.8%** across 276 finished dried harvests (34,082 lb wet), against the **73.5% goal** — 0.7 points apart. **The residual objection is defeated by a control group:** CLAUDE.md warned the mass balance always closes so it proves nothing. Fresh frozen is computed by the *identical* arithmetic but never dries — it returns **1.2%**, against **72.8%** for dried. An artifact would show in both. It doesn't. **THE PHANTOM WEIGHT IS NOT MISSING MATERIAL — IT IS WATER STILL ON THE BOOKS.** Metrc's `CurrentWeight` is literally wet − waste − packaged, so evaporation never left the record: `TG Gush Mintz - 20250923 f1` finished 31 Mar 2026 and Metrc still shows **436.6 lb** in it. Across 276 finished harvests that is **24,826 lb** — far more than the 6,796 lb previously reported, and it **overstates inventory to the state**. The owner was right that it is all in seed-to-sale; it is there, wrongly present rather than absent. Goal is an editable row (G1). | ~~original text below~~ |
| ~~T1~~ | ~~**Settle the moisture band (defect D1).**~~ | It sits underneath every conversion, yield, inventory and valuation figure, and blocks 6,796 lb of Metrc correction work. **The arithmetic is impossible as it stands:** 18,476.7 lb wet in, less 14,319.4 lb evaporated at the 75–80% band, leaves **4,157.1 lb** dry available — but **5,199.1 lb was actually packaged.** That is **1,042 lb that cannot exist.** Either the band is too aggressive, wet weights are under-recorded at the takedown scale, or packaged weights include material from elsewhere. | **Owner deferred 8 Aug — on the list, not started.** No agent may guess the band. Fix: weigh 2–3 harvests end to end, then set the true band on Settings → Business Rules. |
| **T2** | **Parse the 11 certificates missing their client licence.** | `coa_extract` holds **983** certificates and **11 have `client_license` null**. That field is the *only independent* answer to "is this ours?" — rule C0 says ownership stops at the COA, and an internal field cannot disconfirm another internal field. 972 of 983 are fine; these 11 are blind spots. | **Open — to do today.** The PDFs are already on disk in `metrc_documents.storage_path`. Open them and read `Client Info`. |

### T3 · LINK HARVESTS TO PULLS — ✅ BUILT 8 Aug 2026. One owner decision still open.

**`v_harvest_pull_link`** — every Metrc harvest attached to its planned pull.
**`v_pull_yield`** — what each of the 26 pulls actually produced.

**Joined on DATE, never on room.** All 95 of the 2026 harvests fall within
7 days of a planned pull, and pulls are 14 days apart, so the window partitions
the year with no overlap. Room-matching was tried and **fails**: only **16 of 95**
harvests sit in the room the plan expected, and matching on room produced offsets
of 14, 21 and 22 days — exact multiples of the cadence, i.e. landing on the wrong
cycle entirely. The room is now reported and its drift flagged, never joined on.

**Both tunables are owner-editable rows (G1), not literals:**
`pull_link_window_days` = 7 · `pull_target_dried_lb` = 380.

**THE CORRECTION THAT CHANGES EVERY YIELD FIGURE.** Yield now reads Metrc's
**`CreatedQuantity`**, not `Quantity`. `Quantity` is what REMAINS today, so
`mv_harvest_pkg_rollup` reports a sold-through harvest as a near-total failure:
`TG Apple Fritter - 20260127 F4` shows **bud_lb 0.00** against **14 packages
holding 121.8 lb when created**. Across 2026: **6,330 lb created vs 824 lb still
held, 308 of 460 packages fully depleted.** Every yield built on `Quantity`
decays toward zero as stock sells — it measures the shelf, not the plants.
**`mv_harvest_yields` and anything reading it inherit this and are not yet fixed.**

**⛔ STILL OPEN — an owner decision, and no agent may guess it (A5).**
**1,848 of 4,218 packages (44%, 9,734 lb) draw on MORE THAN ONE harvest.** They
are reported per pull as `multi_harvest_lb_unallocated` and **excluded from
`dried_bud_lb`**, which is therefore a **FLOOR**. On pull 7 the floor is 253.4 lb
with a further **1,013.5 lb** unallocated beside it. How should they split —
evenly, by wet weight, by strain, or excluded entirely?

**Found while building: pull 3 (8 Feb, F1) has NO harvests linked at all.** The
date is long past. Either it did not happen or it was never recorded in Metrc.

### T3 background — the gap as it stood before the build

**Raised 8 Aug 2026. This is the highest-leverage unbuilt thing on the board**,
because it is not one question's blocker — it is the same blocker under two of
them, and neither can move until it is closed.

**What is missing.** Metrc records harvests. The business runs on **pulls**. The
platform has never connected the two:

| Fact | Measured 8 Aug 2026 |
|---|---|
| `mv_harvest_yields.planned_pull` | **NULL on every packaged harvest** |
| Average plants per Metrc harvest | **132** — a pull is ~1,140, so 8–10 records |
| `mv_harvest_yields.room` | A **storage** room (Cure Vault, Freezer/Biomass), **not** Flower Room 1–4 |

**What it unblocks, both of which the owner asked for directly:**

1. **"Expected 380 lb dried per pull."** Cannot be measured, cannot be
   contradicted. Dried material on file runs 46–113 g/plant; 380 lb implies 151.
   Whether that gap is real, or fresh frozen leaking into the comparison, or
   under-recording, is unanswerable while pulls do not exist as a grouping.
2. **Phantom weight — 6,796 lb.** The owner: *"Cant be phantom weight its all
   documented in Metrc seed to sale."* Tracing it means following material from a
   pull through its harvests to its packages. Without the link there is nothing to
   follow.

**⚠ And it must respect rule B3 while doing it.** Freezer/Biomass Storage shows
**277–417 g/plant** because that material is **fresh frozen, packaged wet.** Any
yield-per-pull figure that averages across storage locations mixes water with
flower — the same class of error as the grams-per-plant against
grams-per-square-foot comparison that was wrong by a factor of six.

**Likely shape of the fix:** harvest name already encodes room and date by
convention (`TG <strain> - <YYYYMMDD> <room>`), and `harvest_plan_2026` holds the
26 pulls with their dates. Matching on room plus a takedown window is the obvious
route — **but D7 is a live hazard**: harvest names are inconsistent in Metrc
(`f3`, `F3`, and the malformed `7f3`, `aF3`), so those will misfile and must be
reported rather than silently dropped (rule A3).

### Deferred by the owner on 8 Aug 2026 — decisions, not oversights
Recorded so no future session re-raises them as new findings (rule H1: ignoring
is a decision, not a deletion).

- **🔒 ALL CREDENTIAL ROTATION IS DEFERRED TO ONBOARDING. STOP RAISING IT.**
  Owner, 9 Aug 2026: *"I am not changing pw, secrets or keys until after deployed
  live. Put on to-do list, stop repeating that until we get into onboarding."*
  **This is a decision, not an oversight** (H1). Covers the `tg_desktop_reader`
  password in the three committed files, the build-phase owner passwords, and the
  edge-function admin key. **No agent may re-raise any of these until the owner
  opens onboarding.** Re-raising a settled deferral wastes his attention and trains
  him to ignore the channel — the same failure as a noisy alert.
  **Then, at onboarding:** rotate `tg_desktop_reader` (its password is in git
  history, so deleting the lines does not help), set real owner passwords, and
  rotate the edge-function admin key.
- **47 unanswered owner questions** (was 44 on 7 Aug) — *"leave this alone for later."*
- **Owner accounts still on build-phase passwords** — *"leave alone for now."*
  Still true, still flagged in `HANDOFF.md` §6, and still matters before real
  staff onboarding.

### Closed on 8 Aug 2026
- **Credentials in a cloud-synced config.** 23 permission entries with live keys
  baked in — 10 edge-function admin keys, 5 Supabase JWTs, 4 Netlify proxy
  tokens, 4 signed storage URLs — were sitting in
  `Desktop\Twisted Growers\.claude\settings.local.json`, which syncs to OneDrive.
  Removed; file verified clean. **No key was rotated** at the owner's direction,
  so every credential remains valid — it is simply no longer stored there.
- **The nightly self-check miscounted cron in both directions. FIXED and proven.**
  `cron_failing` now counts only a genuinely *failed* latest run, so an in-flight
  job is no longer called a failure — it read **8** this morning and reads **0**
  now, correctly. New `cron_failing_24h` catches intermittent failures the old
  check structurally could not see, and it immediately found the one that was
  hiding: **`refresh-tower-inventory`, 7 timeouts in 48 runs**, invisible for two
  days because its most recent run kept passing. It now raises a real
  `watchdog_findings` row naming the job, where before the check recorded a
  number and raised nothing.
- **The SQL guard had a false positive that locked a function.** Owner-directed
  fix, 8 Aug: `guard-sql.mjs` required only the *words* "grant … to … anon", so
  English prose inside `tg_nightly_platform_check()` blocked every edit to it.
  `grant` must now be followed by an actual privilege keyword — true of every
  real GRANT, false of prose. **Deliberately not anchored to a statement start,
  so a GRANT buried inside a plpgsql body is still caught.** Test suite extended
  from 8 to 14 cases and all pass, including five real GRANT shapes that must
  still block and two prose cases that must not.
- **`brain/INDEX.md` described less than half the brain.** 24 files existed and
  none were listed. All 24 now indexed.
- **Sessions opened on the Desktop stub started with no rules and no guards.**
  The stub now injects the full rule set by hook and carries the agents, skills
  and SQL guards by junction. Verified 8/8.

### The lesson from the guard, worth keeping
A guard that scans *every string* in a tool call cannot tell SQL from English.
This one read its own documentation as an attack and locked the function that
writes its findings — the safety mechanism became the outage. **The general
form: a check that fires on prose will eventually fire on the text explaining
the check.** Guards must match the shape of the thing they forbid, not its
vocabulary. Both changes here kept the guard strictly no weaker: every real
`GRANT` shape still blocks, proven by test, including one hidden inside a
plpgsql body.

---

## 1 · LICENCE RISK — outranks every dollar below

**$163,130 of product cannot legally be sold. None of it was ever submitted
for testing.**

| What | Packages | Weight | Oldest | Value |
|---|---|---|---|---|
| Concentrate, never submitted | 76 | 89.6 lb | **892 days** | $98,560 |
| Dried flower, never submitted | 2 | 52.4 lb | 200 days | $57,640 |
| Shake and trim, never submitted | 2 | 6.3 lb | 200 days | $6,930 |

**892 days is two and a half years.** Seventy-six packages of concentrate have
sat untested since roughly February 2024.

**Failed testing with NO DISPOSITION RECORDED — 75.5 lb.** 75.4 lb of our own
dried flower (5 packages, oldest 105 days) and 0.1 lb of concentrate (oldest
**883 days**).

> **This is not $83,050 of loss.** Per the owner, 7 Aug: failed material can be
> **remediated in-house, sold on for remediation, or destroyed** — and the
> business already *buys* failed material at a discount (93.5 of 211.3 lb of
> bought-in flower on hand failed testing). **The finding is that no
> disposition has been recorded**, not that the material failed. Rule H1: an
> issue does not clear itself. **⚠ The watchdog's own advice omits the sell
> option** — it reads *"remediate or destroy"* and should read *"remediate,
> sell for remediation, or destroy."*

**Also open: 68 custody flags · 8 Metrc corrections outstanding · 22 harvests
open past the 28-day limit.**

## 2 · CASH TRAPPED — $2,679,160 over age limits, flagged since 6 Aug, unresolved

| Stream | On hand | Oldest | Limit | Value |
|---|---|---|---|---|
| Dried flower | 1,007.2 lb | **647 days** | 90 | $1,107,920 |
| Fresh frozen | 603.9 lb | 94 days | 60 | $664,290 |
| Shake and trim | 602.3 lb | 200 days | 120 | $662,530 |
| Concentrate | 222.2 lb | **892 days** | 120 | $244,420 |

**Total flagged across all open alerts: $2,925,340.** Every one carries the
same recommended action: *"Move it, sell it, process it, or raise the limit
deliberately."* Raised 6 Aug. Seen five times. Still open.

## 3 · CAPACITY

**22 harvests open past the 28-day limit.** Room occupancy is fine — 86.5%
total in 2026, 11 of 15 pulls at full capacity — so the dry-flower shortfall
is **fresh-frozen diversion, not empty rooms** (see
[CAPACITY_TRUTH.md](CAPACITY_TRUTH.md)).

*Live flowering counts could not be read in this pass — the growth-phase filter
returned nothing. Not reported rather than guessed (A1).*

## 4 · DECISIONS BLOCKING WORK — only the owner can clear these

- **4 storage limits have no `max_lb`** — every row reads *"awaiting Vincent"*.
  **Until they are set the platform can flag material as OLD but never as TOO
  MUCH.** Four numbers, one minute, and the alerts above become complete.
- **44 open questions unanswered.** Each is a business fact the data cannot
  infer, and each blocks a number.
- **179 go-live items open.**
- Plus the arbitration queue in [CONTRADICTIONS.md](CONTRADICTIONS.md).

## 5 · SYSTEM INTEGRITY — and one number is moving in the wrong direction

- **`ddl_guard_log` unresolved: 13.** It was **5 this morning.** Eight new
  violations today — objects created without RLS or reachable by PUBLIC while
  agents were shipping. **This is security debt accumulating in real time**,
  and it is the clearest argument for the attribution fix: the log says
  `actor = postgres` for all of them, so nobody knows which agent.
- **7 of 18 agents unhealthy.**
- **17 sync runs stuck in `running`**, oldest 5 August — never errored, so no
  failure check sees them.

---

## How to build this as a live page (Agent B)

One view, `v_critical_board`, with a `consequence_rank` column (1–5 above) and
a `consequence_note` in plain English. Sources, all existing: `inventory_alerts`
(unresolved), `watchdog_findings` (open, with dollars), `custody_alert_log`,
`metrc_corrections`, `open_questions`, `storage_limits` (null `max_lb`),
`ddl_guard_log` (unresolved), `v_agent_health` (status ≠ ok), and
`metrc_sync_runs` (status = running).

**Rules it must obey:** every row drills to its items (C1) · totals reconcile
to the rows (C2) · absence explained, never blank (A3) · the accountable party
named on the row · **and it must rank by consequence, not by severity flag** —
a $110 finding tagged critical must not outrank $1.1M of ageing stock.

**Then it belongs on the Command Center dashboard as the first thing anyone
sees.** A must-do list nobody opens is a list nobody does.
