# SEED TO SALE — THE COMPLIANCE MANDATE

**Owner ruling, 11 August 2026. This outranks every convenience, every deadline and
every agent's own plan. Read it before you touch cultivation, manufacturing,
packaging, inventory, sales, documents or reporting.**

> *"This OS must be fully compliant with all CCC rules and be a full seed to sale
> tracking system. Every item is fully tracked in locations from seed to sale
> including 3rd party. All data must reconcile between all platforms and
> spreadsheets fully without discrepancies. Real seed to sale."*

---

## 0. WHY THIS DOCUMENT EXISTS

Because the same class of failure keeps recurring: a figure is produced from one
source, nobody checks it against an independent one, and it is wrong in a way that
looks fine. A cultivator in Massachusetts does not get to be approximately right.
The CCC does not accept "our dashboard said so."

**This is not a feature list. It is the definition of done.** A screen that shows a
number without its chain of custody is not finished, however good it looks.

---

## 1. SOURCE OF RECORD — NEVER GUESS, NEVER BLEND

Each fact has exactly ONE authoritative source. Reading the wrong one is not a
rounding error, it is a wrong answer with a citation.

| Fact | SOURCE OF RECORD | Never use instead |
|---|---|---|
| Cultivation, harvest, plants | **Metrc** | a spreadsheet, a memory, a dashboard |
| Manufacturing, production runs | **Metrc** | the planner workbook |
| Packaging, package tags, weights | **Metrc** | the finished-goods sheet |
| **Sales, price, discount, terms** | **Apex** | Metrc — its price is a DECLARED transfer price |
| Transfers, manifests, custody | **Metrc** | Apex's own shipping record alone |
| Lab results, potency | **The COA** | Metrc's copy, which restates it |
| Third-party material | **Metrc + the manifest** | the sheet alone |

**METRC IS THE SOURCE OF ALL INVENTORY.** Owner, 11 Aug 2026, verbatim: *"Metrc
source of all inventory tags, manifests of cultivation, harvest, packaging, 3rd party
purchasing and reselling, ours and 3rd party goods."*

That is broader than "cultivation and manufacturing". It covers the ENTIRE physical
lifecycle, including goods bought from third parties and resold, and goods held for
others. If it has a tag, Metrc is where it lives.

**THE MANIFEST IS THE SEAM, NOT A TAG STAMPED INTO APEX.**

Metrc's manifest already holds the packages, the tags, the weights, the destination
licence, what shipped and what was received. Apex holds the commercial half: the
order, the price, the discount, the invoice, the terms, the transporter. They are two
halves of ONE transaction and they join at the MANIFEST.

⚠ DO NOT LOOK FOR METRC TAGS INSIDE APEX. Measured 11 Aug 2026 on live data:
`metrc_package_label` is populated on **8 of 13,135** Apex order lines, and
`manifest_number` on **0 of 1,739** orders. I reported that as a data-entry failure by
the sales team. IT WAS NOT. It was me imposing the wrong model and calling the wrong
answer a finding. Apex was never meant to carry them. What Apex DOES carry on all
1,739 orders is `transporters`, with the transporter's `facility_license` - the same
MX licence pattern the manifest parser already keys on.

**METRC IS READ-ONLY TO THIS PLATFORM, FOREVER.** Where a
Metrc write is required, the platform produces step-by-step instructions and a
PERSON does it. No agent, no automation, no exception.

**APEX IS THE SALES SOURCE OF RECORD.** Metrc holds what was *declared to the
state*; Apex holds what was *sold and for how much*. Neither corrects the other, and
**where they disagree, the disagreement IS the finding** — it is a billing dispute,
a short shipment or a data-entry error, and flattening it destroys the evidence.

---

## 2. IDENTITY IS THE TAG

**A name is an ATTRIBUTE of a tag. It is never an identity.** Never resolve anything
by matching name strings — names drift, tags do not. This has already cost this
platform three times: *"Nova Farms LLC"* against *"Nova Farms, LLC"*, a package
deduped on tag instead of (licence, tag), and *"Sales, Orders & Fulfillment"*
against *"Sales, Orders and Fulfilment"*.

Resolve the TAG, then read the name off the winning source, stopping at the first
that answers:

1. **Metrc seed-to-sale** — walk the tag to its source harvest(s)
2. **The certificate** — the only INDEPENDENT source; every Metrc field shares one
   origin and cannot disconfirm another
