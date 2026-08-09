# TG-07 SALES DEPARTMENT — BUILD BRIEF
**Issued 9 August 2026. Owner: "build module for sales channel we then have to sync
possibly with metrc data, spreadsheets, coa's and manefests."**

Read `.claude/agents/_charter_common.md` first and obey every law in it, including THE
STANDARD. This brief adds facts; it removes nothing.

---

## 0. DO NOT CREATE A NEW AGENT

TG-07 Sales, Orders & Fulfillment already exists (`.claude/agents/tg07-sales.md`) and owns
orders, shipments, manifests, customer notes and COA gating. This work is TG-07's, and a
second sales agent would produce exactly the collision that nearly cost this repo work
twice in one day. What TG-07's charter has never carried is an **ingestion mandate** —
that is what this brief adds.

---

## 1. THE FINDING TO READ BEFORE ANYTHING ELSE

**The sales department does not exist yet. It is an empty schema.** Measured against the
live database, 9 Aug 2026:

| table | rows |
|---|---|
| `customers` | **128** |
| `sales_orders` | **0** |
| `sales_order_lines` | **0** |
| `invoices` | **0** |
| `shipments` | **0** |
| `shipment_lines` | **0** |
| `customer_notes` | **0** |
| `metrc_sales` | **0** |
| `coas` | 0 (the real COA data is in `coa_extract`, 983 rows) |

These are base tables read with service-role rights, so zero means empty, not hidden —
rule A4 satisfied, and you must satisfy it the same way before you report any Apex feed as
empty.

**What the Sales pages show today is Metrc, relabelled.** `v_sales_history` and
`v_sales_history_monthly` are built on transfer manifests and count `PackageCount` and
`ReceivedPackageCount`. **There is no money in them, and there never has been.** This
platform has never held a revenue figure. That is not a bug to patch quietly — it is the
reason the Apex module exists, and it is why $1,317,836 of *purchases* was once read as
revenue.

So the framing is not "improve sales". It is **"sales has never been built, and Apex is
the source it must be built from."**

---

## 2. WHAT THE APEX KEY ACTUALLY REACHES

Observed on the owner's own key, 9 Aug 2026 — eighteen scopes. This is the entity list.
Do not invent entities beyond it and do not assume one exists because a normal sales
system would have it.

**Read:** `view:company` · `view:products` · `view:brands` · `view:batches` ·
`view:available-inventory` · `view:tags` · `view:buyers` · `view:buyerleads` ·
`view:buyerstages` · `view:dealflows` · `view:dealdocs` · `view:netterms` ·
`view:shipping-orders` · `view:receiving-orders`

**Write:** `update:products` · `update:batches` · `update:shipping-orders` ·
`create:shipping-orders`

### Three things that list tells us, and one it does not

1. **There is no invoice scope and no payment scope.** Money must therefore come off
   `shipping-orders` line pricing and `netterms`. **CONFIRM THIS AGAINST A REAL PAYLOAD
   BEFORE BUILDING ANYTHING ON IT.** If Apex returns no unit price on a shipping order,
   the entire revenue premise of this module is wrong and the owner must be told that day,
   not worked around. Our `invoices` table may end up derived rather than synced, or may
   stay empty — that is a finding, not a failure.

2. **`dealflows` + `buyerstages` + `buyerleads` is a CRM pipeline, and we have no table
   for any of it.** This is the "sales channel" the owner asked for: where a deal is,
   who owns it, what stage, what is stuck. Nothing in our schema models it.

3. **`dealdocs` is the likely Apex home of COAs and manifests.** We hold 2,690 manifest
   documents and 983 parsed COAs. Expect overlap, expect disagreement, and reconcile —
   do not overwrite ours with theirs or theirs with ours.

4. **What it does not tell us: the auth scheme, the base URL, or the payload shape.** I
   have not verified any of the three against Apex's own documentation, which is why the
   base URL is an owner-entered field in Integrations rather than a constant in the code.
   Your first task is to confirm them from a real call, and to say so plainly if you
   cannot.

---

## 3. HOW TO IMPORT — LAND RAW FIRST, MAP SECOND

The owner's instruction is *"fully import all data and map and add any fields fully"*.
The only method that can honestly deliver that is **staging-first (ELT, not ETL)**.

### Step 1 — `apex_raw`, verbatim, nothing dropped

```
apex_raw(id, entity, apex_id, payload jsonb, fetched_at, payload_hash, run_id)
```

One row per object per pull, payload stored **exactly as returned**. Do not map, coerce,
rename or filter on the way in.

**Why this and not direct mapping:** we do not know Apex's field set. Any mapping written
before seeing real payloads silently discards every field we failed to anticipate, and
reports success while doing it. That is the precise failure the `integration-settings`
prefix filter had until this morning — an unrecognised key vanished and the caller was
told the save succeeded. Raw-first makes re-mapping free: you re-map from stored payloads
without re-pulling, without burning rate limit, and without a gap in history.

### Step 2 — derive the field map from evidence

