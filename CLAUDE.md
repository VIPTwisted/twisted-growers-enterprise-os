
---

## HARD RULES — DASHBOARDS (owner-set, 2026-08-05)

These are not preferences. They are requirements on every dashboard in the platform.

1. **Every category has a dashboard.** Command, Cultivation, Inventory, Quality,
   Sales & Cash, Manufacturing, Metrc, Workspace, Human Resources, Infused
   Pre-Rolls & Flower, Settings. It is the first item in its category. Every
   subcategory beneath it feeds into it.

2. **Every dashboard is actionable, to ClickUp standard.** A manager with access
   must be able to assign a task directly from any tile, to a named person, with a
   due date and a priority — and the task carries the number that triggered it,
   captured as it stood at that moment. Not a link to somewhere else. On the tile.

3. **Every dashboard carries extensive reporting and KPIs.** Live tiles, drill from
   any tile straight into the underlying records, and the full report set for that
   department reachable from the same page.

4. **Everything replicates up.** Every category dashboard feeds the two master
   dashboards — Control Tower and Chief Executive Dashboard — so all of it is
   collected in one place.

5. **Users personalise the two master dashboards.** Anyone with access can toggle
   individual tiles off and drag to rearrange their own layout. Saved per user, so
   two executives can hold completely different views of the same data.

6. **Nothing is ever omitted, sacrificed or shortened** when consolidating. Menus
   may be reorganised; data, features, tools, auditing and reporting may not be
   removed. Consolidation means grouping, never deletion.

7. **Never assume how the business works — ask.** Where intent cannot be derived
   from data, model it as an owner-set field defaulting to "not recorded", and say
   so plainly on the page. Never guess a default. See `open_questions`, which raises
   these automatically the moment they appear.

8. **Never state a benchmark or comparison without a real source.** Every headline
   metric declares how it is calculated, what it assumes and what it cannot tell you.

9. **THEME IS LOCKED.** Neon green is the brand. No colour or theme change without
   explicit approval. No greys on icons, no pastels, bright reds not dark.

10. **DASHBOARD STANDARD — SET IN STONE.** Every dashboard in this platform must
    meet or exceed this bar. A list of links is NOT a dashboard. Required on every
    single one:
    - **Live KPI tiles** — large number, unit, plain-language label, colour rail
      (green good, amber watch, red bad) driven by an owner-set target.
    - **Target on the tile** — "no more than N" / "at least N", and the tile turns
      red the moment it breaches. Targets are owner-set rows, never invented.
    - **Trend sparkline** on every tile, from real daily snapshots. Where there is
      no history yet it says so — NEVER a fabricated line.
    - **Change since yesterday**, stated in words.
    - **Forensic drill on every tile** — one click into the exact records behind
      the number, not a general report.
    - **Assign from the tile** — a manager assigns a task to a named person with a
      due date and priority, and the task captures the KPI value as it stood at
      that moment.
    - **Entity cards** — per stream, room, supplier or store, each with its own
      sub-metrics and its own drill.
    - **Live activity feed** — what the watchdog is flagging and what tasks are
      open, each row clickable.
    - **Collapsible sections with counts**, remembered per user.
    - **Action bar** — recompute, print, and jump to tasks and alerts.
    - **Honest empty states** — "nothing open", "no history yet". Never a fabricated
      bar, line or number.
    Reference standard: https://vip-ceo-platform.netlify.app/ — match it or beat it.

---

## LOCKED FACTS — confirmed 6 August 2026. Do not re-derive these.

These were argued over repeatedly and are now settled from the owner's own
authoritative documents. If a figure below is ever questioned again, the answer
is here with its source. **Do not infer, derive or guess any of them.**

### Flower rooms — from `TG_2026_Harvest_Calendar_STRICT_8_WEEK_CYCLE_FULL_DETAIL.xlsm`, Pull Summary tab

| Fact | Value |
|---|---|
| Tables per room | **4** |
| Plants per table | **287.5** |
| Operating plants per room | **1,150** ⚠️ **CONTESTED — see below** |

