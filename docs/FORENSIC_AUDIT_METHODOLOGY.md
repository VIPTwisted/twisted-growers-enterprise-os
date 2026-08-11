# Forensic Inventory Audit — Methodology and Review Pack

Twisted Growers LLC · MC281714 (Cultivation) · MP281909 (Manufacturing)
Agent B · 11 August 2026 · Supabase `fxetuqjryttnypgepsru` · migrations 0046–0066

**This document exists to be attacked.** Every figure below carries the SQL that
produced it. A reviewer should be able to reproduce or refute each one without
asking me anything. Where I do not know something, it says so — those are the places
to look first.

---

## 0 · How to review this in one hour

Run these six in order. If any disagrees, stop and report it — everything downstream
depends on them.

```sql
-- 1. Do the reports tie to their independent sources? All six pairs must match.
select 'on hand lb' m,
 (select round(sum(pounds),1) from v_forensic_inventory where stage_group<>'SOLD' and unit_type='PACKAGE') a,
 (select round(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
   coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))::numeric,1) from metrc_packages
  where not coalesce((raw->>'IsFinished')::boolean,false)
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))) b
union all select 'on hand units',
 (select round(sum(units)) from v_forensic_inventory where stage_group<>'SOLD' and unit_type='PACKAGE'),
 (select round(sum(coalesce((raw->>'Quantity')::numeric,0))) from metrc_packages
  where not coalesce((raw->>'IsFinished')::boolean,false)
    and not f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))
    and coalesce((raw->>'Quantity')::numeric,0) > 0)
union all select 'plants',
 (select round(sum(plant_count)) from v_forensic_inventory where unit_type='PLANT'),
 (select count(*) from metrc_plants)
union all select 'sold lb',
 (select round(sum(pounds),1) from v_forensic_inventory where stage_group='SOLD'),
 (select round(sum(pounds)::numeric,1) from v_transfer_line where direction='OUTBOUND' and voided<>'True')
union all select 'produced lb',
 (select round(sum(lb_delta)::numeric,1) from v_package_event_class where event_class='PRODUCED_FROM_HARVEST'),
 (select round(sum(f_to_pounds(coalesce((raw->>'CreatedQuantity')::numeric,0),
   coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))::numeric,1) from metrc_packages
  where nullif(raw->>'SourceHarvestNames','') is not null
    and nullif(raw->>'SourcePackageLabels','') is null
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
union all select 'room census lb',
 (select round(sum(packaged_lb),1) from v_forensic_room_census),
 (select round(sum(pounds),1) from v_forensic_onhand_by_location);
```

Expected: `2548.4 / 23950 / 15595 / 11346.6 / 13713.5 / 2548.4`, each pair equal.

```sql
-- 2. The reconciliation, all years
select * from v_rpt_inventory_reconciliation order by financial_year, line_no;

-- 3. Any single year or arbitrary range
select * from f_inventory_reconciliation('2024-01-01','2024-12-31');

-- 4. Where every pound physically is, right now
select room, room_role, sum(pounds) lb, sum(units) units
from v_forensic_inventory where stage_group<>'SOLD' group by 1,2 order by 3 desc;

-- 5. Everything that left, by tag, with buyer and manifest
select * from v_forensic_sold_by_tag order by shipped_on desc limit 50;

-- 6. Shipments with no invoice behind them — the biggest open exception
select count(*), round(sum(pounds)::numeric,1) from v_forensic_sold_by_tag
where invoice_match='NO APEX INVOICE' and not internal_transfer;
```

---

## 1 · The rule this audit is built on

**A schedule that cannot fail proves nothing.**

The figure previously used to close 2024 was:

```
11,236.9 wet − 712.6 waste − 8,515.1 water − 2,009.3 packaged = 0.0000
```

Metrc *defines* moisture loss as `wet − waste − packaged`. That equation is an
identity. It closes on fabricated numbers. It proves those four fields are
arithmetically consistent with one another and nothing more. It was presented as
proof that 2024 balanced. It was not.