```sql
select entity, k, count(*)
from apex_raw, lateral jsonb_object_keys(payload) k
group by 1,2 order by 1,2;
```

Every key Apex has ever sent, counted. **That** is the mapping specification — not a
guess, not their docs, the actual traffic. Add typed columns from it.

### Step 3 — the gate that makes "fully mapped" checkable

Build `v_apex_field_coverage`: every key seen in `apex_raw` against every column mapped
downstream, with the unmapped ones listed by name and by how often they appear. Then a
gate in `tools/checks/` that **fails the build when a key with real traffic is unmapped**.

The owner's hard rule is *"nothing is ever omitted, sacrificed or shortened"*. Right now
that rule is enforced by somebody remembering it. Make it enforced by something that can
fail — and break it once on purpose to prove it catches that, because a check that cannot
fail proves nothing.

### Step 4 — map into typed tables, then reconcile

Only now fill `sales_orders`, `sales_order_lines`, `customers`, `shipments`. Add columns
the existing schema lacks — it was designed before anyone had seen Apex:

- `sales_orders` has no `apex_id`, no source, no currency, no totals, no sales rep, no brand
- `sales_order_lines` has `sku_id` but no Apex product id, no Metrc package tag, no uom,
  no line total — and **uom matters**: never add units to pounds, use `f_quantity_text`
- `customers` has no `apex_id`, no address, no licence expiry
- nothing anywhere models dealflow, stage, lead or brand

---

## 4. THE JOIN TO METRC — AND THE RULE THAT GOVERNS IT

| Apex | joins to | our side |
|---|---|---|
| shipping order | manifest number | `shipments.metrc_manifest`, `metrc_rpt_transfer_manifests` (5,280) |
| batch / package | 24-char Metrc tag | `metrc_rpt_package_transfers` (19,256 rows, full tags) |
| buyer | state licence | `customers.state_license`, manifest `RecipientFacilityLicenseNumber` |
| dealdoc | COA / manifest PDF | `coa_extract` (983), `manifest_extract` (764), `v_item_documents` |

**Apex is the sales source of record. Metrc is the compliance source of record. Neither
is a correction of the other** (`brain/DECISIONS.md`, 7 Aug 2026). Metrc holds what was
*declared*; Apex holds what was *sold and for how much*. A Metrc manifest price is a
declared transfer price and must be labelled as one everywhere it appears.

**Where they disagree, the disagreement is the finding.** Write it to a reconciliation
table with both figures and both sources side by side. Never silently pick a winner, and
never overwrite either side. A discrepancy between them is frequently the most valuable
row in the system — it is a billing dispute, a short shipment or a data-entry error, and
flattening it destroys the evidence.

### ⭐ THE JOIN IS EXACT — 100% IS ACHIEVABLE, NOT ASPIRATIONAL

The OpenAPI spec settles the hardest question in this whole build. **Apex order lines
carry the Metrc package tag directly:**

- **`metrc_package_label`** on every order item — the 24-character Metrc tag
- **`manifest_number`** on every shipping order — the Metrc manifest
- **`operation_license`** on the line, **`buyer_state_license`** on the order
- **`metrc_transfer_template.metrc_manifest_template_id`** on the order

**So the reconciliation is a key join, not a fuzzy match.** There is no excuse for
name-matching anywhere in this module, and no excuse for a coverage figure below 100% that
is not explained by a specific missing tag.

| Apex | key | our side |
|---|---|---|
| order item | `metrc_package_label` | `metrc_rpt_package_transfers.package_tag` (19,256 rows, full tags) |
| shipping order | `manifest_number` | `metrc_rpt_transfer_manifests.manifest_number` (5,280) |
| buyer | `buyer_state_license` | `metrc_rpt_transfer_manifests.destination_licence` (all 4,072 outbound) |
| order line qty | `order_quantity` + `order_unit_measurement_id` | package quantity + uom — **never add units to pounds** |

**⚠ ORDERS SPLIT.** `split_from_order_id` and `split_chain` are on every order: one Apex
order can become several, and several can ride one manifest. **Reconcile at LINE level on
the package tag, then roll up** — matching order-to-manifest one-to-one will fail on every
split and you will misread that as a discrepancy.

### 100% RECONCILIATION IS THE REQUIREMENT (Owner, 9 Aug 2026)

> *"this has to reconcile 100% perfect with Metrc."*

Hold that standard. It has an exact meaning, and an agent that misreads it will produce a
green number that is a lie.

**100% means 100% ACCOUNTED FOR — not 100% identical.**

1. **Coverage must be 100%.** Every Apex shipping order ties to a Metrc manifest. Every
   outbound Metrc manifest ties to an Apex transaction. Every Apex batch ties to a
   24-character Metrc tag. Every Apex buyer ties to a state licence. **Zero orphans on
   either side.** An unmatched row is never acceptable and never tolerated.

2. **Every difference must be EXPLAINED, and differences are expected.** Apex's sold price
   and Metrc's declared transfer price will differ, legitimately — that is the two systems
   doing their separate jobs. A difference with a named reason is reconciled. A difference
   with no reason is an open item and stays open until a person closes it.