> ⚠️ **1,150 IS DISPUTED AND IS PROBABLY NOT A ROOM CAPACITY.** Measured 7 Aug
> 2026: `conversion_factors` holds **F1 1,140 · F2 1,050 · F3 1,140 · F4 1,050**,
> and actual plant counts match those, not 1,150. The 1,150 traces to
> `Labor Calculator!B2`, headed *"Estimated total plants — Editable"* — a
> **crew-sizing input**, not a capacity. It was copied into all four
> `grow_rooms` rows and all 26 rows of `harvest_plan_2026`, so the plan
> **overstates F2 and F4 by 100 plants each**. Open arbitration item #11 in
> `brain/CONTRADICTIONS.md`. **Until the owner rules, use `conversion_factors`
> and say which you used.**
| Room cycle | **56 days**, all four rooms, every pull |
| Pull cadence | **14 days** (13/14/15 with the Sunday/Monday stagger) |
| Pulls in 2026 | **26** |
| Harvest to availability | **28 days** (median of 141 scheduled pulls) |

**190 and 210 are WRONG and must never be reinstated.** They were a per-table or
per-batch-group count that had been recorded as room capacity. They caused a
day of false findings.

**There is NO square footage anywhere in any spreadsheet.** The Grow Room Setup
tab of the operations planner is all zeros. The "1,140 sq ft" previously held in
`grow_rooms.sqft` was a plant count filed in the wrong column — which is why it
matched Flower Room #3's standing plant count exactly. `sqft` is now null by
design. Only populate it from a physical tape measure.

### Yield — the target is per PLANT, not per square foot

The harvest calendar column headed "Projected grams/sqft" is **mislabelled**. It
is grams per plant. Proof, from the Pull Summary: pull 9, F3, 1,140 plants,
80,465 g projected = **70.6 g per plant**. Every row divides the same way.

- Target: **70.6 g per plant** per cycle
- Actual: **82.3 g per plant** across 87 closed harvests — **17% ahead of plan**

### Plants are 100% our own genetics

754 clone batches, **every one** with `SourcePlantLabel` populated pointing at
our own mother plants. **Zero** sourced from a package. Bought-in material enters
Metrc as *packages* on a manifest, never as plants — so no plant in the system is
third-party or a purchased clone. 1,054 plants harvested from Flower Room #3 in
July: 1,054 distinct tags, one 20-day planting window, all Flowering. No
double-counting.

### Business rules and their sources

| Rule | Value | Source |
|---|---|---|
| Moisture loss | 75–80% ⚠️ **CONTESTED** — the live platform uses **70–77%**, owner-set 6 Aug 2026 on **measured 73.5%** across the **271 harvests that actually dried**. 75–80% came from published guidance, not our own harvests. **62.5% is the known trap** — it includes 77 fresh-frozen harvests that never dried. And the band is a *residual* (wet − waste − packaged), so **the mass balance always closes and proves nothing**. Open item #1 in `brain/CONTRADICTIONS.md`. | Published drying guidance (AROYA, Preair) |
| Dry window | 10–14 days | Published guidance (Paramount, AROYA) |
| Fresh frozen wet:dry | 4.5 | Follows from the moisture figures |
| Ageing threshold | 180 days | Stability research: 6–12 month shelf life, ~16% THC loss at one year |
| Laboratory turnaround | **2 days** | Measured, 2026 only: 1,496 samples, avg 0.32 d, p95 1 d |
| Harvest open limit | 28 days | The owner's own calendar |
| Room cycle | 56 days | The owner's own calendar |

### Money

| Fact | Value |
|---|---|
| Bulk flower | **$1,100/lb** — owner-set, supersedes the $741 and $1,200 in the workbooks |
| Shake and trim | $300/lb |
| Fresh frozen | $119.77/lb — `(741 × 0.6777) + (300 × 0.3223) × 0.2` |
| Concentrate | Per sub-type from the Inventory Value Sheet — rosin/bubble hash $15/g, live badder $12/g, cured badder/diamonds/shatter/sugar $9/g; crude and distillate fall back to the calculator |
| Trim input cost | **$250/lb** — owner-set, expected to move |
| Total operating cost | **$285,000/month, WAGES INCLUDED** — do not add payroll on top |
| Actual cost per pound | **$591.39** — $285,000 × 6 months ÷ 2,891.5 saleable lb |

