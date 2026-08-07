# Metrc reports — what they give that the API does not

Compiled 6 August 2026 from exports supplied by the owner. **Every figure below
was obtained by parsing a report file by hand. None of it is loaded into the
platform yet.** This document records exactly which report each fact came from so
the work is reproducible and the gaps are explicit.

Rule D1 still holds: Metrc is the legal record and this platform is a read-only
mirror. Nothing here writes to Metrc.

---

## Summary — what only the reports can give

| Data | API | Report | Which report |
|---|---|---|---|
| **Moisture loss per harvest** | ✗ absent | ✓ | Plants-HarvestsInactive |
| **Wholesale price per package** | ✗ 401 | ✓ | Packages-Transferred, WholesaleTransfers |
| **Invoice number per manifest** | partial | ✓ | WholesaleTransfers, Transfers (limited) |
| **Adjustment reason and user** | ✓ endpoint exists, never pulled | ✓ | Packages Adjustments |
| **Plant waste method and reason** | not pulled | ✓ | Plants-Waste |
| **Historical point-in-time holdings** | ✗ none | ✓ names only, **no quantities** | Inventory Point in Time |
| **Facility totals scorecard** | ✗ | ✓ | Facility Metrics (PDF) |
| Harvest totals incl. Total Pkg'd | partial | ✓ | Harvests |

---

## Report by report

### Plants-HarvestsInactive.xlsx — THE most valuable
**350 rows. MC281714.**
Columns: Harvest Batch, Strain, Location, Sublocation, Patient, Plants, Wet
Weight, Waste, Total Weight Packaged, **Moisture Loss**, Restored, Unit Of
Measure, Lab Testing, Administrative Hold, Date, Finished, Discontinued.

**`Moisture Loss` does not exist anywhere in the API.** It closes the mass balance
to exactly zero:

| | Pounds | % of wet |
|---|---|---|
| Wet weight | 39,853.3 | — |
| Waste | 3,667.4 | 9.2 |
| Packaged | 11,289.1 | 28.3 |
| **Moisture loss** | **24,896.7** | **62.5** |
| Unaccounted | 0.0 | — |

**Read that 62.5% carefully.** It spans all 350 finished harvests, including 77
with zero moisture — of which **72 are named "FF" (fresh frozen)**, packaged wet
and never dried. Zero is correct for them.

Across the **271 harvests that actually dried**, weighted by wet weight:
**73.5%**. Median 74.3%, p10 55.1%, p90 84.4%.

**73.5% is the figure that belongs in `expected_moisture_pct`, not 62.5%.**
The configured 75–80% band is marginally too high, not wildly wrong.

### Harvests.xls
**380 rows.** Harvest Name, Strains, Location, Plants, Wet Wgt., Waste,
**Total Pkg'd**, Pkg's, Weight, Lab Testing, Hold, Batch Date, Finished Date.

Revealed the sync held only **153 of 380** harvests. No moisture column — reading
"Weight" (current remaining) from this report alone led me to a wrong conclusion
that is corrected above.

### Packages-Transferred.xlsx
**4,902 rows.** Destination License/Facility, Manifest Number, Package, Source
Harvest, Source Package, Item, Category, Item Strain, **Shipped Quantity**,
**Gross Weight**, **Shipper Wholesale Price**, **Received Quantity**,
**Receiver Wholesale Price**, Status, Received Date.

**The only source of package-level wholesale price.**
`/transfers/v2/deliveries/{id}/packages/wholesale` returns **401**, and the
working `/packages` endpoint returns **70 fields with no price of any kind**
(verified with `metrc-probe?keys=1`).

### WholesaleTransfers.xls
462 rows in the first export, **11,814** in the second.
Manifest, **Inv. Nbr**, Origin/Dest Lic. and Facility, Created, Received, Item,
Item Category, Voided, **Amount**, Ship'd, Rcv'd, % Var.

From the first export: **$420,047.46 shipped**, 99 lines, 38 invoices.
Buds $415,503 · Shake/Trim $3,750 · Vape $544. Largest counterparty Eagle Eyes
Transport Solutions $215,935. Facility Metrics independently confirms **99
wholesale deliveries**.

### Packages Adjustments — both licences
**MC281714 749 rows · MP281909 3,665 rows · 4,414 total.**
Package, Item, Item Category, **Quantity**, **Reason**, **Note**, Adj. Date,
Pack Date, **User**, L.T.E. Date.

