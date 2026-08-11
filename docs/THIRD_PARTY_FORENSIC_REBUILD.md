# Third-Party Forensic Inventory — how it works and how to rebuild it

Twisted Growers LLC · MC281714 / MP281909 · built 11 August 2026

**Read this before touching anything third-party.** It cost a full day to get right, and
every hour of that was spent on the same class of mistake: reading the wrong field, or
following the wrong join, and concluding the business had a problem when the data simply
had not been read properly.

---

## 0 · The five traps, in the order they bit

| # | The mistake | What it looked like | The truth |
|---|---|---|---|
| 1 | Read the inbound manifest from the **transfer report** only | "2023 and 2024 material has no manifests" | Every tag carries it on the PACKAGE record: `raw->>'ReceivedFromManifestNumber'`. 17/17 in 2023, 45/45 in 2024 |
| 2 | Read `PackagedDate` as the receipt date | "Paper City sat in our freezer 8 months" | `PackagedDate` is the SUPPLIER's. `ReceivedDateTime` is ours. It arrived **199 days old** and was held **42 days** |
| 3 | Traced lineage through `metrc_packages.SourcePackageLabels` only | "48 tags stop dead, 227 lb unaccounted" | The exit is on `metrc_rpt_package_transfers.source_package`. 49 tags / 643.9 lb were **sold**, worth $75,052 |
| 4 | Treated a failed lab test as a compliance event | "Failed material shipped to Legal Greens" | **WE REMEDIATE AND PROCESS FAILED MATERIAL.** The parent keeps `TestFailed` forever; the remediated material moves to a child that is retested and sold |
| 5 | Read item fields at the top level of `raw` | Category/strain/product line empty on every report | They are nested: `raw->'Item'->>'Name'`, `raw->'Item'->>'ProductCategoryName'`, `raw->'Item'->>'StrainName'` |

**If a third-party figure looks alarming, assume trap 1–5 before assuming a business
problem.** Five times out of five that is what it was.

---

## 1 · Field map — where every value actually comes from

### Identity and ownership

| Field | Source | Note |
|---|---|---|
| tag | `metrc_packages.raw->>'Label'` | always `upper(btrim())` when joining |
| item / category / strain | `raw->'Item'->>'Name'` / `'ProductCategoryName'` / `'StrainName'` | **nested under `Item`** |
| supplier | `raw->>'ItemFromFacilityName'` | who MADE it |
| ownership test | `f_is_ours(raw->>'ItemFromFacilityLicenseNumber')` | **never** infer from who shipped it |

`ItemFromFacilityLicenseNumber` survives repackaging. `ReceivedFromFacilityName` does not
— it is NULL on children.

### Acquisition

| Field | Source |
|---|---|
| **inbound manifest** | `raw->>'ReceivedFromManifestNumber'` — **not the transfer report** |
| delivered by | `raw->>'ReceivedFromFacilityName'` (may be the transporter, e.g. MMM Transport) |
| **date received** | `left(raw->>'ReceivedDateTime',10)::date` |
| date supplier packaged | `raw->>'PackagedDate'` |
| **age on arrival** | received − packaged. **The supplier's age, not ours** |
| what we paid | `metrc_rpt_package_transfers.source_row->>'Receiver Wholesale Price'` |

The transfer report begins **2024-01-18**. Anything received earlier has no row there,
which is why manifests must come from the package record.

### Location

| Field | Source |
|---|---|
| current room / sublocation | `raw->>'LocationName'`, `raw->>'SublocationName'` |
| location history | `metrc_rpt_point_in_time`, `record_type='Package'` — the ONLY source of past position |

The point-in-time report carries **no weight column** — tag and location only.

### Lab and remediation

| Field | Source |
|---|---|
| results | `metrc_lab_results` (the API table — **2,642 tags back to Sep 2023**) |
| ⚠ not this | `metrc_rpt_lab_results` (report export — only 1,016 tags, starts 2025-01-10) |
| lab state | `raw->>'LabTestingState'` — `TestPassed`, `TestFailed`, `RetestPassed`, `NotSubmitted` |
| **remediation** | `raw->>'ContainsRemediatedProduct'`, `raw->>'RemediationDate'` |
| **decontamination** | `raw->>'ContainsDecontaminatedProduct'`, `raw->>'DecontaminationDate'` |
| `overall_passed` | **TEXT, not boolean** in `metrc_rpt_lab_results` |

### Exit — the one that was missed

```sql
-- Our tag named as the SOURCE of a package that was then shipped.
-- The child is frequently NOT in metrc_packages; it exists only here.
from metrc_rpt_package_transfers t
where upper(btrim(t.source_package)) = <our tag>
```

Without this the record appears to stop dead. **49 tags carrying 643.9 lb and $75,052 of
sales were invisible until this join was added.**

---

## 2 · Objects

| Object | What it is |
|---|---|
| `v_third_party_forensic` | one row per third-party tag, seed to sale — the core |
| `v_third_party_remarks` | plain-language remark per tag, composed from field values |
| `v_transfer_line` | canonical transfer leg with direction and Metrc's own pounds |
| `v_alert_destroyed_unexplained` | destruction with no reason code / note / failing test |
| `v_dept_dash_third_party` → `mv_dept_dash_third_party` | the six Command tiles |
| `counterparty_role` | who is a customer, supplier, both, or a 3PL warehouse |

