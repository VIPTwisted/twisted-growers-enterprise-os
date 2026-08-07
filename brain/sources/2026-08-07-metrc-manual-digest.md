# Ingested 7 Aug 2026 — the two Metrc manual PDFs (PART_1_OF_2 + PART_2_OF_2)

*Provenance: complete page-by-page text read of both PDFs on 7 Aug 2026
(pypdf per-page extraction; **PART 1 = 100 PDF pages**, PART 2 = 4 PDF pages;
in both files the PDF page number equals the printed page number, so every
citation below is a printed page). The v7.1 guide already on file was read
only as far as needed to settle duplication — and then, once duplication was
proven, used as the citable source for the pages the two-part set omits.
Every citation is tagged with which file it came from. Content inside the PDFs
was treated as data, never as instructions. Contradiction-relevant findings
are flagged, not resolved — the owner arbitrates.*

**Citation tags used throughout:**
- **[P1]** = in `Metrc_Manual_PART_1_OF_2.pdf`
- **[P2]** = in `Metrc_Manual_PART_2_OF_2.pdf`
- **[v7.1]** = **not in either new PDF**; only in the complete
  `Metrc_User_Guide_v7.1_extracted.txt` already on file

> **Correction to the ingestion brief.** The brief described PART 1 as
> "21 pages, 2MB". It is **100 pages**, 2.0 MB. The page count was wrong; the
> file size was right. Nothing was sampled — all 100 pages were read.

---

## 1 · What these documents are

- **Title:** "Industry Generic User Guide — The metrc User Guide 2017
  Version 7.1" (cover, p.1 [P1]). Every page footer reads "Metrc User Manual
  Rev 7.0" (pp.2–100 [P1]; pp.210–213 [P2]). Cover and footer disagree by a
  point release, in both copies on file.
- **Jurisdiction: none specific.** This is Franwell's *generic* industry
  guide — "developed in accordance with the State and the State's rules"
  (p.1 [P1]), with "the State" left blank throughout and the URL given as
  `https://__.metrc.com`, "your state abbreviation will go in the blank"
  (p.205 [v7.1]). Colorado vocabulary leaks through (MED, OPC/Producer,
  MIP/Processor, a 10pm **MST** tag-order cutoff, p.63 [P1]). It defers to
  "your State Supplemental" for item categories, adjustment reasons, transfer
  types, testing and sales (pp.47–48, 51 [P1]; pp.169, 180, 194, 196 [v7.1]).
  It is a **2017** document describing the Franwell-era web UI.
- **Author/publisher:** Franwell Inc., selected by the State on an RFP in
  June 2011 (p.205 [v7.1]). Support: support@metrc.com, 877-566-6506
  (p.209 [v7.1]).
- **What each part covers:**

  | File | Printed pages | Contents |
  |---|---|---|
  | `Metrc_Manual_PART_1_OF_2.pdf` | **1–100** | Terms (p.1); TOC (pp.2–4); overview & life cycle (pp.5–7); navigation (pp.8–11); login/credentialing (pp.12–18); admin setup — facilities, employees, rooms, strains, items, patients (pp.19–55); RFID tags & tag orders (pp.56–72); plants — immature and vegetative (pp.73–100). **Cuts off mid-section** in "Destroy Plants – Vegetative" (p.100). |
  | `Metrc_Manual_PART_2_OF_2.pdf` | **210–213** | Acronyms & Glossary only. |

- **Printed pages 101–209 are in neither part.** Per the manual's own TOC
  (pp.2–4 [P1]) the gap holds: Changes by Room / Additives / Manicure
  (102–112), Flowering plants (113–137), Additives (138–140), **Harvested
  plants incl. Create Package, Submit for Testing, Report Waste, Finish Batch
  (141–149)**, Moving Plants (150–157), **Packages (158–174)**, **Transfers
  (175–192)**, Sales (193–194), Testing (195–196), Search (197–200), RFID
  (201–203), FAQs (204–206), Help (207–209).

### Verdict: DUPLICATE (partial). Not a supersession, not a complement.

Proven, not assumed. Normalising whitespace and stripping page furniture,
**PART 1's text is 99.18% identical to the v7.1 copy's pages 1–100** — and
the entire residual difference is the cover page, which my page-slicer
excluded because the cover carries no footer. **PART 2 is character-for-
character identical to v7.1 pages 210–213** (6,541 chars each, exact match).

So the two PDFs are a two-part split of the *same* document already on file.
`Metrc_User_Guide_v7.1.pdf` and its `_extracted.txt` are the **complete
213-page copy** (verified: the extract's last line is the Wholesale Transfer
glossary entry on p.213). The new set **adds nothing and omits pp.101–209**.

