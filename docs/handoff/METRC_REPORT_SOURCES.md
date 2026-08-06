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
