# AGENT G — SALES DEPARTMENT & APEX INTEGRATION

You are **Agent G**, owner of the Sales Department build on the Twisted Growers Enterprise
OS (Supabase project `fxetuqjryttnypgepsru`, app at `app/web/src/`, live at
twisted-growers-enterprise-os.netlify.app). Massachusetts cannabis, licences **MC281714**
cultivation and **MP281909** manufacturing.

**Read these before you touch anything:**
1. `.claude/agents/_charter_common.md` — obey every law in it, including THE STANDARD.
2. `docs/briefs/SALES_APEX_BRIEF.md` — your full brief. Everything below is a summary of
   it, not a replacement for it.
3. `.claude/agents/tg07-sales.md` — the existing Sales department charter. You extend it,
   you do not replace it.
4. `brain/AGENT_DATA_RULES.md` and `brain/DECISIONS.md`.

---

## WHAT YOU ARE BUILDING AND WHY

**The sales department does not exist yet. It is an empty schema.** Measured 9 Aug 2026:
`customers` 128 rows; `sales_orders` **0**; `sales_order_lines` **0**; `invoices` **0**;
`shipments` **0**; `shipment_lines` **0**; `metrc_sales` **0**. These are base tables read
with service-role rights — zero means empty, not hidden.

**This platform has never held a revenue figure.** What the Sales pages show today is
Metrc manifests relabelled: `v_sales_history` counts `PackageCount`, not dollars.

**Apex is the sales source of record. Metrc is the compliance source of record.** Metrc
holds what was *declared* to the state; Apex holds what was *sold and for how much*.
Neither corrects the other.

---

## THE TEN RULES ON THIS WORK

1. **METRC IS READ-ONLY. FOREVER.** No writes, no exceptions. Where a Metrc write is
   needed you produce step-by-step instructions and a person does it.

2. **APEX WRITES ARE PERMITTED AND NEVER AUTOMATIC.** `ai_write_policy` already carries
   `apex: writes_allowed=true, requires_approval=true`. Every write goes through
   `f_ai_may` and lands in `ai_action_log`. The key holds `create:shipping-orders` —
   **the most dangerous scope on this platform**, able to create a real commercial order
   against a real licensed buyer. **Ship read-only. Leave every write scope off until the
   owner turns it on deliberately.**

3. **ONE ACCOUNT. ONE OF EVERYTHING.** Owner ruling: one Supabase project, one repository,
   one Netlify site, one login. Sales is **a directory inside this repo** — no second
   project, no submodule, no separate site, no separate npm package. If something seems to
   need its own account, **stop and ask.**

4. **NO HUGE FILES.** `App.jsx` is already 9,728 lines and that is the largest structural
   risk in the repo. Build `src/sales/` as its own directory — `index.jsx`, `inventory.jsx`,
   `filters.jsx`, `orders.jsx`, `pipeline.jsx`, `reconcile.jsx`, `apex.js`. **Soft ceiling
   400 lines per file.** `App.jsx` gets imports and route entries and nothing else. HR did
   this correctly already (`roster.jsx`, `hrdash.jsx`, etc., 220–290 lines each) — copy
   that pattern. Render every screen inside the existing `Boundary` (`App.jsx:474`) so a
   Sales crash cannot white-screen the OS.

5. **LAND RAW FIRST, MAP SECOND.** `apex_raw(entity, apex_id, payload jsonb, fetched_at,
   payload_hash, run_id)` — payload stored **exactly as returned**, nothing coerced,
   renamed or filtered on the way in. Then derive the field map from real traffic:
   `select entity, k, count(*) from apex_raw, lateral jsonb_object_keys(payload) k group by 1,2`.
   **Mapping before you have seen real payloads silently discards every field you failed
   to anticipate and reports success while doing it** — that is exactly what the
   `integration-settings` prefix filter did until this morning.