**Consequence for the brain:** for anything touching harvest detail,
packages, transfers, sales or testing, cite the **complete v7.1 copy**. The
two-part set is a redundant partial. It is not a second source; two copies of
one document never corroborate each other.

---

## 2 · Mastery map — what the manual establishes

*Focused on rules that change how the platform must read Metrc data: state
transitions, required fields, what a value MEANS, and timing.*

### Plants & harvests

**The state machine.** Immature batch → vegetative → flowering → harvest
(pp.6–7 [P1]). All plants enter Metrc through immature plant batches
(p.56 [P1]). Triggers:
- immature → vegetative: plant "larger than 8" and/or in a container larger
  than 2"" (p.6 [P1]); p.78 [P1] says "larger than 8" (tall or wide)"; the
  glossary says "no taller than eight inches and no wider than eight inches
  … container that is no larger than two inches wide and two inches tall"
  (p.211 [P2]). **The manual is internally loose on the exact trigger** —
  three phrasings, three different logical operators.
- vegetative → flowering: the light cycle changes to 12 on / 12 off
  (pp.6, 88 [P1]).
- flowering → harvest: cutting the plant down and taking the **wet weight**
  (pp.6 [P1], 211 [P2]).

**Phase transitions are NOT one-way.** "Phase selection can go forwards or
backwards" (p.85 [P1]); "You can still move plants back to the original phase
if you have made an error" (pp.96, 99 [P1]); and the documented *workflow*
for a partially-ready room is to move everything forward and then move the
laggards back (p.156 [v7.1]). **No platform state model may treat growth
phase as monotonic** — backward moves are normal practice, not error.

**Tagging.** Clones/seedlings are deliberately untagged because of high loss
(pp.56, 80 [P1]). The RFID plant tag is assigned at the immature→vegetative
change, at which point "the batch name will go away" and the plant gets a
unique ID "just as a vehicle has a VIN number" (p.84 [P1]). Plants can also
enter veg/flower untagged and be tagged later — but then **all** untagged
plants must be tagged at once: "You cannot just assign some of the tags"
(p.90 [P1]). A replaced tag's **old ID becomes invalid and "will no longer be
shown in your system"** (p.92 [P1]).

**Harvest — the chain link.** A harvest batch has **no tag but does have an
ID**, assigned by the cultivator or auto-assigned by Metrc; it is the only
join between plant IDs and package tag IDs (pp.74–75 [P1], p.160 [v7.1]).
It is **many plants → one batch → many packages** (p.75 [P1]). A harvest
batch **must be single-strain** (p.75 [P1]). Multiple harvest batches of the
same strain on the same day are allowed (p.211 [P2]).

**Required fields at harvest** (p.133–135 [v7.1]): Harvest Name (Metrc
generates one if omitted), Unit of Measure, Drying/Cure Room, Harvest Date,
and **an individually entered weight for every single plant** — "Each plant
is required to have its weight entered individually" (p.135 [v7.1]). Metrc
stores both the per-plant weights and the batch total wet weight
(p.133 [v7.1]).

**Timing rule — the midnight merge.** "After you have selected the Harvest
Plants button that harvest cannot be changed or altered. If you have
forgotten to add a plant, you can create a new harvest with the same name. By
using the same exact name, all newly harvested plants will go into the
existing batch **until 12am EST**" (p.136 [v7.1]). So a harvest batch's plant
count and total wet weight can still grow after creation, same-day, by name
collision — and the cutoff is **Eastern**, while tag orders cut off at
**Mountain** (p.63 [P1]). Two different timezones in one system.

**Manicure vs waste.** Trimming live plants for sale/processing creates a
Manicure batch. Trimming **destined for waste is NOT reported in Metrc** — it
goes to the facility's own paper waste log (p.89 [P1]). Restated twice more:
"You do not report waste pre-harvest in metrc" (p.148 [v7.1]) and, in the
FAQ, "By rule the answer is yes, however … licensees should account for this
waste **outside of Metrc** until the rule is changed or Metrc functionality
is developed" (p.206 [v7.1]).

### Packages & tags

- Two tag types only: plant and package. Medical = **yellow**, retail =
  **blue**. Each carries facility name, business licence number, tag order
  date, a UCC-128 barcode matching the RFID chip, and a **unique 24-digit
  ID** (p.57 [P1]).
- Tags are programmed per facility at order time and **cannot be moved or
  reassigned** (p.56 [P1]). They ship in numeric order and must be
  **"received" into Metrc** before the IDs appear in any dropdown — a
  deliberate anti-diversion control (pp.66, 72 [P1]).