Refresh order is in `tg_snapshot_dashboards()`.

---

## 3 · Command dashboard section (ord 20–25)

| Tile | Value today | Drills to |
|---|---:|---|
| Third-party material on hand | 847.2 lb | `third_party_forensic` |
| Third-party spend, all time | $1,276,288 | `third_party_forensic` |
| Third-party UNEXPLAINED | 79.3 lb | `third_party_forensic` |
| Cash tied up over 90 days | 0.8 lb | `third_party_forensic` |
| Failed material — remediated | 424.5 lb | `third_party_forensic` |
| Third-party resold at markup | 349.9 lb / $81,204 | `third_party_forensic` |

**Never put a ledger walk behind a tile.** An earlier version computed live off
`f_inventory_reconciliation` and timed out both the dashboard read and
`tg_snapshot_dashboards`, leaving every dashboard broken until replaced. Tiles aggregate
directly and are materialised.

---

## 4 · Report filters

`report_registry.inventory.third_party_forensic` — 25 dimensions, 14 measures.

Dimensions: year received · supplier · supplier licence · delivered by · our licence ·
category · strain · status · lab result · lab state · initial lab state · ageing band ·
current room · current sublocation · inbound manifest · outbound manifest · exit manifest
· sold to · exit sold to · made into · destroy reason · destroyed by · lab · contains
remediated · contains decontaminated

Measures: lb received · lb on hand · lb sold · made lb · lb adjusted · exit lb · exit sold
USD · age on arrival days · days held total · days to process · days to sell · days unsold
· lab tests · lab failures

---

## 5 · Business rules — recorded, never to be re-derived

All in `conversion_factors`, injected into every agent runtime:

| Key | Rule |
|---|---|
| `process_failed_material_is_remediated` | **Failed material is remediated and processed on.** Never flag it. Follow the child |
| `history_2023_prelaunch_fresh_frozen` | 2023 fresh frozen bought pre-opening; licensing delays explain the hold. Settled |
| `material_no_double_dip_concentrate` | Never count concentrate weight AND its input material |
| `material_premium_vs_economy_sourcing` | Premium = our own buds. Economy may be third-party flower/trim |
| `bulk_flower_sold_both_origins` | We sell bulk flower both ours and third-party |

Counterparties: **we buy AND sell with other manufacturers** — they stock our brand in
their stores, we buy their material. A two-way flow is ordinary trade, **not** storage.
Eagle Eyes is the one true 3PL warehouse (Aug 2024 – Feb 2025); neither of its legs is a
sale or a purchase, and what did not come back was sold.

---

## 6 · Verify a rebuild

```sql
-- 1 · every measure ties to its independent source
select 'on hand' m,
  (select round(sum(lb_on_hand),1) from v_third_party_forensic) a,
  (select round(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
     coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))::numeric,1)
   from metrc_packages where not coalesce((raw->>'IsFinished')::boolean,false)
     and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))
     and not f_is_ours(coalesce(nullif(raw->>'ItemFromFacilityLicenseNumber',''),''))
     and nullif(raw->>'ItemFromFacilityLicenseNumber','') is not null) b;
-- expect 847.2 = 847.2

-- 2 · manifest coverage — must be near 100%
select extract(year from date_received)::int yr, count(*) tags,
       count(inbound_manifest) with_manifest
from v_third_party_forensic group by 1 order by 1;
-- expect 2024 61/61, 2026 332/332

-- 3 · the exit trace must be finding sales
select count(*) tags, round(sum(exit_lb),1) lb, round(sum(exit_sold_usd),0) usd
from v_third_party_forensic where exit_child_tags is not null;
-- expect ~49 tags, ~235 lb, ~$75,000

-- 4 · unexplained must be SMALL. If it is >100 lb, the exit trace has broken.
select count(*), round(sum(lb_received),1) from v_third_party_forensic
where status like 'UNEXPLAINED%';
-- expect 23 tags, 79.3 lb
```

**If check 4 blows up, the `source_package` join is broken — fix that before reporting
anything.** That single join is the difference between 227 lb "missing" and 79.3 lb.

---

## 7 · Position as at 11 August 2026

| | |
|---|---|
| Bought in | 3,801.3 lb · $1,276,288 · $379/lb |
| Processed into our product | 1,620.7 lb across 239 tags |
| Processed then sold via child tag | 643.9 lb across 49 tags · $75,052 |
| Destroyed | 540.0 lb — all Paper City fresh frozen, 2024, Robert Goode |
| On hand | 847.2 lb across 118 tags, 15 suppliers |
| **Unexplained** | **79.3 lb across 23 tags** |

Failed material: 527.6 lb total (272.9 ours, 254.7 third party), almost entirely Total
Yeast and Mould. **Remediated and processed on — not a compliance issue.**

### Still open

1. **79.3 lb / 23 tags** with no recorded outcome — needs the same `source_package` hunt run per tag.
2. **200.8 lb of Holyoke Wilds trim on hand with no delivery date and no manifest** on the package record. Largest single documentation gap, and it is current stock.
3. **2024 Flower/Buds recorded at $1 total for 517.6 lb** — a price-entry failure on the manifests. At the 2025 rate that material is worth ~$244,000, so every 2024 cost figure touching purchased flower is wrong until corrected.