**THE FAILURE MODE TO GUARD AGAINST IS FAKE 100%.** An agent told "it must be 100%" will
be tempted to reach it by fuzzy-matching product names, rounding quantities until totals
tie, or quietly excluding rows that will not match. **All three are forbidden.** 100% is a
number you MEASURE, never a number you produce. If coverage is 94%, report 94% and name
the 6% — that is worth more than a 100% nobody can trust, and this platform has already
been bitten by every kind of false green there is.

**Build it as a full outer join, not an inner one.** `apex_metrc_reconciliation` carries
every row from both sides with a status: `MATCHED` · `APEX_ONLY` · `METRC_ONLY` ·
`QTY_DIFF` · `PRICE_DIFF` · `EXPLAINED`. An inner join makes orphans invisible, which is
precisely the shape of every silent failure found on this platform so far.

Then `v_reconciliation_coverage` publishes the percentage and the counts, and a gate in
`tools/checks/` **fails when coverage falls below 100% or unexplained rows exist**. Break
it on purpose once to prove it catches that.

**Units are the trap.** Apex counts units and cases; Metrc holds quantity with a uom that
may be weight or count. **Never add units to pounds.** Use `f_quantity_text(qty, uom)` and
cross-check totals against `v_countable_inventory`. 18,822 units across 143 packages once
published as nothing because a weight conversion nulled every countable row.

### THE RECIPIENT GAP — CHECK WHICH TABLE BEFORE YOU REPEAT THE OLD CLAIM

The widely-repeated statement *"all 2,550 outgoing manifests have a null recipient"* is
**true of `metrc_transfers` (the API sync) and FALSE of the report import.** Measured
9 Aug 2026 on `metrc_rpt_transfer_manifests`:

| direction | rows | destination licence present |
|---|---|---|
| outbound | 4,072 | **4,072 — all of them** |
| inbound | 1,208 | 134 (the rest are inbound to us, so no destination is expected) |

**We can see where outbound product went.** The report import filled the hole the API sync
left, and `metrc-delivery-detail` already exists as an edge function to fetch licence
numbers where the list endpoint gives only a drifting facility NAME — *"Nova Farms LLC"*
and *"Nova Farms, LLC"* are the same company; the licence number is the only safe key.

**So: reconcile customers on `destination_licence` from the report table, never on
facility name, and never assume the API table's nulls are the whole story.** The two
Metrc tables must themselves be reconciled against each other — that disagreement is a
finding in its own right, and it is the reason this paragraph had to be rewritten.

### THE DISCREPANCIES THAT ALREADY EXIST — YOUR STARTING BASELINE

Measured 9 Aug 2026. `weight_variance` is a **PERCENTAGE, not a weight** — summing that
column gives a meaningless number, and doing so is the unit error this house has made
before.

| | outbound | inbound |
|---|---|---|
| manifests with non-zero weight variance | 148 | 7 |
| …of which received weight is **0** (unconfirmed, not necessarily lost) | 88 | 6 |
| …**genuine both-sides disagreements** | **60** | **1** |
| absolute gap on those | **6.0934 lb** | **16.00 lb** |
| manifests with a count variance | 17 | 1 |

**That is the real reconciliation baseline: 61 manifests where both sides carry a weight
and disagree, and 94 that were never confirmed received.** `v_issue_unconfirmed_manifests`
already tracks the second group. **An unconfirmed manifest is not a discrepancy — do not
merge the two categories**, and do not report 148 as if it were 60.

---

## 5. HARD RULES ON THIS WORK

1. **Metrc stays read-only. Forever.** No writes, no exceptions. Where a Metrc write is
   needed the agent produces step-by-step instructions and a person does it.
2. **Apex writes are permitted and are NEVER automatic.** `ai_write_policy` already
   carries `apex: writes_allowed=true, requires_approval=true`. Every write goes through
   `f_ai_may` and lands in `ai_action_log`. **`create:shipping-orders` is the most
   dangerous scope on this platform** — it can create a real commercial order against a
   real licensed buyer. Ship the connector read-only and leave every write scope off
   until the owner turns it on deliberately.
3. **RLS on every new table, at creation.** Postgres defaults it off and three tables
   shipped wide open on 7 Aug.
4. **A zero from Apex may be a scope denial, not an absence.** `view:netterms` could be
   revoked tomorrow and the feed would go quiet, not loud. Distinguish "no rows" from
   "not permitted" and surface the difference.
5. **What runs in production is in the repository, committed in the same breath.**
6. **Do not touch the theme.** Owner-locked.
7. **Do not build the UI first.** The Sales dashboard currently renders Metrc package
   counts. Leave it until real Apex rows exist, then switch it over in one move — a
   half-populated sales page showing a partial revenue figure is worse than one showing
   none, because somebody will quote it.
8. **Say what you did not do.** Every scope you could not reach, every field you could
   not map, every figure you could not verify.

---