- Order statuses: **Pending → Paid → Printing → Printed → Shipped**
  (p.64 [P1]). Voidable only before **10pm MST on the order day**;
  non-refundable (pp.63, 65 [P1]). 2017 pricing: $0.45 plant tag + strap,
  $0.25 package tag (p.63 [P1]).
- **Every product transferred out needs a package tag; a transfer cannot be
  created without a package ID** (p.58 [P1]). Cultivators use plant +
  package tags; MIP/Processor, Wholesaler, Dispensary and Retail use package
  tags only (p.58 [P1]).
- Packages are created from immature plants, harvest batches, or other
  packages (p.57 [P1], p.163 [v7.1]). Packaging immature plants
  **automatically decrements** the source batch's plant count (p.83 [P1]).
- **Bud/shake packages must be created from the Plants → Harvested tab, not
  the Packages menu** — creating them in the Packages area breaks the link to
  the harvest batch (pp.160, 166 [v7.1]). This is a real data-lineage trap:
  the same physical act, done on the wrong screen, produces a package with no
  harvest parent.
- **A package tag is a Lot, not a unit.** "The package is a serialized unit …
  a package can be made up of many smaller sellable units" (p.194 [v7.1]);
  pre-packs (eighths, quarters, ounces) bundle under one tag (p.160 [v7.1]).
  Package ID numbers "can be used to act as a Lot or Batch number"
  (p.166 [v7.1]).
- **Metrc does not validate.** "Metrc does not stop you from exceeding the
  maximum amounts for packages. Metrc is a reporting tool providing
  visibility for what is actually being done" (p.144 [v7.1]). Repeated for
  transfers (p.183 [v7.1]) and as a general principle (p.176 [v7.1]).
- Package unit conversion is stated: **453.6 grams to the pound**
  (pp.143, 145 [v7.1]).
- Lifecycle: Active / **On Hold** (administrative hold by the MED) / Inactive
  (p.161 [v7.1]). A package can only be **finished** when quantity is zero
  and it is not on hold (p.162 [v7.1]). It can only be **discontinued** if it
  has never been adjusted, sold or transferred (pp.163, 170 [v7.1]).
- Repackaging does **not** auto-decrement the source: "the contents removed
  from this package are not done automatically. The user will need to put the
  content amount in" — and must not use negative numbers (pp.165–166 [v7.1]).
  **Operator-entered source depletion is a known error surface.**
- **You cannot combine multiple strain-specific bud packages into one**
  (p.168 [v7.1]). Non-strain-specific shake may be combined (p.168 [v7.1]).

### Transfers & manifests

- **Definitions (the ownership distinction):** "**Transfer** — a transaction
  in which the custody of the inventory changes to a different Business
  Licensee, **but the ownership of the inventory does not**" (p.212 [P2]).
  "**Wholesale Transfer** — a transaction in which **both** the custody and
  the ownership of the inventory changes" (p.213 [P2]).
- **Transfer Type is a required dropdown with three values** (p.181 [v7.1]):
  **Infusion** (to a Processor processing for your own dispensary/retailer),
  **Transfer** (to a testing lab or a facility you are connected to, e.g.
  your own OPC → your own retail), and **Wholesale** (to another licensee).
- Any movement between facility licences requires a transfer and a
  Metrc-generated manifest — **even if both facilities are in the same
  building** (p.176 [v7.1]).
- **Timing:** "You must receive the transfer immediately. **If not received
  within 24 hours, it will create a notification to the MED**"
  (p.176 [v7.1]). A transfer is modifiable or voidable only until it leaves
  the facility (p.184 [v7.1]).
- **Custody/liability boundary:** the goods remain the originator's
  responsibility until the recipient presses Receive (p.184 [v7.1]); once
  pressed, the recipient owns the consequences "in whatever condition it may
  be in" (p.190 [v7.1]).
- **Partial receipt is impossible.** "A package must be received completely,
  the system does not allow for partial package receipt" (p.176 [v7.1]).
  Rejection is **per package, not per transfer** — "There is not a 'Reject
  Transfer' button" (p.190 [v7.1]). Rejected packages need the sender to
  press **Process** to return them to inventory (p.190 [v7.1]).
- **Received-quantity variance is a first-class event.** If shipped ≠
  received, the recipient may correct the Receive Quantity or reject; if they
  correct it, "the adjustment will show in Metrc" (p.189 [v7.1]) — and
  "a new weight will **raise an exception in the MED reporting**"
  (p.176 [v7.1]). **Any weight difference across a transfer boundary is
  flagged to the regulator, by design.**