3. **The manifest** — weakest; it restates what the shipper typed
4. **A person** — never guess

`f_strain_by_tag(tag)` returns **BLEND and NO strain** when a package came from more
than one harvest. That is correct, not a gap: a blend HAS no single strain, and
naming one contributor would be inventing a figure.

---

## 3. EVERY TAG CARRIES ITS DOCUMENTS, IN REAL TIME

**Every item, everywhere it appears, links to its manifest and its COA.** Not a
report you can run — a link on the row, live.

- `f_item_documents(tag)` is the accessor. It returns `storage_path`, **never a URL.**
- **Mint a signed URL at click time.** Never store, cache or render a
  `download_url`: all 3,666 were signed together and expire 5–6 Sep 2026, which
  would kill every print button on one day.
- **The FILE is permanent. `coa_valid_until` is NOT** — that is the real one-year
  regulatory validity of the lab result. **Product cannot be sold on an expired
  certificate.** 736 packages are past it, 2 still active.
- Anything **tested or sold** whose document status is not COMPLETE **must not reach
  a customer.**

---

## 4. RECONCILIATION IS THE PRODUCT, NOT A REPORT

**Every tag bought or sold must reconcile to its manifest. Everything tested must
reconcile to its COA.** Across Metrc, Apex, the spreadsheets and the documents,
with **zero unexplained discrepancies.**

**100% means 100% ACCOUNTED FOR, not 100% identical.** Every row on both sides is
matched or explained. A price difference between Apex and Metrc is legitimate and
expected — it just has to carry its reason.

**FORBIDDEN, because they manufacture a false green:**
- fuzzy-matching names to force a match
- rounding until totals tie
- excluding rows that will not match
- an INNER JOIN, which makes orphans invisible — **use a FULL OUTER JOIN**

**If coverage is 94%, report 94% and name the 6%.** A 100% nobody can trust is worth
less than an honest 94%.

**RECONCILE AT THE MANIFEST.** Metrc's manifest is the inventory record — it holds
the packages, the tags, the weights, the destination licence, what shipped and what
was received. Apex holds the order, price, discount, invoice, terms and transporter.
Join the two on keys **both sides actually hold**:

| | Metrc side | Apex side |
|---|---|---|
| customer | `destination_licence` | `buyer_state_license` |
| transporter | `MX` licence on the manifest | `transporters[].facility_license` |
| when | `created_on` / `received_on` | `order_date` / `delivery_date` |
| how much | packages, shipped/received weight | line quantities |

**⚠ DO NOT JOIN ON `metrc_package_label`.** An earlier version of this document said
Apex lines carry it and the join was therefore exact. **That is true of Apex's
specification and false of the live data** — it is populated on 8 of 13,135 lines,
and `manifest_number` on 0 of 1,739 orders. Apex was never meant to carry Metrc
identifiers. A reconciliation built on that field will report 0.06% coverage and be
correct to do so.

**⚠ ORDERS SPLIT.** `split_from_order_id` / `split_chain`: one order becomes several
and several ride one manifest. **Reconcile at LINE level, then roll up.** One-to-one
order↔manifest matching fails on every split and reads as a discrepancy that is not
one.

**Names are still never a key.** Licence numbers do not drift; company names do.

---

## 4A. NAME THE LICENSEE — NEVER "OURS"

**Owner ruling, 11 August 2026:** *"Every tag must state cultivator and/or
manufacturer and even packager if on COA or manifest. It's always the Company name —
you cannot say 'ours', that is out of legal compliance for seed to sale."*

**This is a compliance rule, not a wording preference.** Under seed-to-sale every
package must attribute the LICENSED ENTITY that cultivated, manufactured or packaged
it. A regulator asking "who made this" cannot be answered with "ours" — that names
nobody, and it appears on no certificate and no manifest.

- **Always the company name and its licence.** The licence is the identity; the name
  is what a person reads. Both, every time.
- **Never "ours", "our grow", "our farm", "in-house", or a bare blank.** A blank reads
  as "probably us", which is the same failure with better manners.
- **Unattributed is stated in words** — "UNATTRIBUTED: no cultivator, manufacturer or
  packager recorded on any COA or manifest" — so the gap is visible and countable.