Every one of these is editable in the platform. None is hardcoded.

### Standing rules learned the hard way

- **Never `drop view … cascade`.** It destroyed `mv_department_dashboard` twice
  in one day and blanked every dashboard with no error, because `App.jsx`
  swallows the failure with `k.data ?? []`. Use `create or replace`.
- **Never anchor a scripted edit on a common line** such as
  `const [busy, setBusy]`. It put state in the wrong component three times and
  caused three blank screens. Anchor on the function signature.
- **Check units before comparing to a benchmark.** Grams per plant against grams
  per square foot produced a "you are at half your plan" finding that was wrong
  by a factor of six.

---

## HARD RULE — EVERY TILE MUST PROVE ITSELF

Set by the owner, 6 August 2026. Binding on every AI and every person who
touches this platform. Not negotiable, not "later", not "phase two".

**A tile, a total or a headline number is a CLAIM. It is worthless without the
evidence behind it.** Every single one must open to the individual items that
make it up — no summarising, no sampling, no "top 20".

### What every drill-down must show, per item

For **each and every** package, batch or record behind a figure:

- Package tag, product name, cultivar, stream
- Source harvest, harvest cut date, drying room, harvest closed date
- Made from which parent packages, production batch
- Where it is now, when it arrived there, how long it has been there
- Quantity **in its own unit of measure** — never an invented conversion
- **Date it went out for testing, date it came back, days at the laboratory**
- **Test status stated plainly: RETURNED with the date, PENDING, or NOT SUBMITTED**
- **THC, TAC, terpenes — the values if returned, or exactly why they are absent**
- **Certificate of analysis — the link, or why there is none**
- **Manifest — the number and who shipped it, or why none exists**
- Origin: grown by us or bought in, under which licence, from whom
- The rate used to value it and the resulting value
- Full traceability sentence

### The three unbreakable parts

1. **Totals must reconcile to the items.** If a tile says 1,943.6 lb, the rows
   behind it must add to 1,943.6 lb. A total that cannot be reconciled is a bug,
   not a rounding difference.
2. **Absence must be explained, never blank.** "No certificate" is not acceptable.
   "No certificate because Metrc's package interface carries no analyte values and
   the Lab Results report has not been imported" is acceptable. Every missing
   value states WHY it is missing and WHAT would make it appear.
3. **Never invent a number to fill a gap.** A countable item has no weight. An
   unmeasured room has no yield per square foot. Show the gap and name it.

### Where this is implemented

`v_stock_proof` is the evidence view — one row per package with every field above.
Every money tile and every stock tile drills to it. If a new tile is added, it
must drill to per-item proof before it ships. **A tile without a drill-down is
not finished and must not be deployed.**

---

# THE HARD RULES — NUMBERED, FINAL, ENFORCEABLE

**This file is the SINGLE SOURCE OF TRUTH for rules. `HANDOFF.md` is the single
source of truth for state.** Consolidated 6 August 2026 at the owner's direction.
Every rule below was earned during the build. Do not weaken, reinterpret or
"improve" any of them without the owner's explicit approval.

## A · Data honesty

**A1. Never invent a number.** Not a price, not a benchmark, not a square
footage, not a utility bill, not a competitor comparison. If it is not measured
or supplied, it does not exist.

**A2. Every figure carries its provenance.** Who set it, when, and on what basis.
A number nobody set must say so on its face.

**A3. Absence is explained, never blank.** "No certificate" is unacceptable.
"No certificate because Metrc's package interface carries no analyte values and
the Lab Results report has not been imported" is acceptable. Every missing value
states WHY it is missing and WHAT would make it appear.

**A4. Check units before comparing anything.** Grams per plant against grams per
square foot produced a finding wrong by a factor of six.

**A5. Never assume business practice — ask.** Failed material bought at a
discount to remediate is a business model, not a loss. Ask; do not infer from data.

**A6. Verify against the live system before reporting.** Every expensive mistake
in this build was an unchecked assumption.

**A7. Correct yourself plainly.** State the correction, continue. No ruminating.

## B · Weights, units and conversions