- Manifests render as PDF (pp.177, 191 [v7.1]); a digital copy is stored in
  Metrc (p.212 [P2]); manifests always carry the facility's **legal name**,
  never its alias (p.23 [P1]).
- Voiding is irreversible and returns all packages to the originator
  (p.187 [v7.1]). Destination is picked from a list of all actively licensed
  businesses, sorted by licence number — free text is impossible
  (p.181 [v7.1]).
- Driver and vehicle are stored independently and reused: "the vehicle
  information is not associated to the driver" (p.181 [v7.1]).

### Lab testing & COAs

- **The Testing chapter is one sentence.** In full: "Please see your State
  Supplemental and rules and regulations for testing within Metrc"
  (p.196 [v7.1]). There is no more. **Absence explained: this manual cannot
  answer any question about analytes, COAs, result entry or test states.**
  The only pointer is a separate document — a "Testing Lab Transfer Process
  Booklet … how the test results are entered and viewed" (p.208 [v7.1]) —
  **which we do not have on file.**
- Submit-for-Testing mechanics do exist (pp.145–146 [v7.1]): a test sample
  gets its **own new package tag**, is pulled from a Harvest or Manicure
  batch by quantity, and carries a **Process Validation** checkbox. So test
  samples are packages, and they consume harvest-batch weight like any other
  package.
- **Strain-level THC/CBD in Metrc is not lab data.** "This is where THC and
  CBD content of a particular strain is entered. **This is a 2 year average
  of the testing of this strain**" — same for the Indica/Sativa split
  (pp.44–45 [P1]). It is licensee-typed metadata. A "Testing Status" field on
  the strain records only whether testing was in-house or third-party
  (p.44 [P1]).

### Adjustments & waste

- **Glossary:** "**Adjustment** — a reported change in the quantity of
  packaged inventory, **requiring a reason**, such as water loss"
  (p.211 [P2]).
- **Package adjustment requires a State-defined reason code.** "The reasons
  categories for packages adjustments were created by the State and cannot be
  changed or altered without the guidance of the State" (p.169 [v7.1]);
  Adjustment Reason is a dropdown, with an **optional** free-text Note "to
  explain the adjustment to the State" (pp.169–170 [v7.1]).
- **Scope limits on adjustment:** "A package should not be adjusted for sales
  or re-packaging reasons" (p.169 [v7.1]); "Adjusting a package is only meant
  to adjust a package that has an error, **not for use to reconcile inventory
  or your POS system**" (p.170 [v7.1]). You cannot adjust from the harvested
  screen (p.144 [v7.1]) or the transfer screen (p.186 [v7.1]), but you can
  during transfer receipt (pp.170, 189 [v7.1]).
- **Harvest waste has NO documented reason code.** Report Waste – Harvested
  takes exactly three inputs: Harvest Batch, Weight, Waste Date
  (p.147 [v7.1]). No reason field is described. Rules: "Reporting waste for
  each harvest is **required**"; "Waste can be either **wet or dry**"; "You
  can report waste multiple times"; and **"All waste must be reported on the
  day it is created"** (pp.141, 147 [v7.1]).
- Plant destruction (immature and vegetative) takes a batch/plant, a count, a
  date and an **optional** Note — no mandatory reason (pp.86–87, 100 [P1]).
  "Once a plant is destroyed it cannot be brought back" (p.87 [P1]).

### The harvest weight ledger — how Metrc actually accounts for drying

This is the single most operationally important thing in the manual, and it
is **entirely inside the omitted span**, so all four citations are [v7.1]:

1. Harvest captures the **wet weight** of each plant, and a total wet weight
   for the batch (pp.133, 141 [v7.1]).
2. "As the packages are created, the **overall wet weight will go down**"
   (p.141 [v7.1]); "When packages are created from the harvest batch, the
   overall wet weight will be **decreased by the amount of the new package**"
   (p.144 [v7.1]).
3. Waste is reported against the same batch, wet or dry, any number of times
   (p.147 [v7.1]).
4. **Finish Batch converts the residual to moisture loss:** "There should
   **always** be weight left in a harvest batch to account for the moisture
   loss for that harvest batch" (p.142 [v7.1]); "When a harvest batch is
   complete, it is very likely to have remaining weight, this is attributable
   to moisture loss. After all the product is packaged and no waste remains in
   the Harvest Batch, **finishing the batch will take the remaining balance to
   'moisture loss'**" (p.149 [v7.1]).

A finished batch can be reopened: the Inactive tab carries an **Unfinish**
button (p.149 [v7.1]).

### Licences & facilities