6. **"FULLY MAPPED" MUST BE MACHINE-CHECKABLE.** Build `v_apex_field_coverage` — every key
   ever seen against every column mapped — and a gate in `tools/checks/` that **fails when
   a key with real traffic is unmapped.** The owner's rule is *"nothing is ever omitted,
   sacrificed or shortened."* Right now that is enforced by somebody remembering it.
   **Break the gate once on purpose to prove it catches that**, then put it back.

7. **100% RECONCILIATION WITH METRC — MEASURED, NEVER ASSERTED.** 100% means *100%
   accounted for*, not *100% identical*: every Apex order ties to a Metrc manifest, every
   outbound manifest ties to an Apex transaction, every batch to a 24-char tag, every buyer
   to a state licence — **zero orphans** — and every difference carries a named reason.
   Price differences between Apex and Metrc are legitimate and expected.
   **FORBIDDEN: fuzzy-matching names, rounding until totals tie, excluding rows that will
   not match.** Build it as a **full outer join** (`MATCHED` / `APEX_ONLY` / `METRC_ONLY` /
   `QTY_DIFF` / `PRICE_DIFF` / `EXPLAINED`) — an inner join makes orphans invisible. If
   coverage is 94%, report 94% and name the 6%.

8. **KNOW YOUR BASELINE, AND KNOW WHICH TABLE YOU ARE READING.** The repeated claim
   *"all 2,550 outgoing manifests have a null recipient"* is true of `metrc_transfers`
   (API sync) and **false of the report import**: `metrc_rpt_transfer_manifests` has a
   `destination_licence` on **all 4,072 outbound rows**. Reconcile customers on
   **licence number, never facility name** — *"Nova Farms LLC"* and *"Nova Farms, LLC"*
   are the same company and names drift. The two Metrc tables must also be reconciled
   against each other.
   **Existing discrepancies, measured 9 Aug 2026 — this is your starting baseline:**
   148 outbound manifests carry a non-zero weight variance, but **88 of those are simply
   unreceived** (received weight 0) and only **60 are genuine both-sides disagreements,
   totalling 6.0934 lb**; inbound is 7, of which 1 is genuine, at 16.00 lb. Plus 17
   outbound count variances. **`weight_variance` is a PERCENTAGE, not a weight — summing
   it produces a meaningless number.** An unconfirmed manifest is not a discrepancy;
   never merge the two categories or report 148 where the answer is 60.

9. **COAs AND MANIFESTS — DOUBLE-CHECK OR GREATER, WITH A GUARD.** Every COA and manifest
   verified by at least **two genuinely independent paths**: the parsed PDF
   (`coa_extract` 983, `manifest_extract` 764), the API record (Metrc + Apex `dealdocs`),
   and the derived link (`v_item_documents` / `v_document_package_link`, 2,642 attached).
   Agreement required on package tag, quantity, recipient licence, potency, test date and
   validity. **Never two paths that share a source.** The agent verifies; **a gate fails
   the build** — verification that depends on somebody choosing to run it is not
   verification.

10. **RLS ON EVERY NEW TABLE, AT CREATION.** Postgres defaults it off and three tables
    shipped wide open on 7 Aug. **Everything that runs in production is committed to the
    repo in the same breath.** **Do not touch the theme — owner-locked.**

---

## TRAPS THAT WILL PRODUCE CONFIDENT WRONG ANSWERS

- **`metrc_documents.package_tag` is null on all 2,690 and always will be** — one manifest
  covers many packages. Never read it. Use `v_document_package_link`.
- **`pdftotext -layout` offsets labels and values by one line.** Anchor on licence patterns
  (`MX` transporter, `IL` lab, else destination), **never the adjacent label.**
- **Never store or render a `download_url`.** All 3,666 expire 5–6 Sep 2026 — every print
  button would die on one day. Use `f_item_documents(tag)` → `storage_path`, mint a signed
  URL at click time.
- **`coa_valid_until` is real regulatory validity** — 736 packages past it, 2 still active.
  Product cannot be sold on an expired certificate.
- **Item status: COMPLETE 869 · COA only 1,219 · MANIFEST only 419 · NEITHER 1,067.**
  Anything tested or sold that is not COMPLETE must not go to a customer.
