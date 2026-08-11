# Forensic Inventory & Sales Audit

Twisted Growers LLC · MC281714 (Cultivation) · MP281909 (Manufacturing)
Prepared 11 August 2026 · Agent B

Live in the OS at **Reports → Inventory & Audit**, and on the **Command Center** and
**Cultivation** dashboards.

---

## 1 · The figure I was quoting was circular, and I have stopped quoting it

For several answers I closed 2024 with this:

```
11,236.9 wet − 712.6 waste − 8,515.1 water − 2,009.3 packaged = 0.0000
```

It closes because Metrc **defines** moisture loss as `wet − waste − packaged`. It is an
identity. It would close on fabricated numbers. It proves those four fields are
arithmetically consistent with one another and nothing else. It is not a
reconciliation and it never was.

Everything below is built the opposite way: **every line comes from a different
source, so the schedule is capable of failing to balance.** Where it fails, the
variance is stated rather than absorbed.

---

## 2 · The reconciliation

Five independent sources:

| Line | Source |
|---|---|
| Produced | packages made directly off a harvest, dated on the package's own `PackagedDate` |
| Purchased in | inbound manifests where the origin is **not** one of our licences |
| Sold / shipped | outbound manifests where the destination is **not** one of our licences |
| Waste | Metrc adjustment report, weight-denominated rows |
| On hand | the Metrc package mirror (live) or an Inventory Point in Time export (historic) |

**Internal MC ↔ MP transfers are excluded.** The same physical material moving
between our own two licences is not a purchase and not a sale; counting it as
either double-counts it. It is disclosed as a memo line — 12,080.2 lb to date.

### Since inception, to 11 Aug 2026

| | lb |
|---|---:|
| Produced from our own harvests | 13,713.5 |
| Purchased in from third parties | 3,370.6 |
| **Total in** | **17,084.1** |
| Sold / shipped out | −11,346.6 |
| Waste, destruction, corrections | −540.4 |
| **Expected on hand** | **5,197.1** |
| Actual on hand, counted | 2,548.4 |
| **Variance** | **−2,648.7 lb** |

The variance is **negative**, which is the direction manufacturing yield loss must
push it. 100 lb of flower into an extraction run does not come out as 100 lb, and
**Metrc never tags that loss** — it is derivable only as a residual. −2,648.7 lb
against 17,084.1 lb of throughput is **15.5%**.

### Year by year

| | FY2024 | FY2025 | FY2026 to date |
|---|---:|---:|---:|
| Opening | 550.6 | 2,317.8 | 749.6 |
| Produced | 2,494.4 | 5,179.8 | 5,488.7 |
| Purchased in | 669.5 | 641.5 | 2,059.6 |
| Sold / shipped | −856.8 | −7,389.0 | −3,100.8 |
| Waste | −539.9 | −0.4 | −0.1 |
| **Expected close** | **2,317.8** | **749.6** | **5,197.1** |
| Counted | 661.1 | 156.4 | 2,548.4 |
| **Variance** | −1,656.6 | −593.2 | −2,648.7 |
| *Memo: internal transfers* | 1,043.5 | 5,226.6 | 5,810.1 |

**2024 cannot be closed on a counted position.** The only Inventory Point in Time
export at that date covers **MC281714 only** — MP281909 has none — and holds 85
package tags, of which 60 carry a ledger weight. The Metrc point-in-time report has
**no weight column at all**: it records which tag was in which room, not how much was
in it. The 661.1 lb figure is therefore *reconstructed*, not counted, and the report
says so on the line itself.

---

## 3 · The 485.1 lb gap — resolved, and it is not timing

I previously reported a 485.1 lb difference for 2024 between primary packages created
(2,494.4 lb) and weight packaged off harvests finished in 2024 (2,009.3 lb), and said
timing probably explained it. **It does not.** The gap exists in every year and always
in the same direction:

| Year | Per harvest report | Per package created | Difference |
|---|---:|---:|---:|
| 2023 | *(not covered)* | 550.6 | — |
| 2024 | 2,009.3 | 2,494.4 | **+485.1** |
| 2025 | 4,895.1 | 5,179.8 | +284.7 |
| 2026 | 4,384.8 | 5,488.7 | +1,103.9 |

These are two different measurements of the same quantity:

- **Package-created** is an *event* with a real date — the tag was made, on that day.
- **Harvest report** `packaged_lb` is a per-harvest *field* dated on `finished_on`,
  which is when the harvest was **closed**, not when packages were made.

Dating production by harvest closure drove FY2025 to **−570.9 lb of expected
inventory** — a negative physical quantity, impossible — because material packaged in
December ships before its harvest is closed in January. The schedule therefore runs on
package-created, and carries the harvest-report figure as a memo line with the
difference stated. Neither number is hidden.

**This difference is still unexplained as to cause.** It is measured, disclosed, and
open.

---

## 4 · Where every pound is right now

Total on hand **2,548.4 lb** across 13 rooms, plus **15,595 live plants** in 5 rooms.

| Room | Role | Tags | lb | of which third-party |
|---|---|---:|---:|---:|
| Fulfillment Vault | Bulk flower and outbound | 174 | 790.5 | **85 tags** |
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

By stage:

| Stage | lb |
|---|---:|
| Dried bulk flower | 790.5 |
| Fresh frozen / biomass | 666.5 |
| Dried, awaiting trim | 574.3 |
| Finished goods, packaged | 206.0 |
| In manufacturing | 151.1 |
| Ready for packaging | 59.9 |
| Other storage / quarantine / transit | 100.1 |