## 5A. COAs AND MANIFESTS — DOUBLE-CHECK OR GREATER (Owner, 9 Aug 2026)

> *"all coa's and manefists need double check system or greater with agent and gaurd."*

**Every COA and every manifest is verified by at least two INDEPENDENT paths, and where
they disagree the disagreement is the finding.** One path that agrees with itself is not a
check — the `ownership.confirmed_not_ours` gate counted rows of the view it was checking
and could only ever pass.

**The three paths, and they must be genuinely independent:**

1. **The document itself** — the parsed PDF (`coa_extract` 983 rows, `manifest_extract`
   764 rows). What the paper says.
2. **The API record** — Metrc's transfer and package data, and Apex `dealdocs`. What the
   systems say.
3. **The link** — `v_item_documents` / `v_document_package_link`, which attaches 2,642
   manifest documents by deriving the join from `metrc_rpt_package_transfers`. What the
   database believes connects to what.

Agreement is required on the fields that carry risk: **package tag, quantity, recipient
licence, potency, test date, and validity date.** Two paths agreeing is the floor. Three
where all three exist. Never fewer than two, and never two that share a source.

**A guard, not just an agent.** The agent verifies; a gate in `tools/checks/` fails the
build. Verification that depends on somebody choosing to run it is not verification. At
minimum it must fail on:

- a document attached to the wrong package
- an item flagged sellable on a COA past `coa_valid_until`
- an item tested or sold whose status is not COMPLETE
- a manifest whose parsed recipient contradicts the API recipient

**Traps already documented — an agent that does not know these will produce confident
wrong answers:**

- **Never read `metrc_documents.package_tag` for a manifest.** It is null on all 2,690 and
  always will be, because one manifest covers many packages and one column cannot hold that.
- **`pdftotext -layout` offsets labels and values by one line.** Anchor on licence
  patterns — `MX` transporter, `IL` lab, otherwise destination — **never on the adjacent
  label.** 2,683 manifest PDFs are on disk and do print the destination.
- **Never store, cache or render a `download_url`.** All 3,666 were signed together and
  expire 5–6 Sep 2026 — every print button on the platform would die on one day. Use
  `f_item_documents(tag)`, which returns `storage_path`, and mint a signed URL at click time.
- **The FILE is permanent; `coa_valid_until` is not.** That date is the real one-year
  regulatory validity of the lab result — **736 packages are past it, 2 still active.**
  Product cannot be sold on an expired certificate. Records are still kept and sent years later.
- **Current item status: COMPLETE 869 · COA only 1,219 · MANIFEST only 419 · NEITHER
  1,067.** Anything tested or sold that is not COMPLETE **must not go to a customer**.

Every item sold carries **both** its COA and its manifest, both reach the customer before
it ships, and both are the defence in a vendor billing dispute.

---

## 6. INVENTORY — THE FILTERS AND FIELDS APEX ALREADY HAS AND WE DO NOT

Observed on Apex's own Inventory screen, 9 Aug 2026: **142 records.**

- **Filters:** Archived Status · Brands · Category · Cultivars · Potency · Price ·
  Products · Product Type · Quantity — **plus more behind the chevron**, plus a
  "Manage Filters" editor.
- **Columns:** Name · Brand · SKU · Category · Type · Quantity · Price, with **Edit
  Columns** (per-user column choice) and **Show Batches** (expand to batch level).
- **Saved views:** "Add View (1/50)" — up to fifty named, saved filter sets.
- **Per row:** a batch-count badge and a document-count badge.
- **Quantity is three numbers in one cell:** units on hand, the same in cases, and
  **open orders**. **Price is per case**, not per unit ($240 on a case of 24).

### What our schema can answer, and what it cannot

`skus` holds sku_code, name, category, pack_size, uom, unit_cost, wholesale_price, active.
Against the Apex screen that leaves us **missing**:

| Apex field / filter | our position |
|---|---|
| **Brand** ("Twisted Buds") | **nothing anywhere.** This platform has no concept of a brand. |
| **Product Type** ("A Bud") | nothing |
| **Cultivar** on the item | `cultivars` exists and `lots.cultivar_id` links — reachable for a LOT, not for a SKU |
| **Potency** on the item | in `coa_extract` / `v_potency_vs_coa` — reachable via the COA, not on the item |
| **Open orders / committed qty** | **nothing.** No allocated or committed quantity exists, because no sales order has ever existed. |
| **Price per case** | `wholesale_price` — basis unrecorded. Per unit or per case is not stated, and that is rule A5. |
| **Archived status** | `skus.active` boolean — adjacent, not the same thing |
| **Saved views / column choice** | nothing |

### Two things on that screen worth stopping for

1. **Open orders exceed quantity on hand on several lines.** XJ-13 reads 0 on hand
   against 864 open; Orange Cream 336 against 840; MAC 1 zero against 24. That is either
   ordinary make-to-order or it is oversold, and **the platform cannot tell you which,
   because it holds no committed quantity at all.** Make on-hand vs committed vs available
   a first-class tile. **Verify it from the API — these figures come off a screenshot and
   a screenshot is not a measurement.**

