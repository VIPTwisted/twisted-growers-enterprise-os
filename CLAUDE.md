
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
| Operating plants per room | **1,150** |
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
| Moisture loss | 75–80% | Published drying guidance (AROYA, Preair) |
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