**B1. Convert from the unit Metrc actually recorded.** Use `f_to_pounds()`. Never
assume grams. 18.2 lb once vanished because pounds were divided by 453.592.

**B2. Countable items have NO weight.** Vapes and edibles are units. A pound of
"each" is not a quantity of anything. `f_is_weight()` decides.

**B3. Wet and dry are never mixed.** Fresh frozen is packaged wet; dried flower
is not. Convert to dry-equivalent before adding or comparing.

**B4. Never subtract a dry weight from a wet weight.** It leaves evaporated water
in the total. This once overstated open harvests by 3,800 lb.

## C · Traceability and proof

**C0. ⛔ OWNERSHIP STOPS AT THE COA. NOTHING GETS POSTED WHILE A DISCREPANCY
STANDS.** *(Owner ruling, 7 August 2026. Binds every agent, inside this OS or
outside it, human or machine.)*

**Never answer "is this ours?" from `ItemFromFacilityLicenseNumber`.** That field
names whoever defined the **item**, not who owned the **material**, and it flips
to us on any repack under a new item name. **191 active packages / 420.6 lb read
as ours today and trace to outside licences.** Use **`f_material_origin(tag)`**,
which walks `SourcePackageLabels` to its roots and returns origin licences,
inbound manifests and source harvests.

**The order, every time:**
1. **Check ours** — the licence field and `f_material_origin(tag)`.
2. **Look for doubt** — a repack (`SourcePackageCount > 0`) · an inbound manifest
   anywhere in the lineage · source harvests absent from `metrc_harvests` ·
   harvest names off our convention `TG <strain> - <YYYYMMDD> <room>` · a tag
   series other than `1A40A030000E5B1` (MC281714) or `1A40A030000E5B2` (MP281909).
3. **On ANY doubt, OPEN THE COA. DO NOT PROCEED WITHOUT IT.** The certificate
   from the testing laboratory is the only **independent** source for who grew or
   made the material. An internal field cannot disconfirm another internal field
   — **a check that cannot fail proves nothing.**

**The COA calls it `Client Info`.** The name, address and `License:` under that
heading is the cultivator, manufacturer or processor. Cross-check `METRC Batch
ID` (the harvest) and `METRC Source ID` (the sampled package) as well.

**The documents are already on disk** — `metrc_documents.storage_path`
(`coa/<id>.pdf`, `manifest/<n>.pdf`) with a signed `download_url`. `curl` to
fetch, `pdftotext -layout` to read. **`coa_extract` cannot answer this**: 983
certificates parsed and not one records the client or licence. Open the PDF.

**Worked example.** Package `1A40A030000E5B2000009058`, 56.84 lb, was ruled
"ours, remediate in house" on 7 Aug 2026. `coa/2267739.pdf` (Green Analytics
report `GGDB-00016`) named the client **Greater Goods, LLC, License MB282344**.
Batch, source package and the Total Yeast and Mold failure all matched the
certificate exactly. **The only discrepancy in the document was ownership, and
it was ours.**

**C0b. 🔒 PROOF REQUIRED — "NEVER TESTED" IS A CLAIM, NOT AN EXCUSE.**
*(Owner hard rule, 8 August 2026. Binds every agent.)*
Any item reported as untested with **no COA and no manifest** must be shown in
**Metrc inventory, in a NAMED ROOM, with its seed-to-sale chain** — Massachusetts
law requires Metrc to hold the current room for every tagged package, so if it
cannot be shown there the claim fails and must not be reported.
**ALL FOUR SOURCES MUST AGREE**, three of them outside this platform: Metrc's own
`lab_testing_state` · **zero** rows in `metrc_lab_results` (the laboratories) ·
**zero** lines in `metrc_rpt_package_transfers` (the state custody export) ·
**zero** certificates filed **directly** against it. An **inherited** certificate
is expected on untested intermediate product made from tested material; a
**direct** one is a contradiction.
Use **`v_never_tested_proof`** — `where proof like 'FAILS%'` must return zero rows.
Registered as `nevertested.contradictions`, re-derived nightly.
*Measured 8 Aug 2026: 111 packages proven, 0 failures, 0 without a room.*
**The general form: a benign explanation is the one to evidence hardest, because
nobody challenges it.**

