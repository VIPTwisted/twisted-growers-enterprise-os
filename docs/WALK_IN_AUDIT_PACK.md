# Walk-in audit pack — inspector on the floor today

If CCC, Metrc, or DOR walks in, they do not want a monthly KPI. They want:
**this tag, this room, this many grams, this harvest, this test, this manifest, this invoice, this truck.**
Every screen below is that drill. Period control is As-of (where is it) or Range (how did it move).

Grain law: one row = one tag or one plant or one manifest line. Totals are after the rows, never instead of them.

---

## 0 · Facility map (both licences, same visit)

### Cultivation MC281714 — living + drying + vaults
Flower Rooms 1–4 · Mother · Immature / clone · Dry 1 · Dry 2 · Cure Vault · Pre-Trim Storage · Finish Vault · Fulfillment Vault · Packaging · Waste hold

### Manufacturing MP281909 — conversion + finished goods
Hydrocarbon · Solventless · Production · Biomass Prep · Freezer / Biomass · Fulfillment Vault · Finish Vault · Packaging · Lab-sample hold · Waste hold

### Not a room but must appear
In-transit outbound (manifest accepted, not received) · In-transit inbound · At ITL (test sample packages) · 3PL / transporter hold (Eagle Eyes class — storage, not a sale) · Between our two licences (TG→TG)

For each room the inspector gets **right now**:
- licence · room name (Metrc LocationName, not a nickname)
- plants: count by phase (immature / veg / flower) with tag, strain, planted date
- open harvests: name, wet, waste, current residual, days open, packaged so far
- packages: tag, item, category, qty + UOM, unit weight if each, packaged-on, source harvest(s), source package(s), lab status, quantity on hand
- last movement: created / split / adjusted / transferred / finished
- pounds and units **not added together**

10 Aug 2026 snapshot (not today): packaged on hand 2,554.7 lb; Cure Vault packages 0; harvest CurrentWeight is mostly water. Do not reprint CurrentWeight as vault inventory.

---

## 1 · Tag dossier (one page, one tag — this is the audit)

Header: package or plant label · item · strain · licence · current room · qty · UOM · status (active / finished / in-transit / at-lab)

Chain, in order, nothing skipped:
1. Genetics / source plants or incoming package + inbound manifest #
2. Immature batch → veg → flower plant tags (if we grew it)
3. Harvest name + harvest ID + wet / waste / packaged / finish date + drying room
4. This package created-from (SourceHarvestNames and/or SourcePackageLabels) + production batch #
5. Child packages split from this tag
6. Adjustments (reason, grams, who, when) — entry error vs waste vs processing loss as Metrc wrote it
7. Lab: sample tag, ITL, test date, pass/fail/retest, **COA file + Metrc lab row**, inherit path if this tag was not the sample
8. Transfers: every manifest this tag rode — direction, counterparty licence, transporter, departure, receipt, wholesale value Metrc printed (flag if transporter)
9. Sales: Apex invoice #, buyer, licence on the order, qty, $ — or **UNJOINABLE** if Apex API has no manifest/tag
10. If gone: finished reason + date + remaining 0

If any step has no record: print **MISSING IN OUR MIRROR** and the Metrc screen to open. Never “compliant” because we lack the file.

---

## 2 · Movement packs (range)

| Pack | Rows |
|---|---|
| Outbound wholesale | Manifest + lines + destination + transporter + Apex invoice match status |
| Inbound purchase / transfer | Origin + our dest licence + received qty vs shipped |
| Internal MC ↔ MP | Same company — excluded from purchase and from sale |
| Lab transfers | Sample tags only |
| Returns / rejected transfers | Metrc rejection + what we did in Apex |
| Waste / destruction | Plant + harvest + package channels |
| Production / processing jobs | Input tags + output tags + batch # (Metrc; floor work_orders empty) |

---

## 3 · Documents the inspector will ask to see beside the screen

| Document | Tied to |
|---|---|
| Metrc manifest PDF | Manifest # |
| Bill of lading / shipping | Same manifest / Apex shipment |
| Apex invoice / order | Order # |
| COA PDF | Sample tag / lot |
| ST-4 resale cert | Buyer licence |
| Receiving ticket | Inbound manifest |
| Waste / destruction log | Event #
| Driver / vehicle | Transporter licence |

Apex `/v1/deal-docs` and `manifest_number` on orders are **empty on the API**. UI may show them; our mirror cannot until the vendor exposes them. State that on the dossier. Do not invent the join.

---

## 4 · What must be on the menu (walk-in views)

1. Control Tower as-of **today** — room tiles that drill to tag list
2. Room board — one room, plants + harvests + packages
3. Tag search (scan or type 24-char) → dossier §1
4. Manifest search → all tags on it + invoice + COAs
5. Invoice search → Apex lines + attempted Metrc tags
6. COA search → lot + every child tag that inherits
7. Open harvests / at-lab / in-transit / waste-hold worklists
8. Exception queues (moisture, untested, fail, overdue)
9. Export of any of the above for the date they ask (CSV + PDF), licence filter

---

## 5 · Honest holes (do not hide from the inspector pack)

- As-of **yesterday or 12-31** without a PIT = cannot certify position
- Harvest API gap before ~15 May 2024
- 2024 lab report empty; paper COAs
- 33 transfer-report rows missing vs API
- Apex cannot join manifest/tag
- Receiving-orders 0
- Work-order tables 0 (Metrc batches exist)
- Room name on a harvest is DryingLocationName and does not move; only packages have a moving room

Those holes print on the pack cover sheet so nobody brief the inspector with a dashboard zero.
