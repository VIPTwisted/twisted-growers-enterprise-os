# Sitewide data integrity — forensic pass, 6 August 2026

Triggered by the owner: *"ensure our OS data sitewide is correct"* and
*"separate manufacturing and cultivation but then also capture them collectively
always."* Every figure below was measured, not assumed.

---

## 1. Reference tables were empty — FIXED

`metrc_items`, `metrc_strains`, `metrc_locations` held **zero rows** while
Metrc's own Facility Metrics reported 1,177 / 209 / 38. The sync logged
`status: ok, records: 0` every run, so nothing ever flagged it.

**Root cause, proven by probe:** these endpoints return `TotalRecords: 0` unless
called with an explicit `lastModifiedStart` / `lastModifiedEnd` window — the same
defect that hid 227 harvests and 1,104 manifests. A second trap: `pageSize` is
capped at **20** on these endpoints; anything larger returns
`HTTP 400 pageSize must be a positive number between 1 and 20`.

New Edge Function **`metrc-catalog-sync`** (75 Metrc calls, one-time backfill):

| Dataset | Cultivation MC281714 | Manufacturing MP281909 | Combined | Metrc scorecard |
|---|---|---|---|---|
| Items | 492 | 685 | **1,177** | 1,177 exact |
| Strains | 102 | 107 | **209** | 209 exact |
| Locations | 21 | 17 | **38** | 38 exact |

## 2. Transfers were double-counted — FIXED

`metrc_transfers` holds 3,723 rows but only **2,690 distinct manifests**. The
1,033 repeats are the same manifest recorded from both ends, because Twisted
Growers owns both licences and ships between them.

Worse than the double-count: **internal moves and laboratory samples were being
counted as customer sales**, and Twisted Growers appeared in its own customer list.

New **`v_manifest_ledger`** — one row per manifest, classified from Metrc's own
`ShipmentTypeName`:

| Movement | Manifests | Cultivation | Manufacturing | Both licences |
|---|---|---|---|---|
| **Customer sale** | **1,281** | 108 | 1,173 | — |
| Internal move | 1,175 | 32 | 112 | 1,031 |
| Laboratory sample | 214 | 86 | 128 | — |
| Patient supply | 15 | — | 15 | — |
| Vendor sample | 5 | — | 5 | — |
| | **2,690** | | | |

1,281 customer sales reconciles against Facility Metrics' 1,251 wholesale
deliveries. Previously the platform would have reported 3,723.

**966 manifests had no recipient recorded.** Backfilled via the per-transfer
delivery walk — 966 of 966 filled, 7 rounds, 100% success.

### What this exposed about the business

Splitting by licence changed the picture entirely:

| Month | Cultivation customer sales | Cultivation internal moves | Manufacturing customer sales |
|---|---|---|---|
| 2026-07 | 1 | 116 | 123 |
| 2026-06 | 0 | 78 | 102 |
| 2026-05 | 1 | 75 | 108 |
| 2026-04 | 0 | 77 | 110 |

**Cultivation sells almost nothing directly.** Essentially all its output moves
internally to manufacturing, which sells the finished product. The old combined
view hid this completely.

### Views corrected
- `v_manifest_ledger` — new, the canonical one-row-per-manifest source
- `v_customers` — was counting internal moves and lab samples as shipments, and
  included Twisted Growers itself
- `v_customer_directory` — new, derived from Metrc so no customer can be invisible
- `v_sales_history_monthly` — now splits customer sales from internal and lab

## 3. Licence separation is now a first-class dimension

New `licence_profile` table and `f_operation(licence)` function. No page hard-codes
"MC281714 means cultivation" any more (rule G1). Every combined view keeps the
licence on the row **and** totals across both, so cultivation, manufacturing and
the whole business are all readable without separate pages.

New catalogue views carrying both: `v_catalogue_items`, `v_catalogue_strains`,
`v_catalogue_locations`.

## 4. Still open

| Finding | Scale | Status |
|---|---|---|
| Lab results cover **3 of 3,548 packages** | 188 rows, 3 packages | **open** |
| COA PDFs stored | **3** | open |
| Manifest PDFs stored | **28 of 2,690** | open |
| Packages held vs Metrc | 3,548 of 4,092 — **544 short** | open |
| Customers with no email | **127 of 127** | open, raised as critical finding |
| Facilities never registered | **53**, carrying 163 manifests | open, raised as finding |

The owner's requirement that every item carry a clickable COA and manifest
**cannot be met until the lab and document backfills run** — only 3 COAs exist.

---

## 5. Lab results — 3 packages to 2,642 — FIXED

`metrc_lab_results` held 188 rows covering **3 packages** out of 3,548. Cause:
Metrc has no bulk lab endpoint. `/labtests/v2/results` requires a `packageId`, so
somebody had run it three times by hand and nothing was ever automated.

New Edge Function **`metrc-lab-backfill`**, driven by a resumable queue
(`metrc_lab_backfill`) so a package is pulled once and never again unless its
testing state changes. This is a catch-up, not a polling job.