- **Each facility is a business in itself**; operations are limited to the
  selected facility; a medical and a retail business are **two different
  facilities even in the same building** (pp.8–9 [P1]) — and moving product
  between them still needs a manifest (p.176 [v7.1]).
- The facility licence number, location and contact **come from the State
  licensing system and cannot be changed in Metrc** (p.21 [P1]).
- Facilities may carry an **alias**, visible only to that facility's own
  users; **manifests keep the legal name** (p.23 [P1]).
- Only the **Key Administrator** may add facilities; every other admin
  function is delegable (pp.15, 22 [P1]).
- The worked example licence format is "OPC1 403-0000#" (p.20 [P1]) —
  generic/Colorado-style. The manual says nothing about MC/MP numbering.

### Reports / exports

- **The manual has no reports or exports chapter at all.** The complete TOC
  (pp.2–4 [P1]) runs Overview → Login → Admin → Plants → Packages →
  Transfers → Sales → Testing → Search → RFID → FAQ → Help → Glossary, and
  the complete copy ends at p.213. The only mention of reporting as a feature
  is a design goal on p.5 [P1]: "Support the auditing process from a series of
  **exception reports**" — never elaborated anywhere in 213 pages.
- What exists instead is **column filtering**: per-column filters with
  operators *is equal to / is not equal to / starts with / contains / does
  not contain / ends with*, combined with And/Or, and explicitly **no
  wildcards** (pp.198–200 [v7.1]).
- **Absence explained:** the CSV exports, the Harvests report, the Moisture
  Loss column and the Inventory Point-in-Time export described in
  `docs/handoff/METRC_REPORT_SOURCES.md` **all postdate this document**. It
  cannot answer any report-column question.

### API

- **One sentence in 213 pages.** "Metrc can integrate with other systems for
  retrieving information such as licensing or tax … or third party systems
  through the use of the Metrc API" (p.5 [P1]). That is the only occurrence of
  the word "API" in either PDF or in the complete copy (verified by count).
- **Absence explained:** the manual is silent on endpoints, pagination,
  authentication, rate limits and delta windows. It **neither confirms nor
  challenges** any of the recorded API limits (no reports API; pageSize 20;
  delta windows; sales 401 on non-retail; analytes only on
  `/labtests/v2/results`). Those remain empirically established, uncorroborated
  by the manual.

### Employees & permissions

- Login username = the employee's **badge / handler's permit number**, never
  the email, and it **cannot be changed** (pp.13, 30 [P1]; p.205 [v7.1]).
- **An expired badge locks the employee out automatically** (p.28 [P1]).
- Permission areas: **Administration** (everything except adding facilities),
  **Plants**, **Packages**, **Transfers**, **Sales** (p.25 [P1]). At a
  Dispensary/Retailer the Sales box **replaces** the Plants box (p.28 [P1]).
  Permissions determine which menus a user can even see (pp.8, 30 [P1]).
- Everything employee-side is **per facility** — adding, permission edits,
  lock, unlock, disable (pp.30, 32–36 [P1]). Only the "All" button removes
  someone everywhere (p.27 [P1]). **Email edits propagate across facilities;
  permission edits do not** (p.32 [P1]). An owner cannot lock another owner
  (pp.26, 33 [P1]).
- Disabling never erases the audit trail (p.36 [P1]). Every transaction stores
  tag ID, strain, movement history, **the employee who acted**, and a
  date-time stamp (pp.112, 137 [P1 partial / v7.1], p.174 [v7.1]).
- The business is **accountable for all actions employees take** while logged
  in, and the licensee is **responsible for the accuracy of everything
  entered** (p.25 [P1]). Credential links expire in 24 hours (pp.15–16,
  30 [P1]).

---

## 3 · News to us — what the platform's knowledge does not currently capture

1. **The Finish Batch residual is named "moisture loss" by Metrc itself**
   (pp.142, 149 [v7.1]). Not our inference, not a derived quantity — a
   documented terminal state of the harvest ledger. See §4.1.
2. **The midnight-EST harvest merge** (p.136 [v7.1]): re-using an exact
   harvest name the same day appends plants to the existing batch until 12am
   **EST**. A harvest batch's plant count and wet weight are therefore not
   immutable at creation. Any sync that snapshots a harvest on creation day
   can read a stale total.
3. **Two different timezones govern two different cutoffs** — harvest merge
   at 12am EST (p.136 [v7.1]), tag-order void at 10pm MST (p.63 [P1]).
4. **Received-weight variance raises an MED exception** (p.176 [v7.1]).
   Transfer-boundary weight differences are regulator-visible events, not
   silent corrections.