**C0a. PARSE FOR NEW DATA ON EVERY ACCESS.** *(Owner ruling, 7 August 2026.)*
Every agent, every session, before it reports anything: **check what has arrived
since it last looked and parse it.** Documents land in `metrc_documents` and sit
unread — 983 certificates were on disk with the cultivator on every one and the
field went unparsed until it was opened by hand. **A document downloaded and not
parsed is worse than one not downloaded: it looks like coverage.**
Run: `select count(*) from coa_extract where client_license is null` ·
`select count(*) from metrc_documents where storage_path is not null and
fetched_at > now() - interval '2 days'` · the sync-run and backlog counts.
**Say what you found, including "nothing new".**

**C1. Every tile, total and headline is a CLAIM and must open to the individual
items behind it.** No summarising, no sampling, no top-N. `v_stock_proof` is the
evidence view. **A tile without a drill-down is not finished and must not ship.**

**C2. Totals must reconcile to the items.** If a tile says 1,943.6 lb, the rows
behind it must add to 1,943.6 lb.

**C3. Every product, everywhere, shows: THC, terpenes, manufacturer, certificate,
manifest.** Missing ones state why. When data later arrives it must back-fill
every past record automatically.

**C3a. EVERY ITEM ROW IN EVERY DRILL-DOWN CARRIES ITS CERTIFICATE AND ITS
MANIFEST — sitewide, every time.** *Owner-set 7 August 2026, binding.* Not a
link to a document page. **The certificate and the manifest, openable from the
row itself**, wherever an item appears: stock, quality, sales, finance,
compliance, reports, search results, tiles, dashboards. **An item row without
both is not finished and must not ship** (C1).

**Where absent, the row states WHICH reason** (A3) — never a blank, never a
dash:
- *"Never submitted for testing"* — no certificate exists to link.
- *"Out for testing since {date}"* — result not returned yet.
- *"Certificate not yet fetched from Metrc"* — it exists; our copy is missing.
- *"No manifest — packaged here, never transferred."*

**The mechanism is already built and must be reused, not rebuilt:**
`f_package_documents(tag)` returns certificate and manifest with the document
id, a signed link, size, laboratory and test date. Documents live in the
**private** `metrc-documents` bucket with SHA-256 and byte size recorded;
signed links last 30 days and are refreshed daily by cron — because a raw
Metrc URL hits a sign-in wall and is not a working link.

**Coverage as at 7 Aug 2026 — the gap is documents, not plumbing:**
- **Manifests: 2,683 of 2,690 carry a file (99.7%).** Strong. Seven have a
  `fetch_error` and must say so.
- **Certificates: 969 of 2,858 tested packages (34%).** **1,889 tested packages
  have no certificate on file.** The document backfill has not finished
  walking the book. Until it does, most rows must show *"not yet fetched"* —
  which is honest, and is not the same as "no certificate exists".

**C4. Location always carries its dates** — entered, how long there, when it
left, where it went.

**C5. Testing always states the date out, the date back, and days at the
laboratory.** Use `f_test_status()`: **OUT FOR TESTING**, **NO TESTING PLANNED
YET**, **PASSED**, **FAILED** — sitewide, driven by Metrc state.

**C6. Ours versus third party splits on the face of the tile — for failed
material AND for revenue.** With the supplier named. No drill required.
*Extended 7 August 2026 at the owner's direction.*

**C6a. Third-party failed material is an INPUT, not a problem.** It is bought
at a discount deliberately, then either remediated and processed in-house, or
sold on to another licensee who remediates it — Twisted Growers acts as a
wholesaler for others too. **Never present it as a quality failure or a loss.**
The measure that matters for it is **remediation yield**: sellable product out
per pound bought in.

**C6b. Our own failed material needs a recorded DISPOSITION, and there are
three:** remediate in-house · sell on for remediation · destroy. Flag it until
a disposition is recorded (H1). **A failed test is not a loss — an undecided
package is.** Any finding that says "remediate or destroy" is incomplete and
steers people away from a legitimate revenue path.

**C6c. There are THREE revenue lines and they are never blended.** Extended
again 7 August 2026: Twisted Growers is a cultivator, a manufacturer **and a
wholesale distributor** — it takes on other licensees' product to sell.