| | Before | After |
|---|---|---|
| Lab result rows | 188 | **101,608** |
| Packages with results | 3 | **2,642** of 2,858 tested (92%) |
| Packages with a COA document reference | 1 | **1,904** |
| Distinct COA documents identified | 5 | **983** |

**The residual 244 return HTTP 401 under both licences.** These are third-party
packages received on a manifest — neither of our licences owns the certificate,
so the API will never serve it. This is exactly the case the owner raised: for
third-party material the COA must be read off the manifest, not the API.

## 6. Customer identity — corrected after getting it wrong

**An earlier finding in this document claimed 49 customer names were spelling
variants needing a merge. That was wrong.** "Nova Farms LLC" and "Nova Farms,
LLC" are not typos — they are different state licences held by the same company.
Merging them would have destroyed real information.

Confirmed by the owner: *"some companies have multiple ship to address and all
have different licenses."*

| Company | Facilities | Licences |
|---|---|---|
| Temescal Wellness of Massachusetts | 6 | 3 retail, 3 medical dispensary |
| Mayflower Medicinals | 5 | 1 cultivator, 3 retail, 1 medical |
| Resinate | 4 | 1 cultivator, 2 retail, 1 medical |
| Nova Farms | 3 | 1 manufacturer, 2 retail |

The model is now two levels and nothing is merged:

- **`v_facility_registry`** — identity is the state licence number, which never
  drifts. The display name is forced from the most recent Metrc record. Every
  name variant ever seen is retained so a search on an old spelling still finds it.
  Across 216 facilities there are **zero** name variants per licence, which is the
  proof that the licence is the right key.
- **`licence_type_prefix`** — MC cultivator, MP manufacturer, MR retailer,
  RMD medical dispensary, IL testing laboratory, and so on. A facility's type is
  read from its licence, never guessed from its name (rule G1).
- **`f_company_key()`** groups facilities under a trading company for roll-up only.

| Facility type | Facilities | Customer sales |
|---|---|---|
| Retailer | 160 | 1,013 |
| Product Manufacturer | 12 | 56 |
| Medical Dispensary | 16 | 55 |
| Cultivator | 9 | 51 |
| Delivery | 7 | 45 |
| Transporter | 2 | 40 |
| Microbusiness | 3 | 4 |
| Independent Testing Laboratory | 5 | — (227 lab samples) |

### Ship-to addresses are not in the Metrc API

Checked every field on the delivery detail: there is **no street address**.
`PlannedRoute` is free text about the driver ("Route determined by driver"). The
address exists only on the manifest PDF.

New **`facility_contacts`** table, keyed on the facility licence, holds ship-to
address, contact, email, delivery notes, receiving hours and terms — one row per
licensed delivery address, because a company has several. Staff fill it in when
building the first order for that facility, which is the owner's stated workflow.

The old `customers` table held **no contact details at all** — 127 rows, every
email null — so there was nothing to migrate.

---

## 7. Reading the certificates themselves

Owner, 6 August 2026: *"COA's will have testing, that's what a COA is."*

Correct, and it exposed how thin Metrc's structured results are. **835 packages
held a certificate while Metrc returned no terpene figure at all** — the number
was printed on the document the whole time.

All **983 certificates** have now been read. 3 failed to parse.

| Read off the certificate | Certificates |
|---|---|
| Total THC | 649 |
| Total CBD | 588 |
| Total terpenes | 105 |
| Full terpene profile | 46 |
| Safety screens (microbiology, mycotoxins, heavy metals, pesticides, solvents) | 918 |

### The parser refuses to guess

Massachusetts laboratories use different layouts, and two traps were found and
handled rather than papered over:

1. **The wrong column.** Green Valley prints `ANALYTE | LOQ(%) | AMT(%) | mg/g`,
   so "first number after the name" returns the limit of quantitation, not the
   result. MCR prints `sample | analyte | %wt | mg/g | limits`, where the first
   number *is* the result.
2. **Pie-chart legends.** The same page prints "β-Myrcene 42.5%" as a share of
   the terpene fraction. The real concentration is 0.811%. Reading the legend
   would overstate it fifty-fold.

Both readings are therefore collected and **checked against the total printed on
the same document**. A profile is stored only if it reconciles; anything that
does not is discarded (rule A1). Worked example: Myrcene 0.811 + Caryophyllene
0.648 + Humulene 0.182 + Linalool 0.129 + Limonene 0.092 = 1.862 against a
printed total of 1.907, the remainder being traces below detection.

Greek letters are handled — laboratories write α, β, γ where the analyte list
says Alpha, Beta, Gamma. Missing that cost three of five terpenes on the first pass.

### Two independent validations

- **Against Metrc.** Where both a structured result and a printed figure exist,
  **111 of 112 agree within 0.15 percentage points.**
- **Against Metrc's verdict.** 84 certificates print a FAIL on a safety screen.
  Metrc says `TestFailed` on 83 and `RetestPassed` on the remaining one — failed,
  retested, passed. **No package is sellable while carrying a failed screen.**