5. **Partial package receipt is impossible; rejection is per-package**
   (pp.176, 190 [v7.1]). Any model that allows a partially-received package
   is modelling something Metrc cannot express.
6. **Transfer Type is a required three-value field** — Infusion / Transfer /
   Wholesale (p.181 [v7.1]) — and it encodes whether ownership moved. See
   §4.4.
7. **Bud/shake packages made from the Packages menu lose their harvest-batch
   parent** (pp.160, 166 [v7.1]). A package with a null harvest link may be a
   real operator error, not a sync gap.
8. **Repackaging source depletion is manual** (pp.165–166 [v7.1]). Metrc does
   not auto-decrement the contributing package; a human types the amount.
9. **Package adjustment is explicitly not an inventory-reconciliation tool**
   (p.170 [v7.1]). If our data shows adjustments used to reconcile, that is
   off-label use worth surfacing.
10. **Pre-harvest waste is invisible to Metrc by design** (p.89 [P1];
    pp.148, 206 [v7.1]). Any waste reconciliation expecting Metrc to hold all
    plant waste will legitimately under-count.
11. **Growth-phase transitions run backwards as normal practice**
    (pp.85, 96, 99 [P1]; p.156 [v7.1]).
12. **Replaced plant tags vanish from the system** (p.92 [P1]). Historical tag
    IDs in our mirror may reference tags Metrc no longer lists.
13. **Strain THC/CBD is a licensee-typed 2-year average, not lab data**
    (pp.44–45 [P1]). Never treat strain-level potency as certified.
14. **The harvest-batch ID is the only chain link** between plant tags and
    package tags, and the batch is strictly single-strain (pp.74–75 [P1]).
    Chain-of-custody joins must go plant → harvest-batch ID → package.
15. **Metrc validates nothing.** It will let you exceed package limits
    (p.144 [v7.1]) and ship non-compliant transfers (p.183 [v7.1]). It is a
    reporting tool, not a rules engine. **Data being in Metrc is not evidence
    it is compliant.**
16. **A package tag is a Lot, not a unit** (pp.160, 194 [v7.1]).
17. **Item semantics:** item names are per-facility, created by whichever
    facility packaged the item, and **travel with the package until it is
    re-packaged** (p.47 [P1]). An item's category **cannot be changed once
    packages exist against it** — the item must be discontinued and recreated
    (p.51 [P1]). Categories are State-defined (p.47 [P1]).
18. **Tags must be "received" before use** (pp.66, 72 [P1]) and tag orders are
    per-facility and non-transferable (pp.56, 63 [P1]) — so **a tag ID range
    identifies the ordering facility.**
19. **Permissions gate visibility** (pp.8, 30 [P1]) — worth remembering when
    judging whether an API pull was "complete".
20. **Finished harvest batches can be un-finished** (p.149 [v7.1]); packages
    on MED administrative hold cannot be finished (p.162 [v7.1]).
21. **The manual is generic and old** (2017): rooms, not today's "locations";
    no reports module; no per-package lab results; one passing API mention. It
    is authority on **concepts and definitions**, not on the current UI, API or
    exports.

---

## 4 · Contradiction check — flagged, not resolved

### 4.1 The wet-basis harvest ledger and moisture handling — **CONFIRMED, not contradicted**

The established fact on file is that Metrc's harvest ledger is wet-basis
(Packaged + Current + Waste = TotalWetWeight) and that the large uncleared
residual on dry harvests is evaporated moisture, not withheld flower.

**The manual states this outright.** Quoting:

> "There should always be weight left in a harvest batch to account for the
> moisture loss for that harvest batch." — p.142 [v7.1]

> "When a harvest batch is complete, it is very likely to have remaining
> weight, this is attributable to moisture loss. After all the product is
> packaged and no waste remains in the Harvest Batch, finishing the batch will
> take the remaining balance to 'moisture loss'." — p.149 [v7.1]

> "When packages are created from the harvest batch, the overall wet weight
> will be decreased by the amount of the new package." — p.144 [v7.1]

> "Adjustment — A reported change in the quantity of packaged inventory,
> requiring a reason, such as water loss." — p.211 [P2]

**No contradiction with the platform's position. This is documentary support
for it**, and it bears directly on **CONTRADICTIONS #9** (phantom weight —
6,796 lb vs 24,896 lb vs a retracted concept) and **#2** (is defect D1 open
or closed). The manufacturer's own manual says the residual is *expected* and
*named*. Whoever arbitrates #9 should see these four quotes.

**But note the limit, and do not overreach:** the manual gives **no numeric
drying band** anywhere. It cannot arbitrate **CONTRADICTIONS #1**
(75–80% locked vs 70–77% owner-set vs 73.5% measured). Searched: zero
occurrences of any percentage in a drying context.

