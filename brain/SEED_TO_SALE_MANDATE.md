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

**METRC IS THE LEGAL RECORD AND IS READ-ONLY TO THIS PLATFORM, FOREVER.** Where a
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

**The join is EXACT, so this is achievable, not aspirational:** Apex order lines
carry `metrc_package_label` — the 24-character Metrc tag. Orders carry
`manifest_number` and `buyer_state_license`. **There is no excuse for name-matching
anywhere in this system.**

**⚠ ORDERS SPLIT.** `split_from_order_id` / `split_chain`: one order becomes several
and several ride one manifest. **Reconcile at LINE level on the package tag, then
roll up.** One-to-one order↔manifest matching fails on every split and reads as a
discrepancy that is not one.

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