### A real bug this uncovered

The single "disagreement" was not a parse error but a **unit mismatch**. Metrc
reports edible potency as `Total THC (mg/g)`; the certificate prints `0.53961 %`.
Both are the same figure — 0.53961% is 5.40 mg/g — but the platform was labelling
**122 edible packages as "%" when the number was milligrams per gram**.

`v_product_identity` now carries `total_thc_unit` and `total_terpenes_unit`, and
the panel prints the unit rather than assuming a percentage.

### How a figure is sourced

The panel now states which it is: **"Metrc laboratory result"** or **"Read from
the certificate document"**. A derived terpene total says *"Sum of 13 individual
terpenes on the certificate"*. No figure is ever shown without its provenance.

`coa-extract` Edge Function hands out unread certificates and takes back what was
read. Parsing runs outside Deno because the edge runtime has no dependable PDF
text extractor; the reader downloads each document through its own signed link,
so no storage credential leaves the platform.

## 8. Drill-down

The forensic panel already existed and was returning nothing because the data
behind it was empty. It is now factored out of `RawRow` into `ForensicPanel`, so
a page with hand-built columns gets the identical drill-down via `DrillRow`
without giving up its layout. `DocumentChips` puts the certificate and manifest
one click from any row — a button, not an instruction to copy a reference.

Applied to Stock Detail. Still to do: Inventory Locator and Open Harvest Detail.
The other fourteen bespoke tables are settings and calculators where a product
drill-down has no meaning.

---

## 9. A summary row was imported as a transaction — found by review, not by me

The Wholesale Transfers report ends with a grand-total footer. The forward-fill
that carries a manifest number down onto its item rows also carried it onto that
footer, and the footer was stored as if it were a sale:

```
"Item Category": "Totals:"
"Amount": "$1,692,460.10S\n$1,685,460.10R"
```

**One row carrying 30% of all revenue.** It inflated the wholesale figure from
$5,572,801 to $7,265,261 — a number that was reported to the owner before anyone
checked it.

### Why it got through

The moisture import was validated against Metrc's own Facility Metrics scorecard
before any figure was quoted. The revenue import was not. A single line worth
nearly a third of the total would have shown up in any distribution check, and
no distribution check was run. The discipline was applied to one number and not
the other.

### What now prevents it

- `f_is_summary_row(jsonb)` — rejects any row whose own cells read
  "Totals", "Grand Total", "Subtotal" or "Sum". Applied at the mapper, so it
  cannot enter the ledger on a future upload.
- `v_import_outliers` — a standing check that flags any single line carrying more
  than a twentieth of a money total. Currently zero.

### Corrected figures

| | Quoted | Correct |
|---|---|---|
| Wholesale shipped value | $7,265,261 | **$5,572,801** |
| Wholesale received value | $7,258,731 | **$5,573,271** |

## 10. Full audit of every imported figure

Run after the above, on the owner's instruction.

| Check | Result |
|---|---|
| Summary rows in any landing table | **0** across all ten |
| Row counts against Facility Metrics and earlier reports | **all reconcile** |
| Priced packages vs scorecard | 571 vs 571 — **exact** |
| Manifests in reports not found in the API record | **0 of 2,097** |
| Harvest batches not found in the API record | **0 of 350** |
| Price per pound by category | Buds $1,296 · Pre-rolls $862 · Concentrate $6,792 · Shake/Trim $145–252 — **all plausible** |
| Moisture standard still reproduces | **73.5% on 271 harvests, unchanged** |

### An unexpected validation

The footer row I wrongly imported carried Metrc's own printed total:
**$1,685,460.10** on the receiver side. The figure computed independently by
summing 571 individual package prices from a *different file* is
**$1,685,460.10** — identical. The mistake accidentally confirmed the other number.

### One figure moved for a good reason

Customer sales read 1,281 when first quoted and 1,268 now. The delivery-detail
walk subsequently filled in shipment types on 13 manifests that previously had
none and defaulted to "customer sale"; all 13 were laboratory transfers.
Laboratory samples rose 214 → 227 by the same 13. Total remains 2,690.

## 11. Import safety, added on the owner's instruction

*"shouldn't user be asked about only importing new data and warned if they could
override data and a backup made in the event they fuck up"* — all three.

- **Preview before writing.** `tg_import_preview` reports how many rows are new
  and how many already exist and would be overwritten. Nothing is written until
  the person uploading chooses.
- **Two modes.** *Add new rows only* leaves everything already held untouched.
  *Add and update* corrects held rows.
- **Backup, always.** `tg_backup_before_import` snapshots the complete previous
  version of every row the import will touch, in both modes.
- **One-click undo.** `tg_import_undo` removes rows the import created and
  restores rows it changed.

**Proven, not assumed.** A real harvest was deliberately overwritten with false
weights (wet 0.77 → 220.46 lb, moisture 0.55 → 24.50 lb), then undone. All three
values returned byte-for-byte, and the stored source row reverted to the original
file's row. The moisture standard still reproduced at 73.5% afterwards.