Everything here is built so it **can** disagree: each line comes from a different
source, and the variance is reported rather than absorbed.

**Reviewer test:** for any balance in this pack, ask *which line could come out
wrong?* If none can, it is an identity and I have failed.

---

## 2 · Source of truth, by question

| Question | Source | Never use |
|---|---|---|
| What tag, which manifest, what weight moved | Metrc `metrc_rpt_package_transfers` | Apex |
| What was sold, to whom, for how much | Apex `shipping-orders` | Metrc |
| What is on hand now | Metrc `metrc_packages` (open only) | Apex |
| What was in which room on a past date | Metrc `metrc_rpt_point_in_time` | anything else |
| Lab and potency | the COA | Metrc lab fields |

Apex is the record of truth for sales and accounting. Metrc is seed-to-sale
compliance and holds the manifest, not the invoice. The two are **joined for
reporting and never merged into one source**.

---

## 3 · The reconciliation — five independent sources

`f_inventory_reconciliation(from, to)`, surfaced as
`v_rpt_inventory_reconciliation`.

| Line | Source | Why this one |
|---|---|---|
| Opening | accumulated from inception on the same five sources | so years are additive |
| Produced | `metrc_packages` where `SourceHarvestNames` is set and `SourcePackageLabels` is not, dated on `PackagedDate` | an EVENT with a real date |
| Purchased in | `v_transfer_line` INBOUND | origin is not one of our licences |
| Sold / shipped | `v_transfer_line` OUTBOUND | destination is not one of our licences |
| Waste | `metrc_rpt_adjustments`, weight rows | Metrc's own signed figure |
| On hand | `metrc_packages` open (live) or a point-in-time snapshot (historic) | counted, not derived |

**Internal MC↔MP legs are excluded** and disclosed as a memo (12,080.2 lb to date).
The same physical material moving between our own licences is neither a purchase nor
a sale; counting it as either double-counts it.

### Result, since inception → 11 Aug 2026

| | lb |
|---|---:|
| Produced from our own harvests | 13,713.5 |
| Purchased in from third parties | 3,370.6 |
| **Total in** | **17,084.1** |
| Sold / shipped out | −11,346.6 |
| Waste, destruction, corrections | −540.4 |
| **Expected on hand** | **5,197.1** |
| Actual on hand, counted | 2,548.4 |
| **VARIANCE** | **−2,648.7 lb (15.5% of throughput)** |

### By year

| | FY2024 | FY2025 | FY2026 TD |
|---|---:|---:|---:|
| Opening | 550.6 | 2,317.8 | 749.6 |
| Produced | 2,494.4 | 5,179.8 | 5,488.7 |
| Purchased | 669.5 | 641.5 | 2,059.6 |
| Sold | −856.8 | −7,389.0 | −3,100.8 |
| Waste | −539.9 | −0.4 | −0.1 |
| **Expected** | **2,317.8** | **749.6** | **5,197.1** |
| Counted | 661.1 | 156.4 | 2,548.4 |
| **Variance** | −1,656.6 | −593.2 | −2,648.7 |
| *Memo: internal* | 1,043.5 | 5,226.6 | 5,810.1 |

---

## 4 · What the −2,648.7 lb is, and what I cannot prove

**Where it must come from.** Flower enters as weight, is converted into concentrate
or pre-rolls or vapes, and the mass lost in that conversion has **no Metrc event**.
Metrc records the child package's weight. It never records how much of the parent was
drawn down. So conversion loss can only ever appear as a residual.

**What I cannot do:** state an extraction yield percentage. I earlier quoted "9.8%
yield to concentrate". **That figure was wrong and is withdrawn.** It came from a
join that counted a parent package once per child:

| Conversion | Parent lb (fanned) | Parent lb (distinct) | Overcount |
|---|---:|---:|---:|
| → Concentrate | 11,980.2 | 7,741.9 | 4,238.3 |
| → Buds | 18,157.7 | 12,611.7 | 5,545.9 |
| → Shake/Trim | 5,055.8 | 3,226.5 | 1,829.3 |
| → Infused edible | 180.4 | 24.2 | 156.3 |

Even the distinct column is not true input, because a parent is not necessarily
*fully* consumed by any one child. **Yield is not measurable from Metrc data.**

**Therefore:** −2,648.7 lb is *consistent with* processing loss and is *not proven*
to be processing loss. It is the audit's largest open item.

**How a reviewer could settle it:** production batch records for MP281909, or any
internal run sheet recording input weight against output weight. Neither is in the
OS. Metrc's Production Batches report for MP281909 was requested and has not been
supplied.

---

## 5 · The two production measurements

Production has two defensible sources that disagree by 2,424 lb:

| Year | Harvest report `packaged_lb` | Packages created off a harvest | Difference |
|---|---:|---:|---:|
| 2023 | *(not covered)* | 550.6 | — |
| 2024 | 2,009.3 | 2,494.4 | **+485.1** |
| 2025 | 4,895.1 | 5,179.8 | +284.7 |
| 2026 | 4,384.8 | 5,488.7 | +1,103.9 |

- **Package-created** is an event dated on the day the tag was made.
- **Harvest report** is a per-harvest field dated on `finished_on` — when the harvest
  was **closed**, not when packages were made.

Dating production by harvest closure produced **FY2025 expected inventory of −570.9
lb**, a negative physical quantity. The schedule therefore uses package-created and
carries the harvest-report figure as memo line 11 with the difference on line 12.

**This was previously reported to the owner as a 485.1 lb gap probably explained by
December/January timing. That was wrong** — the gap is positive in every year and
does not behave like a timing effect. **Cause remains unknown.** This is the second
largest open item.

```sql
-- reproduce
select extract(year from finished_on)::int yr, round(sum(packaged_lb)::numeric,1)
from metrc_rpt_harvest_moisture group by 1 order by 1;
select extract(year from (raw->>'PackagedDate')::date)::int yr,
       round(sum(f_to_pounds(coalesce((raw->>'CreatedQuantity')::numeric,0),
         coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))::numeric,1)
from metrc_packages
where nullif(raw->>'SourceHarvestNames','') is not null
  and nullif(raw->>'SourcePackageLabels','') is null
  and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))
group by 1 order by 1;
```

---

## 6 · Pounds and units are different measures

**23,950 units** of finished goods are on hand and have **no defensible pound
equivalent**: `Item.UnitWeight` is NULL on all 223 of those packages.

| Category | Packages | Units |
|---|---:|---:|
| Infused (edible) | 127 | 17,019 |
| Vape Product | 72 | 4,531 |
| Seeds | 24 | 2,400 |

They are carried in a separate `units` column and are **never summed with pounds**.
Likewise plants are counted, drying material is WET weight, and packages are current
weight — four measures, four columns.

Unit-denominated items also ship at **0.0 lb**, which is correct: a vape cartridge is
sold by the each and its cannabis mass was consumed upstream as concentrate. I
initially reported this as a finding; it is not one.

---

## 7 · Where every pound is now — 2,548.4 lb, 13 rooms

| Room | Role | Tags | lb | 3rd-party tags |
|---|---|---:|---:|---:|
| Fulfillment Vault | Bulk flower and outbound | 174 | 790.5 | **85** |
| Freezer/Biomass Storage | Fresh frozen and biomass | 28 | 666.5 | 4 |
| Pre-Trim Storage | Dried, awaiting trim | 36 | 384.1 | 17 |
| Finish Vault | Finished goods | 319 | 206.0 | 0 |
| Pre Trim Storage Room | Dried, awaiting trim | 29 | 190.3 | 9 |
| Hydrocarbon | Extraction | 82 | 115.0 | 0 |
| Packaging Room | Staged for packaging | 15 | 59.9 | 0 |
| BDA/Storage Room | Storage | 5 | 50.3 | 0 |
| Quarantine | Quarantine hold | 2 | 49.7 | 0 |
| Solventless | Extraction | 23 | 26.5 | 0 |
| Biomass Prep | Biomass preparation | 4 | 8.2 | 0 |
| Production Room | Production / infusion | 3 | 1.3 | 3 |
| Shipping & Receiving | In transit | 2 | 0.1 | 0 |