- **Every attribution carries its source**: COA, manifest, Metrc, or a person. An
  attribution with no source is an assertion, not a record.
- **Names come from `company_licenses`**, never a literal, so a renewed, added or
  transferred licence is correct everywhere at once.

⚠ **This was violated while the mandate was being written.** `tag_event.ours` was
created as a BOOLEAN on 11 Aug — in the same session as this ruling. A boolean cannot
name a cultivator. Replaced with cultivator, manufacturer and packager, each carrying
licence, name and source. **And `App.jsx:2586` still shows a user "ours or bought in".**

---

## 5. LOCATION, ALWAYS — INCLUDING THIRD-PARTY

**Every item is tracked in a location, from seed to sale, including material held
for other companies.** Third-party material is somebody else's property in your
custody: it must be as traceable as your own, and **never counted as yours.**

`f_is_ours()` reads from `company_licenses`. **A licence number frozen into code is
wrong the day a licence is renewed, added or transferred** — and "is this ours?" is
the hinge of the entire ownership chain.

---

## 6. TIME-TO-TURN — CASH IS THE POINT

**Track how long material takes to turn**, from purchase, cultivation and harvest
through to sale, so capital is not tied up unseen. This is a first-class metric, not
a nice-to-have:

- purchased → received → packaged → sold
- harvest cut → dry → package → sold
- **days at each stage**, and what is sitting still

**Standard dry window is 10–14 days from cut to first package.** A harvest with no
finished date has not finished packaging and **must never enter a conversion
calculation.**

---

## 7. EVERY FILTER, EVERY REPORT, EVERY DATE RANGE

Every item must be filterable by **every dimension its source platforms expose** —
Metrc, Apex and the spreadsheets — and every view must be pullable as a report by
filter and by date range.

**Filters are DATA, never JSX.** A hard-coded filter list means every new filter is a
code change, a review and a deploy — so it never happens, and the screen quietly
stops matching reality. Apex alone exposes ~40 taxonomy endpoints (cultivars,
cannabinoids, terpenes, product types, package sizes, grow environments, drying and
trim and extraction methods, flowering periods); those ARE the filter set. Sync them
as reference data and drive the registry from them.

---

## 8. THE UNITS TRAP — THIS HAS ALREADY COST REAL MONEY

- **NEVER add units to pounds.** Use `f_quantity_text(qty, uom)`; cross-check against
  `v_countable_inventory`. 18,822 units across 143 packages once published as nothing.
- **`weight_variance` is a PERCENTAGE, not a weight.** Summing it produces a
  meaningless number.
- **Fresh frozen is packaged WET at ~4.5:1** and must never be added to dried flower
  at face weight — doing so understated cost per pound by **40%**.
- **A single month is not a cost per pound.** Harvests land on a 14-day cadence while
  overhead is constant; months swing $269 to $4,516. Answer from the trailing
  12-month figure, and say it is **PROVISIONAL** — there is no P&L in this system.

---

## 9. BEFORE YOU BELIEVE ANY CHECK — THE FIVE QUESTIONS

1. **Can it fail?** A check that cannot fail proves nothing.
2. **Is the source independent?** Two fields from one system cannot disconfirm each other.
3. **Is the unit the same on both sides?**
4. **Is the population the same?**
5. **Is absence being read as a zero?** A null is not an absence; a zero row count
   may mean "not permitted".

**The harvest balance closes exactly on all 350 closed harvests — AND THAT PROVES
NOTHING.** Metrc derives moisture as the residual, so it closes on a dishonest
harvest too. Never present "it balances" as evidence.

---

## 10. WHAT "DONE" MEANS UNDER THIS MANDATE

A feature is finished when **all** of these hold:

- [ ] Its figures come from the declared source of record, labelled
- [ ] Every item on it links to its manifest and COA, live, by tag
- [ ] It reconciles against the other platforms, with a coverage number
- [ ] Every discrepancy is listed and explained, never hidden or flattened
- [ ] Units carry their basis; nothing sums across bases
- [ ] It filters by every dimension the sources expose, and exports by date range
- [ ] Third-party material is visible and never counted as ours
- [ ] **A guard exists that FAILS when any of the above stops being true**

**The last box is the one that matters.** Every rule above has been stated before, in
prose, and broken anyway. A rule with no guard behind it is a diary entry — it binds
only the people who read it recently, which on this platform has repeatedly been
nobody.