2. **The SKU column is blank on every visible row.** If Apex SKUs are genuinely unset,
   **SKU cannot be the join key** and name-matching across "Twisted Buds - Flower 3.5g -
   Orange Cream (Sold In Case Of 24)" is far too brittle to carry money. Join on the Apex
   product id through an explicit crosswalk table, and on batch → Metrc tag. Confirm
   whether SKUs are empty or merely hidden on this view before concluding either.

### Build the filters as data, not as JSX

A filter list hard-coded into a component means every new filter is a code change, a
review and a deploy. Apex has a "Manage Filters" editor for a reason. Put the filter
registry in a table — field, label, type, source column, options query — so adding a
filter is configuration. Same for saved views and column choice, stored per user.

---

## 7. FILE ARCHITECTURE — OWNER RULING, 9 AUGUST 2026

> *"I dont want to build code files so huge that if something breaks it all goes down."*

Correct, and it is already the largest structural risk in this repository: **`App.jsx` is
9,728 lines.** There are three distinct failure modes behind that sentence and only one
of them is currently covered. Do not conflate them.

1. **A section crashes at runtime — ALREADY COVERED.** `Boundary` (`App.jsx:474`) catches
   a thrown error inside any section, renders *"This section hit an error — the rest of
   the OS is unaffected"*, records it as a finding automatically and offers a retry.
   `RootBoundary` catches the shell. **Render every Sales screen inside `Boundary` and a
   Sales crash cannot white-screen the platform.**

2. **The build fails — NOT COVERED.** One syntax error anywhere fails `vite build` and
   Netlify ships nothing at all. Smaller files do not prevent this, but they shrink the
   surface and make it obvious which module broke.

3. **Two agents edit the same file — NOT COVERED, and this is the real one.** At 9,728
   lines, an agent editing Sales is touching the same file that holds Cultivation,
   Finance and HR routing. This nearly cost work twice in one day.

**HR already set the right precedent** — `roster.jsx`, `hrdash.jsx`, `empfile.jsx`,
`schedbuild.jsx`, `timesheets.jsx`, `hrqueue.jsx`, all 220–290 lines. Follow it exactly.

### ONE ACCOUNT. ONE OF EVERYTHING. (Owner ruling, 9 Aug 2026)

> *"maybe I think own module within repo… just not own supa, repo or netlify I only want
> one account for all."*

Sales is **a module inside this repository** — a directory, not a second system.

- **One Supabase project** — `fxetuqjryttnypgepsru`. Apex tables live in `public`
  alongside everything else. No second project, no separate database, no external store.
- **One GitHub repository.** No submodule, no second repo, no separate npm package, no
  monorepo split.
- **One Netlify site.** No second site, no separate deploy, no preview-only branch that
  becomes a permanent shadow copy.
- **One login.** Sales uses the same Supabase Auth users, the same `app_users` roles and
  the same RLS policy style as every other department.

"Module" here means **a folder and a clean boundary**, nothing more. If any part of this
work seems to need its own project, site or account, **stop and ask the owner** — do not
create one. Fragmenting the estate is the failure he has explicitly ruled against, and it
is how a day's work ends up invisible while somebody refreshes a page.

**MANDATE — Sales ships as its own directory. `App.jsx` receives imports and route
entries and nothing else.**

```
src/sales/
  index.jsx        route table + Boundary wiring — thin
  inventory.jsx    the inventory grid
  filters.jsx      the filter engine, data-driven
  orders.jsx       shipping + receiving orders
  pipeline.jsx     dealflow, stages, leads
  reconcile.jsx    Apex vs Metrc disagreements
  apex.js          data access only, no JSX
```

Soft ceiling **400 lines per file**. If a file needs more, it is doing two jobs.

Add `React.lazy` + `Suspense` per module — there is currently **no code splitting in this
app at all**. Two wins: a module's code is not parsed until somebody opens it, and the
initial bundle shrinks, which the owner has asked for repeatedly on speed grounds.

Then a gate: **`tools/checks/file-size-ceiling.mjs`**, failing when a source file crosses
its ceiling. Grandfather `App.jsx` at its current line count as a **ratchet that may only
shrink** — so it can never quietly grow back, and every extraction locks in its gain.

---

## 7A. THE SALES MODULE — BUILT LIKE HR, FULLY CUSTOM (Owner, 9 Aug 2026)

> *"like HR this must build unique dashboard and module fully custom with tons of tiles,
> visuals kpi's so we can run sales and our entire sales team and commissions, crm."*

**Share primitives, never layouts.** A roster is not a ledger is not a punch log, and a
sales dashboard is none of the three. Do **not** route Sales through a generic report
screen — 522 pages through one shared screen is the documented CAUSE of the bugs on this
platform, not a shortcut around them. Build a `tile()` primitive local to the module, the
way `hrdash.jsx` does, and lay the page out for what sales actually is.