By category (ties to 2,548.4):

| Category | Tags | lb | Strains |
|---|---:|---:|---:|
| Buds | 256 | 906.2 | 55 |
| Fresh Frozen Flower | 11 | 603.9 | 9 |
| Shake/Trim (by strain) | 48 | 565.2 | 25 |
| Concentrate (Bulk) | 172 | 238.5 | 124 |
| Raw Pre-Rolls | 147 | 191.9 | 12 |
| Shake/Trim | 8 | 37.1 | 5 |
| Concentrate | 76 | 4.4 | 1 |
| Infused Pre-Rolls | 4 | 1.2 | 1 |

Plus **15,595 live plants** across 5 rooms (Flower #1–4, Mother Room).

Every room holding stock is registered in `room_roles`; there are no unmapped rooms
holding inventory.

---

## 8 · Third party — 847.2 lb on hand

Every forensic row carries `is_ours` and `grown_or_processed_by`. Our material and
purchased material can never be conflated. **85 of the 174 tags in the Fulfillment
Vault are third-party.**

Purchased in, by supplier, since inception:

| Supplier | Manifests | lb |
|---|---:|---:|
| Flower Power Growers, Inc. | 6 | 689.5 |
| Holyoke Wilds, LLC | 3 | 568.7 |
| Eagle Eyes Transport Solutions, LLC | 17 | 372.5 |
| Greater Goods, LLC | 7 | 310.8 |
| LC Square, LLC. | 3 | 250.0 |
| Gibby's Garden LLC | 3 | 241.6 |
| Jushi MA, Inc. | 4 | 224.6 |
| JAMACO, LLC | 5 | 212.2 |
| Canna Provisions Inc | 2 | 123.9 |
| Solar Therapeutics Inc | 5 | 115.9 |
| *8 more* | | 260.9 |

---

## 9 · Sales, and the invoice gap

Of **16,086** outbound lines, **7,757 match an Apex invoice** and **4,823 external
lines carry none** — 1,171.2 lb in the current year alone.

The match is: manifest number first, then buyer licence + order date within ±7 days.
That fallback is a **heuristic and can mismatch**; reviewers should test it.

```sql
select invoice_match, count(*), round(sum(pounds)::numeric,1)
from v_forensic_sold_by_tag where not internal_transfer group by 1;
```

Whether the unmatched lines are genuinely uninvoiced or simply unmatchable by this
rule is **not established**. Third largest open item.

---

## 10 · Defects found and corrected — all were mine

| # | Defect | Effect | Fixed in |
|---|---|---|---|
| 1 | Treated every transfer row as an outflow. The report holds **both legs**; `licence` is the *reporting* licence, not origin. Direction is only in `source_row->>'Origin Lic.'`/`'Dest. Lic.'` | Tag `…6048` read CREATED +77.2, SHIPPED −77.2, with 77.2 lb still on the shelf. Tag `…5085` "shipped" 29.3 lb having only ever held 15.0 | 0047 |
| 2 | Weight derived by matching **our own** item catalogue for a UoM | Every third-party inbound line returned NULL — 3,370.6 lb of purchases read as **zero**. Metrc's `Weight Ship'd` is already in pounds, covers 17,668 rows vs 16,086, agrees on 99.1% | 0051 |
| 3 | Excluded internal legs from the package ledger as "net zero company-wide" | True of the total, false of every package: the source tag is consumed and a new tag created. Worth **10,190.6 lb** | 0046 |
| 4 | Fan-out join on `SourceHarvestNames` | 2024 production inflated to 3,662.7 lb vs correct **2,494.4** | — |
| 5 | Read item fields at the top level of `raw` | `ProductName`/`ProductCategoryName` **do not exist**; they are under `raw->'Item'`. Category, strain and product_line were empty on **every row of every report** | 0065/0066 |
| 6 | Roll-forward reported "process loss 0.0 lb" | A **second identity** — consumption was defined as the child's created weight, so mass in equalled mass out by construction | 0058 |
| 7 | Each year computed with no opening balance | FY2025 showed **−570.9 lb** expected inventory | 0057 |
| 8 | Audit tiles computed live off the event ledger | Dashboard read and `tg_snapshot_dashboards` both hit the statement timeout; **dashboards were broken** between 0060 and 0064 | 0064 |
| 9 | Invoice match re-exploded 1,739 nested Apex orders per transfer row | Timeout | 0062 |
| 10 | Withdrew a 9.8% extraction yield | Same fan-out class as #4 | this doc |

**`metrc_packages` is the ACTIVE package list, not the full history.** It holds 4,343
tags; the transfer report references 15,496. **14,125 tags carrying 13,524.4 lb are
absent from it.** Any balance keyed on the mirror structurally cannot see most
shipments — verified on trimmed and uppercased tags, so it is not a formatting
artifact. This is why the company-level reconciliation is built on transfer rows.

---

## 11 · The package event ledger — built, validated, NOT used for reporting

`v_package_events` reconstructs each package's weight from CREATED, SHIPPED,
RECEIVED, ADJUSTED and CONSUMED INTO CHILD.

Validation, on **open packages only** (a finished package reads Quantity = 0 with a
FinishedDate, so testing against it would be circular):

| | |
|---|---:|
| Open tags | 727 |
| Exact | 49.2% |
| Within 0.5 lb | 78.5% |
| Within 2 lb | 87.5% |
| Net variance | +686.0 lb |

**87.5% is not good enough to state a historic position, and the ledger is not used
for one.** It is used only to weigh snapshot tags for a past date, where the report
labels the result "RECONSTRUCTED".

Known limitation: multi-parent children are split **pro-rata**, which is an
assumption, not a measurement — Metrc does not record the split. 77.2% of converted
weight is single-parent and therefore exact.

---

## 12 · Why 2024 cannot be closed on a counted position

- The Metrc **Inventory Point in Time report has no weight column** — it records
  which tag was in which room, never how much.
- The only snapshot at that date covers **MC281714 alone**. MP281909 has none.
- It holds 85 package tags, of which **60 carry a ledger weight**.

So the 661.1 lb 2024 close is *reconstructed*, not counted, and line 8 of the report
says so on its own face. **2024 should not be signed off as closed.**

The 31 Dec 2025 snapshot was generated at `scratchpad/pit2025_*.sql` (3,364 rows) and
**has never been imported**.

---

## 13 · Open items, ranked

| # | Item | Size | Status |
|---|---|---|---|
| 1 | Cumulative variance | −2,648.7 lb | Consistent with processing loss; **not proven**. Needs MP281909 production batch records |
| 2 | Two production bases disagree | 2,424 lb | Measured, disclosed, **cause unknown** |
| 3 | Outbound lines with no Apex invoice | 4,823 lines | Listed, **not investigated**; match rule is a heuristic |
| 4 | 2024 close | — | **Not possible** on counted weight |
| 5 | 31 Dec 2025 snapshot | 3,364 rows | Generated, **never imported** |
| 6 | 2025–26 waste reads 0.4 lb / 0.1 lb | — | Implausibly low; likely recorded in units. **Unverified** |
| 7 | Package event ledger | 87.5% within 2 lb | Not fit to state a historic position |
| 8 | Extraction yield | — | **Not measurable** from Metrc |

---

## 14 · Object inventory

**Views** — `v_transfer_line`, `v_package_events`, `v_package_event_class`,
`v_forensic_inventory`, `v_forensic_room_census`, `v_forensic_onhand_by_location`,
`v_forensic_sold_by_tag`, `v_forensic_sales`, `v_rpt_inventory_reconciliation`,
`v_dept_dash_audit_tiles`, `v_ledger_validation`

**Materialised** — `mv_forensic_sales`, `mv_dept_dash_audit_tiles`,
`mv_department_dashboard_base`

**Functions** — `f_inventory_reconciliation(from,to)`,
`f_inventory_rollforward(from,to,licence,ours_only)`, `tg_snapshot_dashboards()`

**Note on `mv_department_dashboard`:** it is now a **view** over
`mv_department_dashboard_base` (the original 400-line matview, *renamed, never
retyped*) unioned with the audit tiles. `tg_snapshot_dashboards` refreshes the base,
because `REFRESH MATERIALIZED VIEW` cannot target a view.

**Reports** (Reports → Inventory & Audit): Inventory Reconciliation (annual close) ·
Forensic Inventory Position · Sold and Shipped, by Tag · Room Census (all forms).
Each has search, date range, column filters, group-by with subtotals, column chooser,
saved views and row drill.

**Dashboard tiles** — Command: variance · sold YTD · shipped with no Apex invoice ·
third-party on hand. Cultivation: plants growing · produced YTD · dried awaiting trim
· dried bulk on hand.

---

## 15 · What I want the reviewers to attack

1. **Is −2,648.7 lb processing loss, or is something missing?** I cannot prove it
   either way. Find production batch records, or prove the outbound figure is
   overstated.
2. **Why do the two production measurements differ by 2,424 lb**, positively, every
   year?
3. **Test the invoice match rule.** Buyer licence + date within ±7 days is a
   heuristic. How many of the 4,823 unmatched lines are real?
4. **Check the internal-transfer exclusion.** If any INTERNAL leg is misclassified,
   both sides of the balance move.
5. **Is 2025–26 waste really 0.5 lb combined?** Almost certainly a units/weight
   issue and therefore a hole in the OUT side.
6. **Re-derive on-hand from the transfer report alone** and compare to 2,548.4 lb.
   I have not done this and it is the strongest available independent check.

Do not take any figure here on trust. Every one has SQL attached for that reason.

---

## 16 · The production calculator, built into the OS (11 Aug 2026)

Seeded from the owner's own `docs/source-of-truth/Manufacturing_Production_Worksheet.xlsx`.
Every row in `production_yield_standard` names the source cell so a reviewer can open
the workbook and check it.

> The **BOM & Yield** tab of the Enterprise Operations Planner is a *different, empty
> template* — every Qty per Finished Unit and Expected Yield reads 0.0. It cannot
> compute anything and is not the source used here.

| Standard | Value | Cell |
|---|---:|---|
| Hydrocarbon batch | 15 lb (6,810 g) | Summary A5 |
| Crude oil yield | 12% | Summary B13 |
| Yield to diamonds from oil | 35% | Summary B16 |
| Liquid diamond conversion | 0.877 (12.3% decarb loss) | Summary B20 |
| Fresh frozen batch | 60 lb | Summary L5 |
| Bubble hash yield | 3.2% (low 2.8%, target 3.5%) | Summary M19 |
| Yield to rosin from bubble | 81% | Summary M23 |
| Fresh frozen : dry | 0.20 → **5:1** | Summary M11 |
| Average trim yield | 32.23% | Summary M9 |
| Flower / trim price basis | $1,200 / $300 per lb | Summary Q6, C6 |

**Conflict to resolve:** `conversion_factors.fresh_frozen_wet_to_dry` holds **4.5**
from industry guidance; the owner's own worksheet implies **5.0**. The worksheet
should win. Not yet changed — flagged for the owner.

### Tier is carried by BRAND, never by the product name

A search of all 6,036 pre-roll, 1,127 cartridge and 2,129 extract lines found neither
"premium" nor "economy" in any product name. `product_brand_tier`:

| Brand | Tier | Material |
|---|---|---|
| Twisted Buds | PREMIUM | Our own buds — pure flower |
| Twisted | ECONOMY | May include third-party flower and trim mix |
| Dope Chemist | OTHER | Concentrates — rosin, badder, liquid diamonds |
| No Bull | OTHER | Vapes |
| North End Blunts | OTHER | **Tier not stated — must not be guessed** |

### Owner rulings recorded (`conversion_factors`)

1. **No double-dipping.** Fresh frozen and trim consumed into concentrate are the cost
   of materials; the concentrate is that same material transformed. Never count both.
   **Concentrate material only** — flower to pre-roll is ~1:1.
2. **Pre-rolls draw finished dried flower.**
3. **Premium draws our own buds; economy may draw third-party flower and trim.**
4. **Bulk flower is sold both our own and third-party** — always split by origin.
5. **Twisted Buds "Prepack" is our own packaged 3.5 g flower ("A Buds")** — confirmed
   by the owner; all 2,947 lines are product type "A Bud".
6. **Premium pre-rolls take NO formulation** — pure flower at 1 g.

### Formulation is effective-dated, not a constant

Owner: *"THE FORMULA CAN CHANGE FROM TIME TO TIME DEPENDING ON INVENTORY … WE HAVE TO
ALLOW US TO UPDATE THIS REGULARLY."* `preroll_formulation` carries brand,
`effective_from`, `effective_to`, flower/trim split, and who set it, with a
`daterange` exclusion constraint making two conflicting rows impossible. The material
calculation picks the split **in force on the order date**, so editing it going
forward never restates a past period. Currently: Twisted 50/50 from 2024-01-01.

### Material drawn by what we sold

| Brand / tier | Units | Flower lb | Trim lb | Oil lb |
|---|---:|---:|---:|---:|
| Twisted Buds — Prepack 3.5 g A Bud | 159,519 | 1,230.6 | — | — |
| Twisted — economy pre-roll (50/50) | 1,080,361 | 1,186.6 | 1,186.6 | — |
| Twisted Buds — pure flower 1 g pre-roll | 36,996 | 81.6 | — | — |
| Dope Chemist — extract | 40,688 | — | — | 95.6 |
| No Bull — vape | 23,643 | — | — | 40.5 |
| Dope Chemist — cartridge | 14,300 | — | — | 31.5 |

**Total: 2,498.8 lb flower · 1,186.6 lb trim · 167.6 lb finished oil.**

Concentrate shows the **finished oil weight only**. Its input material is deliberately
NOT added — that is the double-dip the owner ruled out.

**Independent cross-check:** Metrc, which knows nothing of Apex, reports 2,096.3 lb of
Raw Pre-Rolls shipped plus 191.9 lb on hand = 2,288.2 lb, against 2,455 lb of pre-roll
material computed from Apex. About 7% apart.

### A warning the reviewers must enforce

The owner has proposed adjusting the 50/50 ÷ 30/70 split once the discrepancy is
known. **If the formulation is tuned until the variance closes, the variance stops
being evidence** — it becomes the moisture identity again, better disguised. The split
must be set from what was actually run. What is legitimate is to compute *which split
the data implies* and report it beside the one actually used; where they disagree,
that gap is the finding.

### Defect found in this section's own work

Pack size never parsed: Postgres reads `\b` as **backspace**, not a word boundary
(that is `\y`). Every Prepack row silently fell through to a hardcoded 3.5 default.
The answer was right — all 2,947 lines really are 3.5 g — but right by luck. Fixed in
0070; anything that now fails to parse is labelled, never defaulted.

### Still open here

- **North End Blunts** (18,240 pre-roll units, $5.72/unit) — tier and material not stated.
- **Bulk Extract** (7,825 units) — no material model.
- `fresh_frozen_wet_to_dry` 4.5 vs the worksheet's 5.0.