Net **−871.6 lb**. Manufacturing is 93% of it (−814.7 vs −56.9).

| Reason | Count | Negative lb |
|---|---|---|
| Over/Under Pulled | 3,121 | −1,341.7 (offset by +1,366.0) |
| Waste | 156 | −642.7 |
| Processing Loss | 534 | −199.2 |
| Entry Error | 342 | −115.5 (offset by +182.0) |
| Spoilage | 28 | −107.3 |
| Drying | **1** | −0.0 |

Only one "Drying" adjustment exists — moisture is recorded on the harvest, not as
a package adjustment. `/packages/v2/adjustments` **does** exist and probes 200 OK,
so this is pullable daily; it has simply never been pulled.

### Transfers (limited)
1,257 + 2,464 rows = **2,690 distinct manifests.** Revealed the sync held only
**1,586**, with nothing before 2025-11-21. Types: Affiliated 2,063, Unaffiliated
1,410, Lab 227, Patient Supply 16, Vendor Sample 5.

### Inventory Point in Time
**2,103 rows MC281714 · 648 MP281909, as at 1/1/2025.**
Type, Tag Number, Name, Category, Strain, Location, Sublocation, Expiration/Sell
By/Use By, Status Current, Plant Location On Date.

**No quantity column.** It says what was held, not how much — so it cannot
produce a fileable return on its own. This corrects HANDOFF.md D6, which treats
this report as the route to the 2025 tax figure.

### Plants-Waste.xlsx
**4,396 rows.** Plant Waste Number, Waste Method, Material Mixed, Waste, Reason,
Total Plants, Waste Date, Plant Batch, Unit Of Measure. Not mirrored at all.

### Plants Destroyed / Plants Trend / Test Batches Relationships
- Plants Destroyed: 3,772 records, phase and location
- Plants Trend: daily counts by phase
- Test Batches: 739 rows, **343 harvest→package→category links** with pass/fail.
  Buds 217, Fresh Frozen 78, Shake/Trim 48. 291 passing, 38 failing.

### Facility Metrics (PDF) — the scorecard
Harvests **380** (350 finished, 30 open) · Packages 1,648 · Transfers 1,156 ·
**Wholesale deliveries 99** · Items 492 · Strains 102 · Locations 21 ·
Plants destroyed 56,759 · **Sales: every metric N/A**, confirming no retail
licence.

Used to validate the harvest recovery (380 exact) and the wholesale line count
(99 exact).

---

## Gaps this exposed in the sync, and how they were closed

Metrc's `active/onhold/inactive` endpoints return only a recent window unless
given explicit `lastModifiedStart`/`lastModifiedEnd`. The Edge Function already
supported `winStart`/`winEnd` for this and it had never been used.

| Dataset | Held before | After walking history | Report says |
|---|---|---|---|
| Harvests | 153 | **380** | 380 ✓ |
| Manifests | 1,586 | **2,690** | 2,690 ✓ |
| Packages | — | +496 from 2024 alone | — |

**This must become a scheduled quarterly backfill** or the gap reopens for
anything closing outside the delta window.

## Still not mirrored

Plant waste (4,396) · plants destroyed (3,772) · adjustments (4,414) ·
wholesale price · items 492 / strains 102 / locations 21, all of which read zero
in our tables while Metrc reports them.

---

## Facility Metrics — BOTH licences (added later, 6 Aug 2026)

The manufacturing scorecard changes the revenue picture materially.

| | MC281714 cultivation | MP281909 manufacturing |
|---|---|---|
| Packages total | 1,648 | **2,444** |
| Transfers total | 1,156 | 1,392 |
| **Wholesale deliveries** | **99** | **1,152** |
| **Wholesale packages** | **571** | **12,675** |
| Received packages | 4,902 | 13,294 |
| Items | 492 | 685 |
| Strains | 102 | 107 |
| Locations | 21 | 17 |
| Plants / harvests | 4,413 / 380 | N/A |
| **Sales — every metric** | **N/A** | **N/A** |

### What this means

**The $420,047.46 found in the cultivation Wholesale Transfers export is a small
fraction of the business.** Cultivation accounts for **99 of 1,251** wholesale
deliveries and **571 of 13,246** wholesale packages. Manufacturing — vapes,
edibles, concentrate, pre-rolls — carries the rest and none of its revenue is
captured anywhere.

