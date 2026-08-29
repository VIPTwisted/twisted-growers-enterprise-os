# MASTER certified packet

Every report IRS, DOR, CCC, Metrc, a lender, an accountant, or this management team can demand.
Custom date: **As-of** (position) or **Range** (movement). Certified or refused. Never a live-package fake close.

Twisted Growers LLC · MC281714 · MP281909 · Locked 29 Aug 2026

Companion docs: CERTIFIED_REPORT_CATALOG.md · WALK_IN_AUDIT_PACK.md (tag/room/manifest drill).

---

## Law hooks (why each pack exists)

- CCC 935 CMR 500.105 / 501.105 — seed-to-sale, inventory, waste, personnel, business books on request.
- Metrc is the Commonwealth seed-to-sale SoR. Our OS is the operating + evidence layer. We do not replace Metrc.
- MA DOR — wholesale sales + ST-4 resale; Form 355 corporate excise; payroll withholding. Retail marijuana excise is the *retailer’s* MRT, not ours.
- IRS — Form 1120, inventory, COGS, 280E (most SG&A disallowed; COGS and inventory still have to be real), 941/W-2/1099, fixed assets.
- Operations / planning — owner bar: 380 lb dried flower / month, units per hour, empty-cart stops, harvest allocation.

---

## PACKET I — Walk-in physical (CCC / Metrc) — see WALK_IN_AUDIT_PACK.md

