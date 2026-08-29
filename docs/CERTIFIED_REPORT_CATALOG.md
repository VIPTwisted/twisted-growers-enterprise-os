# Certified report catalog — CCC / Metrc / DOR / company / management

Twisted Growers LLC · MC281714 · MP281909
Locked 29 Aug 2026. Delivery bar: every report a regulator or manager can pull is either **certified** or **explicitly refused** for that date. Never a live-package fake close.

## Two pulls (do not mash)

| Mode | Question | Source that can be true |
|---|---|---|
| **As-of** (one date) | What was on hand / open / owed at that instant? | Hashed PIT / snapshot taken that day, or last snapshot ≤ date with snapshot timestamp shown |
| **Range** (from–to) | What moved in the window? | Events dated in range: harvest, package, transfer, waste, test, Apex order |

Year-end is As-of 12-31-YYYY. Custom range is the same runner as This month / Last 12 / All.

## Certified means

1. Named system of record (Metrc harvest / Metrc package / Metrc transfer / Apex invoice / hashed PIT / QBO when live).
2. Grain stated (tag, harvest, manifest, order, month).
3. Licence split MC vs MP when the law splits them.
4. File or query hashed in `source_export` when the number is a close.
5. Missing data = refuse copy, never 0, never today’s bags with yesterday’s date.

935 CMR 500.105: seed-to-sale, inventory, waste, personnel, and business records (assets, liabilities, monetary transactions, journals, invoices, wages) must be available to the Commission on request. DOR: wholesale sales for resale need ST-4 on file; marijuana retail excise is retailer-to-consumer — we still need the sales book and resale certificates. GAAP / Form 355: year-end inventory, COGS, payroll.

---

## A · Seed-to-sale / CCC / Metrc inspector

| # | Report | Mode | SoR | Status 29 Aug |
|---|---|---|---|---|
| A1 | Plants by phase / room / tag | As-of | metrc_plants | Live now only |
| A2 | Harvest batch register (wet, waste, packaged, finish, moisture) | Range + as-of harvest | metrc_harvests | Partial; identity view live; phases NOT applied |
| A3 | Packages active | As-of today | metrc_packages | Live |
| A4 | Packages history (created, finished, adjusted) | Range | packages + adjustments + transfers | Incomplete for 2023–early 2024 |
| A5 | Inventory PIT both licences | As-of close | Metrc PIT export | **2025 file generated not imported; 2023/2024 missing or one-licence** |
| A6 | Transfers / manifests in and out | Range | metrc_transfers + report clone | API 158 vs report 110; 33 pre-7-Aug missing from export — do not patch export |
| A7 | TG→TG internal vs third-party | Range | transfer_type + licences | 1,094 internal of 1,252 inbound — must split |
| A8 | Waste / destruction / adjustments | Range | harvest waste + package adj + plant waste | Present; correction vs real loss **not** split (Metrc does not) |
| A9 | Lab results + COA by tag / lot | Range + inherit | Metrc lab API + COA files | 2024 labs empty in report; COA fetch incomplete |
| A10 | Test sample / 15 lb batch / fail + disposition | Queue + range | exception queues C2 | Live for moisture / untested / fail / overdue |
| A11 | Production batches | Range | Metrc ProductionBatchNumber | 1,766 batches in Metrc; platform work_orders **0** |
| A12 | Vendor samples / QC samples | Range | Metrc designation | Not confirmed built |
| A13 | Recall / diversion / incident | Range | policies + Metrc | Not a certified pack |
| A14 | Tag → harvest → package → manifest → COA drill | Any | lineage | Required by owner; Apex manifest key **null** on API |

## B · Tax / DOR / accountant

| # | Report | Mode | SoR | Status |
|---|---|---|---|---|
| B1 | Wholesale invoices (Apex) by period | Range | Apex shipping-orders newest version | 1,860 orders live; MATCHED 680 |
| B2 | Sales vs Metrc outbound (exceptions named) | Range | recon views | VALUE DIFFERS / FALSE MATCH / PRE-KEY / APEX ONLY live |
| B3 | Purchases / receiving | Range | Apex receiving-orders | **0 rows ever.** Not booked in Apex ≠ no purchases |
| B4 | Resale certificates ST-4 on file per buyer | As-of | documents | Not confirmed |
| B5 | Year-end inventory (FG / WIP / bulk / FF) | As-of 12-31 | PIT | **Not certified any year** |
| B6 | COGS / cost per lb | Range | owner overhead provisional | Labelled provisional; not P&L |
| B7 | Waste / shrinkage for books | Range | Metrc adj | Same as A8 |
| B8 | Payroll / wages (935 CMR business records) | Range | QBO/payroll | Phase after 15 Sep |
| B9 | Form 355 / trial balance exports | Range / YE | QBO | Not in OS yet |
| B10 | 280E-ready expense split | Range | QBO + policy | Not in OS yet |

Marijuana retail excise (10.75%) is retailer-to-consumer. We still owe DOR a clean wholesale book + ST-4s + corporate excise inventory.

## C · Company / management (micromanage)

| # | Report | Mode | Status |
|---|---|---|---|
| C1 | Contract dried flower vs 380 lb / month | Range month | **Live 244 vs 380 Aug; 11/13 under** |
| C2 | Harvest phases (wet/waste/FF/trim/flower) | Range | File written; **do not apply** until unclassified named |
| C3 | Inventory below reorder / empty cart | As-of | Not built |
| C4 | Units / hour by dept / SKU | Range shift | Floor tables empty |
| C5 | Dept grades / missed shift start | Range | Policy editable; not wired |
| C6 | Open harvest past limit | As-of | Queue 4 live |
| C7 | Never tested / failed no disposition | As-of | Queues 2–3 live |
| C8 | Sales book + exceptions | Range | Orders page live |
| C9 | Sync freshness (real worker, not dead register) | As-of | v_sync_item 0/66 in 48h last census |

## Build order (do not start C3–C5 before this)

1. B file census: DATE × LICENCE × HAVE/MISSING PIT for 2023-12-31 through today.
2. Import only real PITs. Nightly PIT both licences from now on.
3. Report runner: every A/B row above is a registered report with period bus (as-of vs range declared).
4. Refuse copy when snapshot missing.
5. Then QBO/payroll pack after 15 Sep implementation.

## Never

Invent 12-31 from live packages. Blend Metrc $ with Apex $. Sum harvest phases into the 380. Patch a Metrc export to close a gap. Print 0 on refuse.