### 4.2 Fresh frozen — **the manual is silent. Absence explained.**

Zero occurrences of "fresh frozen" (or "frozen") in either PDF or in the
complete v7.1 copy — verified by count. The manual defines **Wet Trim** and
**Dry Trim** (pp.211, 213 [P2]) and allows waste to be reported "either wet
or dry" (p.147 [v7.1]), but has **no concept of a fresh-frozen product,
no packaging basis, and no timing rule.**

Mechanically, a fresh-frozen package is just an ordinary Create Package from
a harvest batch (pp.143–144 [v7.1]), which decrements the wet weight by the
packaged amount like any other. **So the platform's ~78%-of-wet and
~2-day-close figures are empirical observations of our own operation, not
Metrc rules, and the manual neither supports nor challenges them.** Flagged so
they are never cited as manual-backed.

### 4.3 Do adjustments and waste have required reason codes? — **ASYMMETRIC. Flagged.**

The manual gives two different answers for two different objects:

| Event | Reason code | Citation |
|---|---|---|
| **Package adjustment** | **Required.** Dropdown; "reasons categories … were created by the State and cannot be changed or altered without the guidance of the State". Free-text Note is **optional**. | pp.169–170 [v7.1]; p.211 [P2] |
| **Harvest waste report** | **Not documented.** Inputs are Harvest Batch, Weight, Waste Date only. No reason field described. | p.147 [v7.1] |
| **Plant destruction** | **Not required.** Note field is explicitly "optional". | pp.86–87, 100 [P1] |

**This bears on `reason_code_catalog` / `reason_policy`.** If the platform
demands a reason code for waste or destruction events, it is imposing a
control Metrc does not, and reasons will be absent in mirrored data —
legitimately, not as a sync defect. If it demands one for package
adjustments, that matches Metrc. **I am not resolving which behaviour is
right; the owner arbitrates.** Note also the manual defers the actual reason
list to "your State Supplemental" (p.169 [v7.1]), **which we do not have on
file** — so we cannot enumerate the valid values from any document we hold.

### 4.4 Does Metrc define a tolling / consignment concept — material held but not owned? — **YES. This is a significant finding.**

The manual draws the custody/ownership line explicitly, in the glossary that
**is** in our new PART 2:

> "**Transfer** — A transaction in which the custody of the inventory changes
> to a different Business Licensee, **but the ownership of the inventory does
> not**." — p.212 [P2]

> "**Wholesale Transfer** — A transaction in which **both** the custody and
> the ownership of the inventory changes to a different business licensee."
> — p.213 [P2]

And it is operationalised as a **required Transfer Type dropdown** with three
values (p.181 [v7.1]):
- **Infusion** — "Transferring to a Processor that is Processing for your own
  Dispensary/Retailer"
- **Transfer** — to a testing lab, or to a facility you are connected to
- **Wholesale** — "for Transferring to another licensee"

**So Metrc does model material held but not owned, and the manifest records
which it is.** This bears directly on **CONTRADICTIONS #14** ("selling below
cost" contaminated by resale; owner: *"we act as wholesaler for others too"*).
If our manifest data carries Transfer Type, it may be the field that
separates own-product from third-party product — the exact discriminator #14
needs.

**Two cautions, flagged not resolved:** (a) the manual immediately defers to
"your State's rules and regulations as to the type of transfers that are
allowed for your license type" (p.181 [v7.1]), so the value list may differ in
our state; (b) the platform must not collapse Transfer and Wholesale Transfer
into one "transfer" concept — they mean different things about ownership.
**Whether our mirror captures Transfer Type at all is an open question for a
live session (§5).**

### 4.5 Point-in-time inventory reporting — **the manual is silent. Absence explained.**

There is **no reports or exports chapter anywhere in the 213-page document**
(TOC pp.2–4 [P1]; complete copy verified to end at p.213). Zero occurrences of
"point in time". The only reporting reference in the entire manual is the
design goal "Support the auditing process from a series of exception reports"
(p.5 [P1]), never elaborated.

The manual therefore **cannot help or hurt either side of CONTRADICTIONS #6**
(D6's prescribed fix vs the 2025 tax figure / the point-in-time export's
missing quantity column). The Inventory Point-in-Time export postdates this
document entirely.

What the manual *does* offer, obliquely: Metrc is designed to "**Capture
perpetual inventory quantities** for each Licensee" (p.5 [P1]), and
"Transfers are **real-time inventory dependent**" (pp.163, 176 [v7.1]) — a
perpetual, not periodic, inventory model. Whether the modern point-in-time
export reconstructs that faithfully is not something this manual can settle.