**Copy HR's shape exactly** (`hrdash.jsx`, 281 lines): parallel `Promise.all` load, one
`useMemo` deriving every metric, a local `tile(key, label, value, unit, tone, foot, drill)`
where **every tile drills into its records**, and an `assign` state so a task can be raised
from any tile.

```
src/sales/
  salesdash.jsx    the Sales dashboard — tiles, KPIs, visuals
  inventory.jsx    Apex inventory grid, filters, saved views
  orders.jsx       shipping + receiving orders
  crm.jsx          deals, stages, leads
  customer.jsx     the customer file (the empfile.jsx of sales)
  commissions.jsx  rep plans, ledger, approvals
  reconcile.jsx    Apex vs Metrc
  filters.jsx      the filter engine, data-driven
  apex.js          data access only, no JSX
```

### ⚠ NAME COLLISION THAT WILL CORRUPT PRODUCTION DATA

**`pipelines`, `pipeline_stages`, `pipeline_runs`, `pipeline_stage_events` and
`v_pipeline_stage_aging` are ALL TAKEN BY MANUFACTURING.** They model production runs, not
deals. An agent that sees the word "pipeline", assumes CRM and writes to them will corrupt
manufacturing.

**Name the CRM tables `sales_deal`, `sales_deal_stage`, `sales_stage_event`,
`sales_lead`.** Never `pipeline*`.

### COMMISSIONS — NOTHING EXISTS. ALL OF IT IS NEW.

There is no commission, quota, territory or sales-rep table anywhere. New:

- `sales_rep` — employee_id, territory, quota, effective dates
- `commission_plan` — basis, effective dates, who approved it
- `commission_rule` — tiers, rates, and what they apply to (brand, category, customer)
- `commission_ledger` — order line → rep → basis amount → rate → earned → status → approver

**Four rules that decide whether this is trustworthy or a lawsuit:**

1. **State the BASIS explicitly on every plan.** Gross revenue, net of discount, or cash
   actually collected are three different numbers. A plan that does not say which is a
   dispute waiting to happen, and rule A5 already requires a figure to carry what it is.
2. **Earned is not payable.** A commission accrues on the order and becomes payable only
   on the plan's trigger — usually collection. Otherwise a cancelled or unpaid order pays
   a commission that has to be clawed back from a person's wages.
3. **Commission is PAY, so it is HR, so it requires a human.** Owner ruling: *"ALL HR
   REQUIRES HUMAN."* The agent calculates and proposes; a person approves every time.
   Follow the `employee_rates.provisional` / `v_pay_rate_confidence` pattern — **an
   unapproved commission figure must be visibly provisional on screen**, never shown with
   the confidence of an approved one. 21 pay rates nobody approved were once presented
   exactly like rates somebody had.
4. **Commission depends on price, and price comes from Apex.** If Apex shipping orders
   carry no line pricing, **commissions cannot be computed at all** — same blocker as
   revenue. Confirm it before building any of this.

### THE TILES — WHAT THE DASHBOARD MUST CARRY

Every tile obeys the dashboard hard rules: **actionable to ClickUp standard** (assign to a
named person with a due date and priority, carrying the number that triggered it **captured
as it stood at that moment**), **drills into its records**, and **replicates up** to
Control Tower and the Chief Executive Dashboard.

**Revenue & orders** — revenue MTD/QTD/YTD and against the same period last year · open
order value and the units behind it · average order value · average discount · on-time
ship rate against promised date · days sales outstanding (needs `netterms`).

**Inventory & fulfilment** — **on hand vs committed vs available**, which does not exist
today at all · **oversold lines** where committed exceeds available (XJ-13 currently reads
0 on hand against 864 open — the platform cannot presently tell you whether that is
make-to-order or oversold) · days of stock cover at current run rate · **ready-to-ship
blocked by COA**, i.e. anything not COMPLETE.

**Customers** — active, new this month, churned (no order in N days) · top customers by
revenue and **concentration percentage**, because one customer at 40% of revenue is a risk
that belongs on a tile · **credit limit utilisation** against `customers.credit_limit` ·
**customer licence expiry**, since a customer whose licence lapses cannot legally be sold to.

**CRM** — deals and value by stage · **stage ageing**, the deals sitting still · win rate ·
average days to close · leads created versus converted.

**Team & commissions** — revenue by rep against quota with attainment percentage ·
commission earned / accrued / approved / paid, kept as four separate numbers ·
**provisional (unapproved) commission flagged distinctly.**

**Compliance & reconciliation** — **Apex ↔ Metrc coverage %**, the 100% tile · open
discrepancies (baseline: 60 genuine both-sides, 6.09 lb) · unconfirmed manifests (88
outbound) · **COA expiry runway** (736 past `coa_valid_until`, 2 still active) · items sold
whose document status is not COMPLETE.

### NO TILE WITHOUT PROVENANCE

Every tile states **its source (Apex / Metrc / derived) and its as-of time.** A revenue
figure from Apex and a package count from Metrc must never sit side by side unlabelled.
That is precisely how $1,317,836 of *purchases* was read as revenue — the column existed on
both directions and did not say which.