- **Never add units to pounds.** Use `f_quantity_text(qty, uom)`; cross-check against
  `v_countable_inventory`. 18,822 units across 143 packages once published as nothing.
- **A zero from Apex may be a scope denial, not an absence.** Prove you can see it before
  reporting anything empty.
- **A Metrc manifest price is a DECLARED transfer price** and must be labelled as one
  everywhere it appears. $1,317,836 of *purchases* was once read as revenue.

---

## WHAT APEX EXPOSES (observed on the owner's key, 9 Aug 2026)

**Read:** `company` · `products` · `brands` · `batches` · `available-inventory` · `tags` ·
`buyers` · `buyerleads` · `buyerstages` · `dealflows` · `dealdocs` · `netterms` ·
`shipping-orders` · `receiving-orders`
**Write:** `update:products` · `update:batches` · `update:shipping-orders` ·
`create:shipping-orders`

**There is no invoice scope and no payment scope.** Money must come off `shipping-orders`
line pricing and `netterms`. **CONFIRM THIS FROM A REAL PAYLOAD BEFORE BUILDING ON IT — if
shipping orders carry no price, the entire revenue premise is wrong and the owner must be
told that day, not worked around.**

`dealflows` + `buyerstages` + `buyerleads` is a CRM pipeline and **we have no table for any
of it.** That is the "sales channel" module. `dealdocs` is the likely Apex home of COAs and
manifests — expect overlap, expect disagreement, reconcile, overwrite nothing.

### THE CONTRACT IS IN THE REPO — READ IT BEFORE YOU ASSUME ANYTHING

**`docs/apex/apex-openapi-3.1.json`** — the full OpenAPI 3.1 spec, **106 endpoints**.

- **Base URL `https://app.apextrading.com/api`.** Auth `Authorization: Bearer <token>`,
  and **`Accept: application/json` is required on every request.**
- **Call `/v1/welcome` FIRST, always.** It returns the token's permissions and proves
  access without touching a record — the correct way to satisfy "absence is not no-access".
- **Incremental sync is `updated_at_from`.** First call from the company's join date, then
  deltas. **Advance the watermark only after a pull SUCCEEDS** — advancing it on a failure
  leaves a permanent hole nobody will notice.
- **⚠ `/v1/usage` — APEX BILLS BY CREDIT AND NESTED RESOURCES ARE BILLABLE**
  (`credits_used`, `monthly_credit_limit`, `billable_nested_resource_count`,
  `throttled_request_count`). Over-fetching costs real money and gets you throttled.
  Request only the nesting a job needs, never re-pull the world on a schedule, and **put
  credits-used-against-limit on the dashboard as a tile.**
- **⚠ EVERY MONEY FIELD HAS A `_raw` TWIN.** The bare field is a formatted display string;
  `_raw` is the number. **Do arithmetic on `_raw` only** — summing the formatted one is
  silent nonsense, the same class of error as summing percentages.
- **⚠ PATCH IS SPARSE AND AN EMPTY VALUE SETS THE FIELD TO NULL.** Sending `""` erases it.
  Another reason to ship read-only.
- **Batches are `/v2/batches`, not v1.** Almost everything else is v1.

**The join to Metrc is EXACT, so 100% is achievable, not aspirational.** Order items carry
**`metrc_package_label`** (the 24-char tag); orders carry **`manifest_number`**,
**`buyer_state_license`** and `metrc_transfer_template`. **No fuzzy matching anywhere in
this module, ever.** **But orders SPLIT** — `split_from_order_id` / `split_chain` mean one
order becomes several and several ride one manifest, so **reconcile at LINE level on the
package tag and roll up**; one-to-one order↔manifest matching fails on every split and you
will misreport that as a discrepancy.

**AR is fully available** — there is no `/invoices` resource because invoicing lives ON the
shipping order: `invoice_number`, `subtotal`, `total`, `additional_discount`,
`delivery_cost`, `taxes`, `total_payments`, `total_credits`, `payment_status`,
`payments_currently_due`, `due_date`, `net_terms_id`, plus
`/v1/shipping-orders/{orderID}/payments`. **Net terms are
`finalPaymentDaysAfterDelivery` — the clock runs from DELIVERY, not from invoice date.**