**Live plants are counted, never weighed**, and are held in a separate column from
pounds. A wet pound and a cured pound are not the same pound and the report will not
let them be summed.

Every room holding stock is registered in `room_roles`. There are no unmapped rooms
holding inventory.

---

## 5 · Third-party material

**847.2 lb on hand was not grown or processed by us**, including 85 of the 174 tags in
the Fulfillment Vault. Every row in every forensic view carries `is_ours` and
`grown_or_processed_by`, so our material and purchased material can never be conflated.

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
| *…and 8 more* | | 260.9 |

---

## 6 · Sales and manifests

**Metrc owns the tag, the manifest and the weight. Apex owns the invoice and the
money.** They are joined for reporting and never merged into a single source.

Of 16,086 outbound lines, **7,757 match an Apex invoice** and **4,823 external lines
carry none** (1,171.2 lb in the current year alone). Every one is listed in
*Sold and Shipped, by Tag* with `invoice_match = NO APEX INVOICE`. These are
exceptions to investigate, not accepted losses.

---

## 7 · Defects found and corrected in this audit

1. **Transfer rows have a direction, and I was treating every one as an outflow.**
   `metrc_rpt_package_transfers` holds *both* legs. The `licence` column is the
   *reporting* licence, not the origin — direction lives only in
   `source_row->>'Origin Lic.'` / `'Dest. Lic.'`. Proof: tag `…6048` read CREATED
   +77.2 lb, SHIPPED −77.2 lb, and still had 77.2 lb on the shelf. Tag `…5085` was
   "shipped" 29.3 lb having only ever been created with 15.0.

2. **Weight was derived from our own item catalogue**, so it resolved only for *our*
   items and returned NULL for every third-party inbound line — which is why
   purchases first appeared as 0.0 lb. The export already carries `Weight Ship'd` /
   `Weight Rcv'd` **already in pounds**; it covers 17,668 rows against 16,086 and
   agrees with the derived value on 99.1% of overlaps.

3. **Internal transfers were excluded from the package ledger** on the reasoning that
   they "net to zero company-wide". True of the company total, false of every
   package: the source tag is consumed and a new tag is created at the destination.
   That single error accounted for 10,190.6 lb.

4. **A fan-out join double-counted production.** Unnesting `SourceHarvestNames`
   counted a package born of two harvests twice, inflating 2024 primary production to
   3,662.7 lb against the correct 2,494.4 lb.

5. **The package mirror is not the full history.** It holds 4,343 tags; the transfer
   report references 15,496. **14,125 tags carrying 13,524.4 lb are absent from it.**
   Any balance keyed on the mirror structurally cannot see most shipments — which is
   why the company-level reconciliation is built on transfer rows instead. Verified
   on normalised (trimmed, uppercased) tags, so this is not a formatting artifact.

6. **A second identity nearly shipped.** My first roll-forward reported
   "manufacturing process loss 0.0 lb". It was 0.0 by construction: I had defined
   consumption as the child package's created weight, so mass in equalled mass out by
   definition. Removed. **Process loss is not measurable from Metrc data** — only
   inferable from the reconciliation residual.

---

## 8 · Still open

| Item | Status |
|---|---|
| −2,648.7 lb cumulative variance | Consistent with process loss but **not proven** to be it |
| The two production bases differ by 2,424 lb | Measured and disclosed; cause unknown |
| 4,823 outbound lines with no Apex invoice | Listed; not investigated |
| 31 Dec 2024 close | Not possible on counted weight — no MP281909 snapshot, and the point-in-time report carries no weights |
| 31 Dec 2025 snapshot | Generated at `scratchpad/pit2025_*.sql`, **never imported** |
| Package event ledger | Reproduces 87.5% of open tags within 2 lb; **must not be used to state a historic position** until better |
| Adjustments 2025–26 | 0.4 lb and 0.1 lb of weight-denominated waste. Implausibly low — likely recorded in units, not weight. Unverified. |

---

## 9 · Where this lives in the OS

**Reports → Inventory & Audit**

| Report | View | Filters |
|---|---|---|
| Inventory Reconciliation (annual close) | `v_rpt_inventory_reconciliation` | year, section, line |
| Forensic Inventory Position | `v_forensic_inventory` | stage, room, room role, licence, category, product line, strain, ours vs third-party, grower |
| Sold and Shipped, by Tag | `v_forensic_sold_by_tag` | buyer, buyer licence, product line, strain, category, invoice match, internal vs external |
| Room Census (all forms) | `v_forensic_room_census` | stage, room, role, licence, strain, ownership |

Every one carries the standard toolbar: full-text search, date range, column filters,
group-by with subtotals, column chooser, saved views, and row-level drill.

Any date range: `select * from f_inventory_reconciliation('2024-01-01','2024-12-31')`.

**Command Center** — inventory variance · sold YTD · shipped with no Apex invoice ·
third-party material on hand.
**Cultivation** — plants growing · produced YTD · dried awaiting trim · dried bulk on
hand.

---

## 10 · Rules this audit established

- **When a total looks short, test the JOIN before blaming the SOURCE.** An inner join
  to incomplete headers previously produced three separate false findings.
- **A schedule that cannot fail proves nothing.** If every line derives from the same
  field, it is an identity, not a reconciliation.
- **Direction is not the reporting licence.** Read `Origin Lic.` / `Dest. Lic.`.
- **Company-level netting reasoning does not belong in a per-package ledger.**
- **Never plug a residual to make a total close.** A finished package's residual is
  the finding, not an error to be tuned away.