---

## 7B. WHAT APEX IS, AND THE API CONTRACT (researched 9 Aug 2026)

Apex Trading is **B2B wholesale cannabis management software** — 8,000+ clients across 29
state markets. It is the seller's whole commercial front end, and it is where our money,
our buyers and our commissions already live.

**Seller feature set, as they name it:** Inventory Management · Order Management · Buyer
Management · Automated Compliance · Integrations · Reporting & Analytics · **Robust User
Permissions** · **CRM** · Branded Public Profiles · Branded Menus · Website Menu Widget ·
Marketplace. Their materials add: a **sales-rep database tracking who has been contacted
and who should be**, **email marketing**, **workflows & task management**, **COAs
auto-attached to invoices**, Metrc integration, QuickBooks integration, and an **invoicing
system that tracks income, salesperson commissions and accounts receivable.**

### The API contract — confirmed, not guessed

- **Auth:** `Authorization: Bearer <token>`. **`Accept: application/json` is required on
  every request.** Docs at `api-docs.apextrading.com`.
- **`/welcome` returns the token's permissions.** **Call it first, always.** It validates
  the key and enumerates scopes without touching a single record — the correct way to
  prove access before reporting anything as empty (rule A4).
- **The root resource is `company`.** The token resolves to a company and most models
  carry a `company_id`.
- **Orders carry BOTH `buyer_company_id` and `seller_company_id`** — direction is explicit
  in the data. We are the seller. Do not infer direction from anything else.
- **Incremental sync is `updated_at_from`.** First call from the date the company joined
  Apex, then only records changed since the last successful sync. Store the watermark per
  entity, and store it **only after the pull succeeds** — a watermark advanced on a failed
  pull creates a permanent hole nobody will ever notice.
- **⚠ PATCH IS SPARSE, AND A FIELD SET TO AN EMPTY VALUE IS SET TO NULL.** Sending `""`
  **erases** the field. Any write path must send only fields it intends to change and must
  never send empty strings for untouched ones. This alone justifies shipping read-only
  first.

### CORRECTION — AR IS FULLY AVAILABLE. I HAD THIS WRONG.

I inferred from the scope list that there was no invoice or payment data. **The OpenAPI
spec (`docs/apex/apex-openapi-3.1.json`, 106 endpoints) says otherwise.** There is no
`/invoices` resource because **invoicing and AR live ON the shipping order**:

`invoice_number` · `subtotal` · `total` · `additional_discount` · `delivery_cost` ·
`taxes` · `total_payments` · `total_credits` · `total_write_offs` · `total_trades` ·
**`payment_status`** · **`payments_currently_due`** · `due_date` · `net_terms_id`

…plus a full payments sub-resource at `/v1/shipping-orders/{orderID}/payments`
(`amount`, `payment_date`, `type`, `pay_type`, `status`).

**So days sales outstanding, AR ageing, credit exposure and paid-versus-due are all
computable.** The lesson stands and is the same one as the manifest recipients: **a scope
list is not a schema.** Read the contract before concluding a capability is missing.

### ⚠ EVERY MONEY FIELD HAS A `_raw` TWIN — DO ARITHMETIC ON `_raw` ONLY

`subtotal`/`subtotal_raw`, `total`/`total_raw`, `order_price`/`order_price_raw`,
`amount`/`amount_raw`, and so on throughout. The bare field is a **formatted display
string**; `_raw` is the number. **Summing the formatted one produces silent nonsense** —
the same class of error as summing `weight_variance` percentages. Every stored money value
comes from `_raw`, and the mapping gate must assert it.

### ⚠ APEX BILLS BY API CREDIT, AND NESTED RESOURCES ARE BILLABLE

`/v1/usage` returns `credits_used`, `monthly_credit_limit`, `request_count`,
**`billable_nested_resource_count`**, `throttled_request_count`, `error_4xx_count`,
`error_5xx_count`. Apex's own docs open with *"this will reduce the API fees your company
… may be charged."*

**Over-fetching costs real money and gets you throttled.** A shipping order can drag in
`items`, `buyer`, `payments`, `deal_flow`, `sales_reps`, `transporters`, `history`,
`notes`, `pricing_tier`, `term` — each nested resource billable. Therefore: **always use
`updated_at_from` deltas**, request only the nesting a job needs, **poll `/v1/usage` and
put credits-used-against-limit on the dashboard as a tile**, and never build a job that
re-pulls the world on a schedule.

### COMMISSIONS — ATTRIBUTION EXISTS, THE AMOUNT DOES NOT

`sales_reps` is on every shipping order. **But it carries only `name`, `phone`, `email` —
there is no rep id and no commission amount anywhere in the API.**

- **Commission amounts must be computed here.** Apex's invoicing shows them in its own UI;
  the API does not expose them. Ours will be the only machine-readable figure, so it must
  be right and it must be human-approved.
- **Match reps on EMAIL, never on name.** A name has no key and drifts exactly the way
  *"Nova Farms LLC"* / *"Nova Farms, LLC"* drifts. Map `sales_reps.email` to `employees`
  once, explicitly, and flag every unmatched rep rather than guessing.