I-1 Facility map both licences, every LocationName  
I-2 Room board: plants + open harvests + packages  
I-3 Tag dossier (plant or package): genetics → harvest → package tree → adj → lab/COA → manifests → invoice  
I-4 Manifest dossier + invoice dossier + COA dossier  
I-5 In-transit / at-lab / waste-hold / TG↔TG / 3PL  
I-6 Immature batches, mothers, flowering plants by room  
I-7 Open harvests: wet, waste, packaged, current residual, days open  
I-8 Active packages by item / category / room / licence  
I-9 Finished packages in range (reason + date)  
I-10 Production batches (Metrc batch # ↔ input/output tags)

**Now:** live packages, rooms, exception queues, harvest identity.  
**Not certified:** as-of a past date without PIT; harvest headers pre-May 2024; Apex tag join.

---

## PACKET II — Seed-to-sale movement (CCC range)

II-1 Harvest register by finish date  
II-2 Packages created / split / combined  
II-3 Transfers outbound (wholesale)  
II-4 Transfers inbound (purchase / inbound transfer)  
II-5 Internal MC ↔ MP (exclude from buy and sell)  
II-6 Lab sample transfers + results + fail disposition  
II-7 Rejected / returned transfers  
II-8 Waste: plant + harvest + package adjustment  
II-9 Destruction / remediate  
II-10 Vendor samples / QC samples  
II-11 Adjustments register (Metrc reason text, not our rewrite)  
II-12 Tag universe union (API + transfer report + adj + labs) so no silent drop

**Now:** transfer API stronger than report clone (do not patch the clone).  
**Gap:** 33 report rows missing vs API; 16 outbound 2024 lines without package export.

---

## PACKET III — Testing / COA (CCC Admin Order 5)

III-1 Lab results by sample tag  
III-2 COA PDF store + parse  
III-3 Inheritance: sample → children → harvest lot  
III-4 Never submitted  
III-5 Failed, no disposition  
III-6 Retest / R&D vs compliance fail  
III-7 Harvest moisture / residual vs owner 70–77% band

**Now:** queues live; inheritance documented ~98% of tags in Aug audit.  
**Gap:** 2024 lab report empty; COA fetch stopped 6 Aug; paper 2024.

---

## PACKET IV — Sales / shipping / tax books (DOR + IRS + CCC business records)

IV-1 Apex order book (newest version only)  
IV-2 Invoice / credit / cancel  
IV-3 Shipments / BOL (when docs exist)  
IV-4 Metrc outbound vs Apex (MATCHED / VALUE DIFFERS / FALSE MATCH / PRE-KEY / APEX ONLY)  
IV-5 Buyer register + licence + ST-4 on file  
IV-6 Sales by buyer / SKU / month (Apex $ only)  
IV-7 Collections / AR  
IV-8 Purchases / receiving (Apex receiving-orders)  
IV-9 Landed inbound vs Metrc inbound (third-party only)  
IV-10 Transporter / 3PL activity — **not revenue** (Eagle Eyes class)

**Now:** 1,860 orders; recon statuses live.  
**Gap:** receiving-orders 0; deal-docs / manifest_number null on Apex API; ST-4 library not confirmed.

---

## PACKET V — Inventory valuation (IRS / Form 355 / lender / YE)

V-1 Certified PIT both licences: 12-31-2023, 12-31-2024, 12-31-2025, each month-end 2026, today  
V-2 FG / WIP / bulk flower / shake / FF / concentrate / units  
V-3 Opening + receipts + production − shipments − waste = close (identity check, print breaks)  
V-4 Cost basis (when rates owner-set; else provisional)  
V-5 Slow / failed / untested aged  
V-6 Intercompany MC→MP elimination

**Now:** no imported YE PIT any year. 2025 file 3,364 rows on disk.  
**Rule:** no V-1 number until hashed PIT imported.

---

## PACKET VI — Financial / IRS / 280E

VI-1 P&L (QBO)  
VI-2 Balance sheet  
VI-3 Trial balance / GL  
VI-4 COGS vs 280E-disallowed SG&A (policy table, not a guess)  
VI-5 Payroll register / 941 / W-2 / 1099  
VI-6 Fixed assets / depreciation  
VI-7 Cash / bank rec  
VI-8 Related-party / owner draws  
VI-9 Cost per saleable lb (today: provisional overhead $285k, not P&L)

**Now:** not in OS. Implementation window 15 Sep QBO/payroll.  
Do not invent a GL from Metrc prices (Eagle Eyes $ trap).

---

## PACKET VII — Personnel (935 CMR 500.105 personnel + wage records)

VII-1 Org chart / roles / rooms assigned  
VII-2 Hire / term / training / visitor  
VII-3 Hours by department / shift  
VII-4 Schedule vs clock  
VII-5 Compensation / bonus  
VII-6 Agent registration dates if required

**Now:** HR nav exists; scheduling pages off period bus; payroll later.

---

## PACKET VIII — Operations / planning / management (why this OS exists)

VIII-1 Monthly contracted dried flower vs actual (380) — **live, Aug 244**  
VIII-2 Harvest calendar / room turn / next pull  
VIII-3 Allocation of wet/dry to flower vs preroll vs extract (CFO-set, not grower-set)  
VIII-4 Finished-goods floors + reorder by department / SKU  
VIII-5 Units per hour vs target (editable window)  
VIII-6 Shift start vs first unit (9:00 vs 10:07 class)  
VIII-7 Dept grade / exception aging  
VIII-8 Sales demand vs on-hand vs in-cure (empty cart)  
VIII-9 Work orders vs Metrc production batches  
VIII-10 Yield by strain / room / crew (dry % of wet, not identity moisture)

**Now:** VIII-1 live. VIII-5/9 tables empty. Phase split not applied.

---

## PACKET IX — Security / incidents / SOPs (CCC will ask; files more than SQL)

IX-1 SOPs current version  
IX-2 Diversion / theft / loss reports  
IX-3 Recall log  
IX-4 Camera / access (usually separate system — link, do not fake)  
IX-5 Transport manifests + vehicle + agent

---

## Certified stamp on every export

Footer: SoR name · grain · licence · as-of or range · generated_at · row count · source_export hash if a close · “MISSING” list · “NOT A SUBSTITUTE FOR METRC”.

---

## Wave to build (agents)

W0  Period bus on the eleven + refuse copy — A #89  
W1  PIT census all years + import real files + nightly PIT — B  
W2  Tag dossier + room board + manifest/invoice/COA search — C UI + existing views  
W3  Movement packs II + III registered on report runner  
W4  IV recon already live; receiving first-pull only on APPLY  
W5  VIII floors / UPH after tables exist  
W6  VI–VII after QBO 15 Sep

Nothing in VI is printed as IRS-ready until QBO is the SoR.