| Line | What it is | Cost basis |
|---|---|---|
| **Own production** | Grown and packaged by us | The owner-set cost per pound ($1,100 for 2025) |
| **Remediation** | Failed material bought at a discount, fixed, sold | What was paid, plus remediation cost |
| **Distribution** | Other licensees' product taken on to sell | What was paid, or the commission split |

**Never blend them into one price per pound, and never measure any of them
against another's cost basis.** First split measured 7 Aug 2026: own production
**$950/lb** against bought-in **$289/lb**. Blending understated own production
and manufactured a false "selling below cost" conclusion.

**C6d. SERVICES are a fourth line, and on services WE DO NOT OWN THE
MATERIAL.** Added 7 August 2026: Twisted Growers also offers **white label**
manufacturing and **trim tolling**. On a tolling job the customer's material
arrives, is processed, and leaves — **ownership never transfers.**

- **Tolled and consigned material must NEVER count as our stock, our
  production, or our yield.** It is someone else's property in our custody.
- **The revenue is a FEE for a service, never a price per pound of product.**
  It must never appear in any $/lb figure.
- **The register already exists and is populated:** `third_party_material` —
  **16 rows, 65.7 lb of other companies' BHO and distillate in the Fulfillment
  Vault** (Hudson Botanicals, UC, Solar Therapeutics, Jushi), every row marked
  *"CONFIRMED 7/31 VT"* — physically counted. **Nothing reads it.** No view,
  no tile, no reconciliation against the Metrc mirror.
- **Inbound material has TWO independent dimensions. Do not collapse them.**
  *Corrected 7 Aug 2026 — Agent D first wrote a single five-value list here and
  the database check constraint correctly rejected it. The existing design was
  right.*

  **1 · CONDITION at purchase — `suppliers.bought_as`.** Fixed vocabulary,
  already constrained in the database: `sound material` · `failed for
  remediation` · `biomass for extraction` · `our own licence` (mis-tagged in
  Metrc — correct at source per D2) · `not yet set`. **Currently "not yet set"
  on 30 of 32 suppliers.**

  **2 · DESTINATION — decided LATER, changeable, and per lot, not per
  supplier.** The owner, 7 Aug: material bought as an input *"can be sold if
  too much for us to use, or stored to be used later."* So the same purchase
  may end up **consumed in manufacture · sold on as-is · held for later**, and
  which one it becomes is a business decision after arrival. **A supplier-level
  field cannot carry it.** It belongs on the lot or package, and it must be
  allowed to change with the reason recorded (H1).

  **3 · TOLLING AND CONSIGNMENT ARE NEITHER.** They are not purchases at all —
  nothing was bought and nothing is owned. They need their own flag, never a
  `bought_as` value.

- **⚠ Purchased inputs are modelled in the cost calculator but their real
  price is not recorded.** The vape rate is built from "base oil, terpenes,
  hardware, packaging, fill labour, packaging labour and compliance testing"
  — **but what was actually paid for that base oil exists nowhere**, because
  `material_purchases` is empty. Every manufactured cost per unit therefore
  rests on an **assumed** input price, not an actual one (A2).
- ⚠ **The custody register uses truncated Metrc tags** (e.g. `1479`, `4722`)
  rather than full 24-character tags, so it **cannot be reliably joined to
  `metrc_packages`.** Two truncated-tag collisions are already on record. Any
  reconciliation must resolve full tags first.

**⚠ Two of the three cannot be costed at all today.** `material_purchases` and
`third_party_purchases` are **both empty**, so what was paid for bought-in
material exists nowhere. **Margin on remediation and on distribution is
uncomputable until purchases are recorded** — and any figure claiming otherwise
is invented (A1). Nine suppliers already appear on stock: Canna Provisions,
Holyoke Wilds, Jushi MA, ACS, berkley botanicals, Gibby's Garden, LC Square,
Nature Medicines, Solar Therapeutics.

## D · Metrc

**D1. Metrc is the legal record. This platform is a READ-ONLY MIRROR.** It has
no write credentials. Recording something here does not change Metrc.