---

## 7C. THE FULL SALES MODULE — THE ORDER LIFECYCLE IS THE SPINE

Everything below hangs off one path. Build the path first; the screens are views onto it.

**Quote → Order → Credit check → Allocation → COA gate → Manifest → Transport →
Delivery confirmation → Invoice → Payment → Commission**

**Every arrow is a gate that can refuse, and every refusal is visible with its reason.**

| stage | the gate | refuses when |
|---|---|---|
| Order accepted | **customer standing** | licence expired or expiring inside the delivery window; credit limit exceeded; account inactive |
| Allocation | **on hand ≥ committed** | stock is already promised elsewhere. This is the number that does not exist today. |
| COA gate | **document status COMPLETE** | no COA, no manifest, or **COA past `coa_valid_until`** — 736 packages are already past it |
| Manifest | **Metrc, by a human** | never automated. The platform produces step-by-step instructions and the person creates it. |
| Delivery confirmation | **shipped vs received** | count or weight variance — the 60 genuine disagreements are exactly this |
| Invoice | **priced and reconciled** | Apex price and Metrc declared price disagree without a reason |
| Payment | **net terms clock** | overdue rolls into AR ageing |
| Commission | **payable trigger** | earned but not collected, or not yet approved by a human |

### The screens

**`salesdash.jsx` — the dashboard.** Tiles per section 7A. First item in the Sales
category, replicates up to Control Tower and the Chief Executive Dashboard.

**`crm.jsx` — the deal desk.** Deals by stage with value, stage ageing, owner, next action
and last contact. Mirrors Apex `dealflows` / `buyerstages` / `buyerleads`. **A rep must be
able to see who has been contacted and who has not** — that is the single feature Apex
names for reps, and the reason a rep opens the screen at all.

**`customer.jsx` — the customer file.** The `empfile.jsx` of sales: licence and its expiry,
credit limit and live exposure, net terms, order history, price tier, documents sent, notes,
open deals, and **every manifest ever sent to them**. `v_customer_manifests` and
`v_customer_history` already exist — use them.

**`inventory.jsx` — the sellable catalogue.** On hand / committed / available, filters and
saved views per section 6, batch expansion, COA and manifest badges per line.

**`orders.jsx` — the order desk.** The lifecycle above, one row per order, showing which
gate it is sitting behind. Shipping and receiving orders both.

**`commissions.jsx` — plans, ledger, approvals.** Per section 7A, human-approved every time.

**`reconcile.jsx` — Apex vs Metrc.** Full outer join, zero orphans, every difference named.

### The price book — do not skip it

Wholesale runs on tiers: list price, customer-specific price, volume breaks, promotional
price, and **price per case versus per unit** ($240 on a case of 24 is $10 a unit, and the
two must never be confused). `skus.wholesale_price` exists as a single number with **no
recorded basis**, which is rule A5 unsatisfied. Model `price_list`, `price_list_entry` and
`customer_price_assignment`, and record on every order line **which price applied and why**
— because a discount nobody can explain is a commission dispute and an audit finding.

---

## 8. ORDER OF WORK

1. Confirm auth, base URL and one real payload per entity. Report the shape. **Stop here
   and report if `shipping-orders` carries no pricing** — that changes everything downstream.
2. `apex_raw` + RLS + the pull worker, read-only, all 14 read scopes.
3. Field-key census. Publish the map. Get the owner's eye on anything ambiguous.
4. `v_apex_field_coverage` + the failing gate.
5. Typed tables and added columns, from the census.
6. Reconciliation against Metrc manifests, packages and licences. Disagreements to their
   own table.
7. COA / manifest cross-check against `dealdocs`.
8. Dealflow / stage / lead model — the sales-channel pipeline.
9. Only then: the UI.

### ⚠ CORRECTED 9 AUG 2026 — THE FIGURES ABOVE WERE INFLATED BY SNAPSHOT VERSIONS

`metrc_rpt_transfer_manifests` is a REPORT SNAPSHOT table: the same manifest is
re-imported as it progresses, so weights and received dates change across rows. 975
manifest+direction groups hold more than one version and **every one of them differs in
content — zero are byte-identical.** They are versions, not duplicates, and deduping them
would delete transfer history.

I computed the baseline across all snapshots, which counted the same manifest several
times. Recomputed on the LATEST snapshot per (licence, manifest, direction):

| | outbound | inbound |
|---|---|---|
| manifests (latest only) | **2,355** — not 4,072 | **1,074** |
| non-zero weight variance | **86** — not 148 | 5 |
| …unreceived (variance is 100%) | 37 | 5 |
| …**genuine both-sides disagreements** | **49** — not 60 | **0** — not 1 |
| absolute gap on those | **5.5977 lb** | **none** |

**Always reduce to the latest snapshot before counting anything from this table.** The
inbound 16.00 lb figure I reported earlier was a superseded snapshot and does not exist in
current data.