**`Packages-Transferred` for MP281909 is the highest-value outstanding export**,
roughly 12,675 rows each carrying `Shipper Wholesale Price`.

**Sales is N/A on both licences**, confirming no retail anywhere and that
disabling `/sales/v2/receipts` was correct.

**Combined reference data: 1,177 items, 209 strains, 38 locations.** Our
`metrc_items`, `metrc_strains` and `metrc_locations` tables hold **zero rows on
both licences** while the API returns success with no records. That is a genuine
fault, not a missing export, and a report import will only mask it.

**Packages: 1,648 + 2,444 = 4,092 against 3,548 held — a ~544 gap**, most likely
the same delta-window issue that hid 227 harvests and 1,104 manifests.

---

## The importer — built 6 August 2026

Uploading a Metrc export no longer needs anyone to say what it is. Detection is
driven by rows in `metrc_report_types`, matched on the report's **column
signature**, because Metrc appends `(1)`, `(2)`, `(3)` to filenames and people
rename them. All ten registered reports were verified against the real exports.

| Object | What it does |
|---|---|
| `metrc_report_types` | The registry. Signature, target table, key columns, cadence, priority |
| `tg_detect_report(text[])` | Identifies the report. Every signature column must be present |
| `tg_near_miss(text[])` | On failure, names the closest report and the exact missing columns |
| `tg_import_report(rows, licence, as_of, file)` | The one entry point. Administrators only |
| `metrc_rpt_*` | Ten landing tables. Each row keeps `source_row`, `import_id`, `imported_at` |
| `v_report_upload_due` | The obligation register: report × licence × period, due or overdue |
| `v_report_upload_alerts` | The same, resolved to named people |

### Only three files a month

Deliberately the smallest set that works. Everything the API already delivers
was kept **off** this list — uploading it by hand adds nothing.

| # | Report | Licence | Why nothing else will do |
|---|---|---|---|
| 1 | Plants — Harvests Inactive | MC281714 | `Moisture Loss` exists in no API endpoint. Without it wet cannot be reconciled to dry, so the 380 lb/month target cannot be verified |
| 2 | Packages — Transferred | MC281714 | Package-level wholesale price. `/transfers/v2/.../wholesale` returns **401** |
| 3 | Packages — Transferred | MP281909 | Same, and manufacturing holds 12,675 of the 13,246 priced packages |

Quarterly: Wholesale Transfers, Plants Waste, Plants Destroyed, Test Batches.
Yearly (1 January): Inventory Point in Time.
On demand only: Adjustments, Harvests, Packages Inventory — the API covers all three.

### Metrc exports only the columns visible in the grid

`Metrc-Massachusetts-MC281714-Plants-HarvestsInactive.xlsx` in the owner's
Downloads folder contains **one column** — `Harvest Batch` — because the export
was run with the rest hidden. `Moisture Loss` is hidden by default. The importer
detects this and says so explicitly rather than failing blankly.

### AgentMapper

An unrecognised file is captured into `metrc_report_unmapped` with its exact
column list and raised as an `agent_findings` entry for **Metrc & Compliance**.
The agent proposes a mapping; an administrator approves it; the landing table
and the registry row are created together. New reports need **no code and no
deploy** — `tg_map_generic` builds the INSERT at run time from `column_map`.

Two guards, both proven to fire:

1. A proposal may only reference columns the uploaded file actually contained.
   Verified by rejecting a proposal naming `Location` against a file without it.
2. A file with **repeated headers** is refused outright. Plants Trend has a
   two-tier header (`Tracked` / `Destroyed`) with `Vegetative` and `Flowering`
   under both — that needs code, and saying so beats approving a guess.

Guard 1 exists because the first Plants Trend mapping drafted during this work
was wrong: it invented `Location` and `Strain` columns the real export does not
have. It was deleted rather than left in place, since a wrong signature silently
mis-files every future upload.

### Alerts

Outstanding uploads appear on `v_admin_alerts` as **critical** the day they fall
due, not once late, and clear only when the file arrives (rule H1). Recipients
are rows in `report_alert_recipients`: `owner` and `executive` exist today;
`ceo`, `cfo`, `coo` and `admin` are pre-registered and route automatically the
moment those roles are created.

**In-app alerting is live. Email is not** — no email provider is configured yet.
That remains P0 on `golive_items`.