**D2. Never correct a Metrc problem only in this platform.** That hides it from
the state record. Corrections go in `metrc_corrections` with step-by-step
instructions and cannot be closed without who, when and a Metrc reference.

**D3. Metrc-facing tasks do not clear until fixed at source.**

## E · Database safety

**E1. NEVER `drop view … cascade`.** It destroyed `mv_department_dashboard`
three times and blanked every dashboard with no error. Use `create or replace`.
Columns may be appended at the end.

**E2. Re-query after every connector error and after every structural change.**
Errors lie in both directions.

**E3. Matviews read base tables, never other views** — so a view rebuild cannot
cascade into them.

**E4. Aggregate views: use `sum(packages)`, not `count(*)`.**

**E5. Functions that views depend on need `set search_path = public`.**

**E6. Never `grant … to anon`.** 36 views once leaked package tags, suppliers and
dollar figures to anyone holding the publishable key.

## F · Front-end safety

**F1. Anchor scripted edits on the function signature**, never on a common line
like `const [busy, setBusy]`. That put state in the wrong component three times
and caused three blank screens.

**F2. Never deploy what you have not looked at** as a signed-in user.

**F3. No text may overlap or be silently truncated.** Wrap; never clip. Never
`slice()` a value without saying so.

**F4. No abbreviations.** "Unit of measure", not "UOM".

**F5. Use the whole page.** No wasted space in critical workspace, no horizontal
scrollbars, no cut-off labels.

## G · Configuration

**G1. Nothing is hardcoded.** Every threshold, rate and licence is a database row
an authorised user can change. Config = rows, never code.

**G2. Licences come from `company_licenses` via `f_is_ours()`**, never literals.

**G3. Rates resolve through `f_rate_for()`** — batch override, then sub-type,
then stream, then fallback.

**G4. Thresholds resolve through `f_rule()`.**

## H · Issues and accountability

**H1. Issues never clear themselves.** An owner or executive records fix / leave
/ ignore / reset with a written reason. "Ignore" still shows — ignoring is a
decision, not a deletion.

**H2. Forensic records are immutable.** `watchdog_findings`, `issue_decisions`,
`cost_input_history`, `metrc_corrections` and `moisture_loss_entries` cannot be
deleted. Do not "clean them up".

**H3. If something is not recorded, tell the user why** — sitewide.

## I · Brand and voice

**I1. Neon green is the brand. Zero purple. No grey icons, no pastels.** Never
change the theme without approval.

**I2. Every category has a real dashboard** — KPIs, drill-downs, assignable
tasks — never a list of links.

**I3. Plain English beside the professional language.** Vinny is not an engineer.

**I4. Reports live in the Reports dropdown**, not as side-menu items.

## J · Data intake, and what happens when a guard cannot fix it

**Owner-set, 8 August 2026. Sitewide. Binding on every agent, every import, every page.**
Recorded in the owner's own words: *"no data what so ever can enter OS unless it is
totally balanced, accurate without discrepancies! Guards must flag and force fix."*

**J1. NOTHING ENTERS THE OS UNBALANCED — AND "NOTHING" MEANS NOTHING.** Owner,
8 August 2026: *"all data means all API, uploaded documents, synced spreadsheets all
must go through guard. nothing does not pass by it. all inventory employee everything."*

Data lands only if it is **balanced, accurate and free of discrepancies**. This is a
gate, not a warning. Data that does not reconcile is **held** — never written and
flagged afterwards, because flagging after the write is how a wrong number gets used
before anyone reads the flag.

**Every intake path, without exception:**

| Path | Examples here |
|---|---|
| **API sync** | Metrc packages, plants, harvests, transfers, lab results |
| **Report imports** | every Metrc Reports Control Panel export, `metrc_rpt_*` |
| **Uploaded documents** | certificates of analysis, manifests, PDFs, anything reaching `metrc_documents` |
| **Synced spreadsheets** | Sheet Sync, the Google Sheet via the bridge, pasted tables, CSV and XLSX uploads |
| **Accounting** | QuickBooks, any profit-and-loss upload |
| **Manual entry** | every form on every page, by any role |
| **Agent writes** | anything an agent inserts or updates, including its own findings |
| **Employee and HR data** | roster, timesheets, payroll, employee files |
| **Inventory** | counts, weights, adjustments, allocations, third-party custody |