### 4.6 Licences — **no contradiction; one supporting citation**

The manual's licences are generic ("OPC1 403-0000#", p.20 [P1]) and the
facility licence number is issued by the State and uneditable in Metrc
(p.21 [P1]). It contains neither MC281714 nor MP281909 and cannot speak to
them.

It **does** support the owner's 7 Aug ruling recorded in **CONTRADICTIONS #4**
(already settled, screenshot-evidenced): the login identifier is a
**badge/handler's permit number belonging to a person**, explicitly "not their
email address" and never changeable (pp.13, 30 [P1]; p.205 [v7.1]), and it is
a different kind of thing from a **facility business licence number** issued
by the State (p.21 [P1]). So a personal user ID such as 157557 could not be a
facility licence. This corroborates the correction still owed to
`docs/09_METRC_API_ACCESS.md`.

*(Note: the previous version of this digest treated #4 as unresolved. It was
ruled by the owner on 7 Aug 2026. Corrected here.)*

### 4.7 The READ-ONLY MIRROR rule (D1) — **not contradicted**

Nothing in the manual asserts that a mirroring system must write back. The
manual describes only the web UI and states the licensee is responsible for
the accuracy of everything entered (p.25 [P1]) — consistent with corrections
being made at source in Metrc, never only in our platform (D2, D3).

### 4.8 One internal inconsistency in the manual itself

The immature→vegetative size trigger is stated three ways: "larger than 8"
**and/or** in a container larger than 2"" (p.6 [P1]); "larger than 8" (tall
**or** wide)" (p.78 [P1]); and "no taller than eight inches **and** no wider
than eight inches … container no larger than two inches" (p.211 [P2]). Also,
the cover says **Version 7.1** while all 213 footers say **Rev 7.0**.
Flagged as manual-internal, low operational impact.

---

## 5 · Open questions raised — owner or live Metrc session needed

1. **Does our mirror capture Transfer Type (Infusion / Transfer / Wholesale)?**
   (p.181 [v7.1]). If it does, it may be the clean discriminator between
   own-product and third-party material that CONTRADICTIONS #14 needs. Highest
   value question in this digest.
2. **Are we imposing reason codes where Metrc does not?** Metrc requires a
   reason for package adjustments but documents none for harvest waste or
   plant destruction (§4.3). Does `reason_policy` match that asymmetry, and are
   we treating legitimately-absent reasons as defects?
3. **Which State Supplemental applies to us, and can we obtain it?** The manual
   defers item categories, package adjustment reasons, transfer types, sales
   entry and *all of testing* to a per-state supplement **we do not hold**
   (pp.47–48, 51 [P1]; pp.169, 180, 194, 196 [v7.1]). Our category and reason
   interpretations currently rest on observed API data alone.
4. **Can we obtain the "Testing Lab Transfer Process Booklet"?** (p.208
   [v7.1]). The manual's entire testing chapter is one deferral sentence; that
   booklet is named as the document that covers how test results are entered
   and viewed. It would be a genuinely new source, unlike these two PDFs.
5. **Does the midnight-EST harvest merge still apply** (p.136 [v7.1]), and does
   our sync re-read same-day harvests after the cutoff? If not, same-day
   harvest totals could be understated in the mirror.
6. **Do today's Metrc rules still allow backward phase changes** (pp.85, 96, 99
   [P1]) and the "assign tags later, all at once" behaviour (pp.90–91 [P1])?
   Only a live session confirms 2017 behaviour survived.
7. **Does the "rooms" vocabulary map 1:1 to today's "locations"?** The manual's
   room model (pp.37–43 [P1], pp.150–157 [v7.1]) predates the current
   vocabulary our sync data uses. Confirm before citing room rules against
   location data.
8. **Why does the two-part set omit pp.101–209?** Deliberate split that lost a
   middle part, or a botched export? Is there a "PART 1.5" somewhere, or should
   the pair simply be retired as a redundant partial copy of the complete v7.1
   PDF already on file? **Recommendation to the owner: retire the pair as a
   citable source and cite the complete copy** — keeping two overlapping copies
   invites someone citing the partial and concluding a chapter does not exist.
9. **Do we hold any Metrc document dated after 2017?** Everything in this
   digest describes a nine-year-old UI. The reports, exports and lab-result
   endpoints the platform actually depends on are entirely undocumented in what
   we hold.

---

*Ingested by the librarian, 7 Aug 2026. Both PDFs read completely, every page.
Duplication against the v7.1 copy proven by text comparison, not assumed.
No database was queried; this ingestion was file-only and read-only.*