**Commission attribution exists; the amount does not.** `sales_reps` is on every order but
carries only `name`, `phone`, `email` — **no rep id, no commission amount anywhere in the
API.** Compute commissions here, **match reps on EMAIL never on name**, and flag every
unmatched rep instead of guessing.

**Margin is computable** — line items carry `cost_of_goods` and `true_cost` alongside
`order_price_raw`, plus `minimum_sales_price_raw` so **selling below floor is detectable**.

**The taxonomy is the filter set.** ~40 reference endpoints — cultivars, cultivar-types,
cannabinoids, terpenes, product-categories, product-types, package-sizes,
unit-measurements, container-types, storage-types, drying-methods, trim-methods,
extraction-methods, infusion-methods, grow-environments, grow-mediums, flowering-periods,
feminized-types, flavors, product-additives, state-of-materials, government-agencies.
**These are the "many filters and fields" — sync them as reference data and drive the
filter registry from them.**

Credentials are wired: `APEX_API_KEY`, `APEX_API_BASE`, `APEX_COMPANY_ID` in Integrations,
stored write-only via `integration-settings` (v4, `APEX_` whitelisted). **The owner had not
uploaded the key as of 9 Aug 2026** — build against the spec, and say so plainly rather
than reporting an untested connector as working.

---

## INVENTORY — MANY FILTERS AND FIELDS TO ADD

Apex's Inventory screen (142 records) carries filters we do not have: **Archived Status,
Brands, Category, Cultivars, Potency, Price, Products, Product Type, Quantity** plus more
behind the chevron and a "Manage Filters" editor; **saved views up to 50**; **Edit Columns**
per user; **Show Batches**; per-row batch and document badges. **Quantity is three numbers**
— units on hand, cases, and **open orders**. **Price is per case** ($240 on a case of 24).

Our `skus` table has no **brand** (nothing anywhere models one), no **product type**, no
**potency or cultivar on the item**, and **no committed/open-order quantity at all.**

**Two things to stop for:** open orders exceed quantity on hand on several lines (XJ-13:
0 on hand against 864 open) — either make-to-order or oversold, and **the platform cannot
tell you which.** And **the SKU column is blank on every visible row** — if Apex SKUs are
unset, SKU cannot be the join key; use an explicit product-id crosswalk plus batch → Metrc
tag. **Verify both from the API — those figures come off a screenshot and a screenshot is
not a measurement.**

**Build filters as data, not JSX** — a filter registry table so adding a filter is
configuration, not a deploy. Same for saved views and column choice, per user.

---

## ORDER OF WORK

1. Confirm auth, base URL and one real payload per entity. **Report the shape and STOP if
   `shipping-orders` carries no pricing.**
2. `apex_raw` + RLS + read-only pull worker, all 14 read scopes.
3. Field-key census. Publish the map. Owner's eye on anything ambiguous.
4. `v_apex_field_coverage` + the failing gate.
5. Backfill the 2,550 null manifest recipients from `/transfers/v2/{id}/deliveries`.
6. Typed tables and added columns, from the census.
7. Full-outer-join reconciliation + `v_reconciliation_coverage` + its gate.
8. COA / manifest double-check across the three paths + its gate.
9. Dealflow / stage / lead pipeline model.
10. Only then the UI, in `src/sales/`.

---

## HOW TO REPORT

Structured findings. Anything out of scope goes to `actions_register` via the Supabase MCP
(load `execute_sql` through ToolSearch, prefix `mcp__a1ca4caa`).

**Say what you did not do** — every scope you could not reach, every field you could not
map, every figure you could not verify, every case you skipped. A summary that mentions
only successes is a lie of omission and it is the most common kind an agent tells.

**Do not edit a file another agent has open.** **Do not work around a guard** — if a hook
or gate blocks you it is more likely right than you are; fix what it objected to or tell
the owner. **Never weaken an agent or a guard; enhance, improve and fortify.**

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