**A new intake path that does not pass the guard is a defect in the path, not an
exception to this rule.** If a route into the database exists that the guard cannot
see, that route must be closed or brought under it. There is no "trusted source":
Metrc itself is the legal record and it still gets checked, because our *copy* of it
can be wrong even when Metrc is right.

**J2. THE GUARD FLAGS AND FORCES THE FIX.** A guard does not merely report. It holds
the data, names the discrepancy, and the material stays out until the discrepancy is
resolved. "Imported with warnings" is not a state this platform has.

**J3. IF AN AGENT CANNOT FIX IT, EVERY ADMIN IS TOLD.** Not one admin, not the
accountable party alone — **all of them**. An unresolvable guard issue is not allowed
to sit in a table waiting to be noticed. It is pushed.

**J4. THE ALERT MUST BE DETAILED, AND THE SHAPE IS FIXED.** Every alert carries, in
plain English (rule I3):

| | |
|---|---|
| **Who** | who is accountable, and who raised it |
| **What** | the discrepancy, with the arithmetic |
| **When** | when it started, when it was detected |
| **Where** | the table, page, import or package it sits in |
| **Why** | why it matters, in money or in compliance |
| **How** | how it was detected, so the finding can be re-derived |
| **Solutions** | the available options — **more than one where more than one exists** |
| **Recommendation** | **the guard's own final recommendation**, stated plainly |

A finding missing any of these is not finished and must not be sent. A single
`what_to_do` line is **not** a solutions list: rule C6b was born from advice that read
*"remediate or destroy"* and silently omitted a legitimate third option worth real money.

**J6. A GUARD IS THE FLOOR, NOT THE CEILING — EVERYTHING GETS DOUBLE-CHECKED OR
BETTER.** Owner, 8 August 2026: *"strains, coa, manifest, all reports, spreadsheet
everything must have double check system or greater agents check point system plus
guards."*

**Two layers, and both are required. A guard alone is not enough.**

1. **The guard** — mechanical, fast, at the gate. It knows the shapes that are always
   wrong and refuses them.
2. **At least two independent agent checkpoints** — each deriving the same fact a
   different way. **Disagreement is the finding**, never averaged and never silently
   resolved. This is what `verification_checks` already exists to hold.

**Why both.** A guard only catches what somebody thought of. On 8 August the SQL guard
passed all twenty of its own fixtures while `DROP TABLE watchdog_findings` walked
straight through — the tests were green and the evidence log was unprotected. A second,
differently-derived check is what catches the thing the first one was never taught to
see.

**Applies to, at minimum:** strains · certificates of analysis · manifests · every
report import · every spreadsheet and sheet sync · inventory counts and weights ·
employee and payroll data · anything an agent writes.

**"Or greater" is deliberate.** Two is the floor. Where the figure carries licence risk
or material money, add a third lens — and run the **Challenger** against the conclusion
before it leaves the building, which defaults to refuted and makes the claim earn
survival.

**J5. AGENTS DO NOT WRITE JOURNAL ENTRIES UNLESS A HUMAN SAYS SO.** A user may write
their own entry, or **ask** an agent to write one. **No agent may create, edit or close
a journal entry on its own initiative** — not to tidy up, not to record its own work,
not because it seems helpful. The journal is the human record of human decisions.
This sits beside H1: an issue never clears itself, and an agent never speaks for a
person.

---

## THE BRAIN — the knowledge index (added 7 August 2026, owner-requested)

`brain/INDEX.md` maps every piece of knowledge in this project and how it
connects. This file stays the single source of truth for **rules**;
`HANDOFF.md` for **state**; the brain indexes both and holds what they don't:
decisions, lessons, domain pages, ingested sources.

- **Session start:** after this file and `HANDOFF.md`, read `brain/INDEX.md`.
- **Session end:** write back — settled decisions to `brain/DECISIONS.md`,
  expensive mistakes to `brain/LESSONS.md`, business knowledge to
  `brain/domains/`, digested reading to `brain/sources/`. New project files
  get a line in the index map.

A session that learned something and didn't write it back has wasted the
owner's money twice.
