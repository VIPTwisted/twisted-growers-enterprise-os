# Metrc call reduction and scan scheduling — 6 August 2026

Owner-directed. Rule **D1 still holds**: Metrc is the legal record, this platform
is a read-only mirror. Nothing here writes to Metrc.

---

## Why

The owner asked whether the platform was pulling from Metrc too aggressively.
Measured over 24 hours:

| Measure | Value |
|---|---|
| Sync operations logged | 1,898 |
| Records gained | 8,974 |
| Operations returning **nothing** | **1,778 — 93.7%** |
| Operations **failing** | **541 — 28.5%** |

The logged figure understates the true cost. Reading `metrc-sync`, each run walks
**20 sub-paths × 2 licences = 40 requests**, plus an auth probe and a facilities
check. At 96 runs a day that is **~4,000 HTTP requests**, before the nightly full
sync's ~1,099 pages. Real total: **~5,100 requests a day.**

## Two structural faults, not tuning problems

**1. The wrong licence was asked for plants.** Perfect split:

| Endpoint | MC281714 (cultivation) | MP281909 (manufacturing) |
|---|---|---|
| `harvests` | 108 calls, 0 failed | 108 calls, **108 failed** |
| `plantbatches` | 108 calls, 0 failed | 108 calls, **108 failed** |
| `plants` | 107 calls, 2,685 records | 101 calls, **101 failed** |
| `packages` / `transfers` | works | works |

A manufacturing licence holds no plants. Metrc returned 401 because the question
was invalid. **Not a permissions problem** — the owner confirmed full Metrc admin
rights. No credential can make that call succeed.

**2. Sales can never work.** Twisted Growers holds cultivation MC281714 and
manufacturing MP281909. **Neither is retail**, so `/sales/v2/receipts` returns 401
on both, 200 times a day.

Recorded for anyone tempted to re-enable it: **a wholesaler's sales are its
manifests.** Wholesale movement is a transfer, not a sales receipt. There is
nothing at that endpoint for this business.

~517 requests a day were structurally impossible.

## Overnight polling

Delta syncs ran every 15 minutes around the clock. Between 19:00 and 07:00 local
they made roughly 400 calls a week and retrieved **4 records**. Nobody is working
at 3am; a 56-day room cycle does not change overnight.

*(Caveat: `metrc_sync_runs` only holds 5–6 August — the project was created on the
4th — and the 8,084-record spike at midday on the 5th was the initial backfill,
not a daily pattern. The overnight conclusion is directionally sound but rests on
two days.)*

---

## What was built

### `metrc_scan_schedule` — owner-editable, config not code (rule G1)

Local wall-clock times in `America/New_York`, so 10:00 stays 10:00 across
daylight saving instead of drifting an hour twice a year.

| Scan | Endpoints | Times (Eastern) | Calls/scan | Calls/day |
|---|---|---|---|---|
| Manifests | transfers | hourly 08:00–17:00 | 8 | 80 |
| Packages | packages | 09:00, 12:00, 17:00 | 10 | 30 |
| Cultivation | plants, harvests, plantbatches | 10:00, 18:00 | 20 | 40 |
| Customer names | per-manifest delivery walk | 10:00, 18:00 | ~1 | 2 |
| Reference | items, strains, locations | 10:00 | 8 | 8 |
| **Sales** | — | **disabled** | 0 | **0** |

Each row also carries `display_name`, `what_it_pulls`, `why_it_matters`,
`when_to_pull_now` and `calls_per_scan` — so the settings page is driven by
editable rows, not hardcoded strings.

### `tg_metrc_dispatch()` — cron every 15 min, fires only what is due

Replaces `metrc-delta-sync` (*/15) and `metrc-deliveries` (*/10). Uses the Edge
Function's existing `?endpoints=` parameter, so **no function was redeployed.**

`metrc-nightly-full` (07:10) and `metrc-reference` (07:20) are **unchanged** —
the nightly full is the correctness guarantee that makes cutting daytime scans
safe rather than reckless.

### `tg_metrc_scan_now(job_name)` — manual pull

Owner-set: **administrators only** (owner, executive). **15-minute minimum gap
per group, waived if the last attempt failed** — a failure must always be
retryable. Every manual scan is attributed in `metrc_scan_log`.

### Result

| | Before | After | Saved |
|---|---|---|---|
| **Daytime scanning** | **~4,032** | **~160** | **96%** |
| Nightly full (safety net) | ~1,099 | ~1,099 | unchanged |
| **Total** | **~5,141** | **~1,269** | **75%** |

Verified live: a dispatch at 12:33 pulled the scoped endpoint set with
**no `sales` call**, against 12:30 on the old schedule which included it.

---

## Access control

`app_role` gained **`cfo`**. `tg_can_access_metrc_reports()` gates Metrc Reports
to **owner, executive and cfo only** — owner-set, on the grounds that these
reports carry potency, valuation and point-in-time inventory. `Report Import` and
`Imported Report Rows` are hidden from every other role in `nav_role_visibility`.

---

## Proposed rule additions for CLAUDE.md, group D

> **D4.** Never poll Metrc on a fixed timer without a cursor.
>
> **D5.** Every endpoint is bound to the licence *type* that can answer it.
> Plants, harvests and plant batches are cultivation-only. Sales requires a
> retail licence, which this business does not hold. A call is never made to a
> licence that cannot hold that record type.
>
> **D6.** Reference data is pulled once a day at most.
>
> **D7.** Empty results back off. An endpoint returning nothing for N consecutive
> runs lengthens its interval.
>
> **D8.** There is a daily call budget. When spent, the sync stops and raises a
> task; it never silently continues.
>
> **D9.** The raw JSON store is the source for the platform; Metrc is only the
> source for the store. Nothing re-pulls from Metrc to answer a question the
> stored JSON can already answer.
>
> **D10.** Pull windows follow the operation, not the clock. Metrc is not polled
> while the building is empty.
>
> **D11.** The nightly full sync is the correctness guarantee. Because it exists,
> every daytime scan is an optimisation, not a dependency.
>
> **D12.** On-demand scans are rate-limited and attributed.

D4 and D7's back-off are **partly already implemented** inside `metrc-sync`
(cursors in `configurations.metrc_sync_cursors`, 429 handling in `politeFetch`).

---

## OPEN — the important part

### The front-end buttons bypass all of this

`SyncCenter` and `runSync()` (App.jsx:5271) call Edge Functions **directly** with
the user's JWT. The 15-minute throttle, the admin check and the attribution log
**do not apply to any button on the site.** They must be rewired through
`tg_metrc_scan_now()` or the guard is decoration.

`runSync()` also has no scope, so one press costs ~42 calls whether you needed
one thing or everything.

### Lab results — one wrong column name is blocking defect D5

`metrc-lab-sync` calls `/labtests/v2/results?packageId=`, which returns analyte
values **and** a COA document id. It has never written a row:

| | |
|---|---|
| Code | `onConflict: "license, package_tag, test_name"` |
| Table | unique on `(license, package_tag, **test_type**, **result_date**)` |

Mismatch → *"no unique or exclusion constraint matching the ON CONFLICT
specification"*. It fails on the way **in**, after Metrc has answered.

**1,940 packages with completed results are waiting behind it**, plus 11 at the lab.

This qualifies HANDOFF.md D5, which states the only route to potency is the
report import. The *package* interface indeed carries no analytes — but
`/labtests/v2/results` is a different endpoint and does. **Unproven for these
licences:** the function has never succeeded, and the key already 401s elsewhere.
One test call with `limit=1` settles it.

### Reports is the real data source — and has never been used

The owner states most needed data is only available via Metrc **Reports**, not the
API. Consistent with the evidence: `items`, `strains` and `locations` return zero
records via API and hold zero rows, and `metrc-report-import` exists specifically
to "bypass the API blindspot".

**`metrc_report_imports`: 0. `metrc_report_rows`: 0. Nothing has ever been imported.**

`metrc-report-import` maps only `items`, `strains`, `locations`. **Lab Results and
Inventory Point-in-Time land in generic storage and are never mapped** — the two
reports that would close D5 and D6.

**Owner requirement (critical):** a Metrc Reports button in the Reports section
and on the CEO Dashboard, exposing *every* Metrc report and *every* filter, in
real time, restricted to administrators and the CFO.

### HARD RULE — owner-set 6 August 2026

> **Every report must be pulled or imported directly by the OS.**
> No manual export-and-paste. The platform fetches reports itself.

This is binding and it **rules out the manual-CSV route**, which was the only
one already working. It is also consistent with the existing rules: a file a
person exported, renamed and pasted cannot carry provenance the way a direct
pull can (**A2** — every figure carries its provenance; **A6** — verify against
the live system). A human in the middle is where staleness and error enter, and
it breaks the audit chain.

Routes that remain, honestly assessed:

1. ~~Manual export → import page~~ — **excluded by the hard rule above.**
   The `metrc-report-import` endpoint is still the correct *landing* pipe; what
   is excluded is a human carrying the file to it.
2. **Desktop bridge.** `bridge/sheet-sync.mjs` already reads a restricted Google
   Sheet through the owner's signed-in Chrome profile — precisely because that
   data is unreachable any other way. The same mechanism drives the Reports
   Control Panel: open the report, apply filters, take the export, post it to
   `metrc-report-import`. Because it drives the real interface it covers **every
   report and every filter by construction**, with no human in the middle.
   **This is the architecture the requirement points at.**
   Caveat: the bridge has never been tested end to end, and it is machine-local —
   reports only refresh while that machine is running.
3. **API.** Unknown whether Metrc exposes the Reports Control Panel
   programmatically. The existence of a hand-built CSV importer suggests not, but
   this has never been tested. **Settle this first** — if an endpoint exists it is
   far cleaner than the bridge: server-side, always available, no dependency on
   one desktop being switched on.

### SETTLED — probed against the live API, 6 August 2026

**There is no reports API.** Metrc's own published documentation for
Massachusetts (`https://api-ma.metrc.com/Documentation`, 163,452 bytes) contains
**zero report endpoints** — the only matches for "report" are four instances of
the field name `reportedAt`. Probes of `/reports/v2`, `/reports/v2/active` and
`/reports/v1/active` all return *Page Not Found*.

The user manuals cannot answer this either: 1.75M characters, **one** mention of
"API", in passing. They document the operator interface, not the integration.

**But the data behind those reports is available** — through endpoints this
platform does not call. The correct architecture is not to scrape Metrc's report
screens; it is to pull the source records and let the OS build the reports. That
satisfies the owner's hard rule directly: the OS pulls, with no human in the
middle.

| Need | Endpoint (documented, not yet used) | Closes |
|---|---|---|
| Potency, terpenes | `/labtests/v2/results` | **D5** |
| Certificate of analysis document | `/labtests/v2/labtestdocument/{id}` | **D5** |
| **Wholesale price per package** | `/transfers/v2/deliveries/{id}/packages/wholesale` | revenue from invoices, not assumed rates |
| Package adjustment history | `/packages/v2/adjustments`, `/packages/v2/adjust/reasons` | **D1** — the 6,796 lb moisture question |
| Manufacturing jobs | `/processing/v2/active`, `/inactive`, `/jobtypes`, `/adjust/reasons` | MP281909 is entirely unmirrored |
| Manifest PDF | `/transfers/v2/manifest/{id}/pdf` | evidence attachment |
| Lab test states / batches | `/labtests/v2/states`, `/labtests/v2/batches` | test status accuracy |

`/labtests/v2/types` was probed and returned **HTTP 200 with real data**, so the
lab namespace is reachable with the current key.

**One genuine exception remains:** D6, the 31 Dec 2025 point-in-time inventory.
No API can return a historical snapshot. Going forward the OS can snapshot itself
daily; the 2025 figure still requires the Metrc export.

**Decision:** build against these endpoints. The desktop bridge is not needed for
reports and should not be built for that purpose.

### PROBE RESULTS — every endpoint tested live, 6 August 2026

Owner confirmed a single API key covering both licences, so nothing below is a
key-scoping problem.

| Endpoint | Result | Verdict |
|---|---|---|
| `/labtests/v2/results` | **works** | **D5 CLOSED — see below** |
| `/transfers/v2/manifest/{id}/pdf` | **200, real PDF** (`FileContents` base64, `%PDF-1.3`) | manifests available |
| `/transfers/v2/deliveries/{id}/packages` | **200** — PackageId, Label, Type, SourceHarvestNames, SourcePackageLabels | manifest line detail available |
| `/packages/v2/adjustments` | **200** — PackageLabel, ItemName, **AdjustmentQuantity −6.0000 Grams**, reason | **speaks directly to D1** |
| `/labtests/v2/states`, `/labtests/v2/types` | 200 | metadata available |
| `/transfers/v2/deliveries/{id}/packages/wholesale` | **401 on both licences** | wholesale price NOT available |
| `/processing/v2/active` | **401** | manufacturing jobs NOT available |
| `/processing/v2/jobtypes` | 405 — GET unsupported | n/a |

### D5 IS CLOSED — the blocker was one missing index

`metrc-lab-sync` upserts with `onConflict "license,package_tag,test_name"`, but
the table only carried a unique on `(license, package_tag, test_type,
result_date)`. Every write was rejected on the way **in**, after Metrc had already
answered. Fixed **without redeploying the function** by adding the index the code
asks for:

```sql
create unique index metrc_lab_results_license_pkg_testname_key
  on metrc_lab_results (license, package_tag, test_name);
```

First run, 3 packages: **282 tests recorded, 224 certificates linked, zero errors.**

Real values landed — THCA 30.80%, 27.24%, 19.91%; Total Cannabinoids 21.18%;
THC, THCV, THCVA, Total CBD, Total Aflatoxins — each with pass/fail, result date
and laboratory (SafeTiva Labs LLC). COA links resolve to
`https://ma.metrc.com/reports/labtests/{id}/document`.

**This corrects HANDOFF.md D5**, which states no analyte values or COA URL are
obtainable and that the Metrc Lab Results report import is the only route. The
*package* interface indeed carries none — but `/labtests/v2/results` is a separate
endpoint and carries all of it.

**1,000 tested packages remain unwalked.** The backfill is roughly one API call
per package and has NOT been run — deliberately, given the call-reduction work in
this same change. It needs an explicit decision on pacing.

**Blocked on the owner:** the Reports Control Panel list — every report name and
its filters. That screen requires his login and cannot be enumerated from the
Metrc manual (searched, 1.75M characters, no reports catalogue — it is the
operational user manual).

### Other gaps

- **Wholesale price.** Transfer records carry counts, no money — checked every
  key in the stored JSON. Price sits at package-within-delivery level; records
  carry `DeliveryId` so the path is reachable but unproven. This is currently why
  revenue comes from owner-set rates rather than what was invoiced.
- **Processing / manufacturing endpoints.** MP281909 is held; nothing in the
  codebase touches any processing endpoint.
- **Package adjustments.** Never pulled. Speaks directly to D1's 6,796 lb
  moisture question.

## Rollback

```sql
select cron.unschedule('metrc-dispatcher');
select cron.schedule('metrc-delta-sync','*/15 * * * *', $$ select net.http_post(
  url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-sync',
  headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb, timeout_milliseconds := 300000) $$);
select cron.schedule('metrc-deliveries','*/10 * * * *', $$ select net.http_post(
  url := 'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/metrc-reference-sync?mode=deliveries&limit=60',
  headers := '{"x-admin-key": "tg-seed-8f3k2m-2026", "Content-Type": "application/json"}'::jsonb,
  body := '{}'::jsonb, timeout_milliseconds := 280000) $$);
```

---

# Document library, customer book and the email requirement

## HARD RULE — owner-set 6 August 2026

> Anything in the OS that has ever had, or will ever have, a **manifest** or a
> **certificate of analysis** must carry a link to it, sitewide, and that link
> must download and print.

Metrc's own document URLs (`ma.metrc.com/reports/labtests/{id}/document`) require
a Metrc login, so storing them does **not** satisfy this rule — a CFO clicking one
hits a sign-in wall. The documents are therefore fetched and stored in our own
bucket, and the platform serves its own links.

## Built

- **`metrc_documents`** + private Storage bucket `metrc-documents`. Each row keeps
  the storage path, SHA-256, byte size, source endpoint and — when a fetch fails —
  `fetch_error`, so absence is always explained (rule A3).
- **`metrc-documents`** Edge Function. Fetches COA PDFs
  (`/labtests/v2/labtestdocument/{id}`) and manifest PDFs
  (`/transfers/v2/manifest/{id}/pdf`, base64 in `FileContents`). Tries the
  package's licence first, then the other — a document may belong to either.
- **`v_package_documents`** — sitewide evidence view, one row per package, with
  the certificate, the manifest, and plain-English reasons when either is absent.
- **`v_document_library`** — searchable by manifest number, package tag, product,
  customer or laboratory.
- **`v_metrc_scan_settings`** — the live scan schedule: what runs, when it last
  ran, when it runs next, and whether a manual pull is currently allowed.
- Nav entries: **Metrc → Certificates & Manifests**, **Settings → Metrc Scan
  Schedule**, **Sales & Cash → Customer Book**. All three restricted to
  owner / executive / cfo.

First run, 3 of each: **3 COAs and 3 manifests stored, no errors.** COAs 498–617 KB,
manifests ~245 KB, each hashed.

**Overnight backfill scheduled** (`metrc-documents-backfill`, every 15 min
00:00–08:45 UTC = 8pm–4:45am Eastern, 200 documents a run). One-off: once the book
is walked it only picks up new documents. **Reduce it to twice daily afterwards.**

## Customer book — extracted from manifest history

128 licensees, every one built from real shipments: **109 retail dispensaries**,
1 cultivator, 1 laboratory.

The commercial detail is in the nested `_delivery` object, which was not being
used: **`InvoiceNumber`, `PaymentDueDate`, `PaymentTermDays`**, gross weight,
planned route, actual arrival and departure times. All 128 now carry a state
licence and payment terms; `v_customers` adds shipment count, packages sent, last
invoice, last manifest and a trading status.

## Email — the gap, stated plainly

**Metrc carries no customer email addresses.** Verified three ways:

1. Every key in every stored transfer record — `RecipientFacilityName`,
   `RecipientFacilityLicenseNumber`, driver and vehicle fields. No email, no
   phone, no address.
2. Zero matches for an email pattern across all 2,239 transfer records.
3. `/facilities/v2` does expose an `Email` field, but only for facilities the key
   owns — and it is null.

**Parsing the manifest PDF was attempted and did not work.** The `manifest-parse`
function inflates PDF streams by hand; on these documents it returned binary, and
the one "phone number" it found was the PDF creation timestamp. It also picked
incoming manifests, where the recipient is Twisted Growers itself. Needs a proper
PDF text library, and outgoing manifests, before it is worth another attempt.

**No email provider is configured** — no Resend, SendGrid, Postmark or SMTP secret
exists. So the send path needs: a provider account, addresses for 128 customers,
and the send function itself. `document_sends` is in place as the append-only
record of who sent what to whom.

**All 128 customers currently need an email address.** They cannot be derived —
rule A1 forbids inventing them.

---

# Clickable documents and real potency on the package record

## The buttons already existed — they were starved of data

`ProductIdentity` in App.jsx already renders:

```jsx
<Fact label="Certificate of Analysis" href={d.coa_url} hrefLabel="📄 Open the certificate" />
<Fact label="Manifest" href={d.manifest_url} hrefLabel={"🚚 Manifest " + …} />
```

They never appeared because `v_product_identity` sourced `coa_url` from
`coa_documents` and analyte values from `lab_result_values` — **both empty
tables**. The real data lands in `metrc_lab_results` and `metrc_documents`.
**No front-end change was needed.**

That view also carried a note claiming *"the Massachusetts Metrc API does not
return THC, CBD or terpene values on a package"*. Disproved today.

## Fixed in `v_product_identity` (create or replace, columns appended only)

- `coa_url` → our signed link. The 📄 button now renders.
- `manifest_url` → our stored copy first, Metrc's login-walled URL only as fallback.
- `total_thc`, `total_cbd`, `total_terpenes` → from `metrc_lab_results`.
- **Duplicate rows fixed.** It returned two rows per tag while App.jsx calls
  `.maybeSingle()`, which errors on more than one — so this panel was failing.
  Joins are now `lateral … limit 1`.

## The Retest trap

Every `Retest` row on a passing package reads **0.0000** across every analyte —
a placeholder, not a measurement. Ordering by date alone picked the zero and
showed **0.00% THC on tested flower**.

`f_lab_value(tag, prefix)` now prefers the primary test and falls back to a
Retest only when no primary exists, returning the test name and date with the
value. Appended columns `thc_from_test`, `thc_tested_on`, `terpenes_from_test`,
`terpenes_tested_on` and `potency_provenance` put the source on the record
(rule A2).

Package `1A40A0300011815000000775`, before and after:

| | Before | After |
|---|---|---|
| Total THC | 0.00 (Retest placeholder) | **20.07** |
| Total Terpenes | not shown | **2.95** |
| Laboratory | not recorded | **SafeTiva Labs LLC** |
| Analytes | 0 | **130** |
| Certificate | "awaiting the laboratory result" | **click to open, print or send** |

Provenance reads: *From "Total THC (%) Raw Plant Material" recorded 2026-06-12.*

## Downloads

The bucket is private — manifest numbers run sequentially, so a public bucket
would let anyone walk them and read customers and quantities. Each document
carries a **signed link valid 30 days**, refreshed by `metrc-document-links`
(cron, 05:30 daily). Verified: **HTTP 200, 542,004 bytes, application/pdf,
%PDF-1.4**, no login, downloading as *"Certificate of Analysis
1A40A0300011815000000775.pdf"*.

`v_customer_manifests` was rewritten the same way: `manifest_download` serves our
copy first, and `certificate_of_analysis_links` now carries real downloadable
links instead of nulls.

## Removed

The **Customer Book** page and the **Sales & Cash** category were mine and
duplicated what already exists (Customers, Customer History, Customer Manifests
& Documents, all under Finance). Both deleted. The existing Customers page reads
the `customers` table, now populated with 128 licensees, their state licences and
payment terms.

---

# Seed-to-sale for bought-in material, and two access bugs

## Owner requirement, 6 August 2026

> Seed to sale must pull third-party history from the COA and the manifest. Even
> on our own material, if any field is blank it must scan the certificate and the
> manifest. It must also pull in our testing scores and the manifest data of sale.

## Two bugs found

**`tg_trace` was not `SECURITY DEFINER` and had no `search_path`** — a rule E5
violation. It therefore ran under the caller's RLS, and `TraceDrawer` swallows any
error as `[]`, so the drawer showed *"No chain recorded in Metrc"* while the same
call returned **131 events** as the service role. A silent failure presented as a
finding.

**`is_executive()` is `current_app_role() in ('owner','executive')`** — it does not
include the `cfo` role added earlier the same day. `metrc_packages`,
`metrc_lab_results`, `metrc_transfers`, `metrc_plants` and `metrc_harvests` all
gate on it, so **a CFO can read none of them.** The CFO access granted for Metrc
Reports is therefore incomplete. **Not fixed here** — `exec_all` is `FOR ALL`, so
adding `cfo` to `is_executive()` would hand the CFO write access to the Metrc
mirror as a side effect. It needs read-only policies, which is a separate change.

## `tg_trace` rewritten

Now `security definer set search_path = public`, execute granted to
`authenticated`, revoked from `public` and `anon`. Added:

- **Bought-in origin.** Where the package's `ItemFromFacilityLicenseNumber` is not
  one of ours, a `2 Harvest` event names the supplier and licence and carries the
  inbound manifest download. For third-party material this *is* the origin — the
  grow record sits with the supplier.
- **Test scores** as first-class events — Total THC, Total CBD, Total Terpenes,
  Total Cannabinoids — excluding the zero-filled Retest rows, each linked to its
  certificate.
- **Certificate on file** as its own event with the download link.
- **Sale manifests.** Outgoing now reads `SOLD — manifest N`, names the customer
  and carries the invoice number from `_delivery.InvoiceNumber`.
- Inbound manifests now also match via `ReceivedFromManifestNumber`, which the
  old text-search join missed.

Verified on `1A40A0300011815000000775` (bought-in trim):

> Bought in from **Greater Goods, LLC**, licence MB282344 · Package created ·
> Certificate of Analysis on file ×3, each downloadable · Total THC, CBD,
> Terpenes, Cannabinoids all Passed · Received on manifest 0003362642

## Defect D3 measured — date filters missing on 78 of 219 pages

The generic renderer switches the date filter on only when a column name matches
`_date | _on$ | _at$ | ^date | ^month | period`, and search on when the view has
text columns.

| Category | Pages | No date filter | Fixable by renaming |
|---|---|---|---|
| Command Center | 36 | 22 | 8 |
| Cultivation | 42 | 10 | 3 |
| Inventory | 30 | 10 | 0 |
| Finance | 24 | 9 | 2 |
| Metrc | 18 | 6 | 4 |
| Reports | 8 | 6 | 3 |
| Human Resources | 9 | 4 | 1 |
| Manufacturing | 8 | 4 | 2 |
| Settings | 20 | 4 | 1 |
| Quality | 8 | 2 | 1 |
| Infused Pre-Rolls & Flower | 4 | 1 | 0 |
| Workspace | 12 | 0 | 0 |

Search is nearly universal — only **2** pages lack it.

**25 pages hold a real date column that is simply named wrong**; renaming it in
the view turns the filter on with no front-end change. **53 have no date column at
all** and need a decision per page about which date is the meaningful one — for
some (configuration and reference lists) a date filter is meaningless.

This confirms HANDOFF.md D3: *"most reporting views have no date column to filter
on - that is the first step, not the UI."*

## D3 — date filters switched on for 25 pages

The renderer enables the date filter only when a column name matches
`_date | _on$ | _at$ | ^date | ^month | period`. 25 pages held a real date column
named something else — `raised`, `oldest`, `first_seen`, `started`, `at`.

**Columns were appended, never renamed.** `create or replace view` cannot rename a
column; renaming needs a drop, and rule E1 exists because that blanked every
dashboard three times. Each view was instead wrapped:

```sql
create or replace view V as select q.*, q.<datecol> as <datecol>_date from (<original def>) q;
```

Same columns, same order, one appended. 23 views done, 0 failures. The two base
tables (`audit_events.at`, `employee_rates.effective_from`) got **generated stored
columns**, so they stay in step with their source and are never hand-maintained.

| | Before | After |
|---|---|---|
| Pages with no date filter | 78 of 219 | **53** |
| Command Center | 22 | 14 |
| Metrc | 6 | 2 |

Verified afterwards (rule E2): **181 of 181 views readable, 0 broken, all 7
materialized views still populated.**

The remaining 53 have no date column at all. Each needs a decision about which
date is the meaningful one, and for configuration and reference lists a date
filter is meaningless — so this is a per-page judgement, not a sweep.

Search was never the problem: only 2 pages of 219 lack it.

---

# Drill-downs and units

## Drill-downs — 29 of 43 dashboard tiles were broken

| | Tiles |
|---|---|
| Working | 14 |
| Target does not exist | **15** |
| Target exists but silently fails | **14** |

The third group was a one-line bug. The router resolved the current page with
`entries.find()`, and `entries` comes from `nav`, which `useNav()` filters to
`surface === 'side'`. **Any tile, drill-down or search result pointing at a
Reports, Finance, Tax, HR, launcher or deep page resolved to nothing** and fell
through to the default screen — no error, no message. That breaks rule C1.

`entries` was left alone because it also builds the side-rail category tree;
widening it would dump every page onto the rail. A separate `routable` list
spanning all surfaces was added and `current` now resolves against it.

**Still open — the 15 whose target does not exist.** Correct targets identified:

| Tile drill | Should be |
|---|---|
| `overdue_harvests` | `harvest_issues` |
| `missing_lab_results` | `metrc_rpt_lab` |
| `failed_by_origin` | `failed_testing_by_origin` |
| `drying_performance` | `dry_room_performance` |
| `late_pulls` | `schedule_compliance` |
| `yield_gap` | `issue_yield_gap` |
| `employees` | `people` |
| `aging_stock` | `issue_aging` |
| `ff_dry_equiv` | `fresh_frozen_equiv` |
| `metrc` | `metrc_mirror` |
| `metrc_cultivation` | `metrc_mc` |
| `lab_turnaround` | `lab_turnaround_report` |

These are string literals inside `mv_department_dashboard`'s **19,391-character**
definition, so correcting them means dropping and recreating that matview — the
object the handoff records as having been destroyed three times. **Deliberately not
done as a side change.**

## Units, not Each

Rule B2 says countable items are units; rule F4 forbids abbreviations. Metrc
returns `Each`, and it was reaching the tiles unchanged — *"17,001 Each"*.

`f_uom_label(text)` now maps Metrc's raw unit names to the platform's vocabulary
in one place — Each/ea → **Units**, g → Grams, lb → Pounds, and so on — and is
applied in `v_stock_summary`, `v_product_identity`, `v_lab_results`,
`v_location_history` and `v_package_forensic`. Tiles now read **17,001 Units**.

Note the front end already defaulted to "units" (`{s.unit_of_measure || "units"}`)
— the database was overriding it. Fixing it in the view fixes it everywhere.

Verified: 181 of 181 views readable, 0 broken.

## Search and dates — two different causes

1. **Generic pages** get search and a date filter automatically, but only when the
   view has a text column and a column *named* like a date. 25 were fixed by
   appending a correctly named alias; 53 still have no date column at all.
2. **Bespoke pages** — the 35 registered in the `special` map, including
   `MetrcMirror` — hand-roll their own UI and mostly have neither. This is a
   separate, larger piece of work: the search / date / export toolbar should be
   extracted into one shared component and used by every bespoke page, which is
   also the only way to make it consistent sitewide.

---

# Full remediation pass — 6 August 2026

## Drill-downs: 29 broken → 0

The 15 tiles whose targets did not exist were literals inside
`mv_department_dashboard`'s 19,391-character definition. Fixed properly rather
than worked around:

1. Verified **nothing depends on the matview** (a plain DROP would fail if it did).
2. Captured a baseline: 43 tiles, 11 departments, content fingerprint
   `325b73c8d4c72cf52b5ccf66beb1a55d`.
3. Captured what must be restored: the unique index `mv_dept_dash_uq
   (department, kpi, ord)` — **without it the cron's `REFRESH … CONCURRENTLY`
   fails** — and the effective privileges (authenticated reads, anon does not).
4. Backed the definition up to `_mv_dept_backup`.
5. Confirmed each literal's occurrence count matched its tile count exactly, so
   no replacement could hit an unintended string. Ordered longest-first.
6. Dropped **without CASCADE** and recreated inside one transaction, restored the
   index and grants.

**Result: fingerprint identical, 43 tiles, 11 departments — every number
unchanged, only the drill targets moved.** `REFRESH … CONCURRENTLY` re-tested and
still works.

| Drill was | Now |
|---|---|
| `overdue_harvests` | `harvest_issues` |
| `missing_lab_results` | `metrc_rpt_lab` |
| `failed_by_origin` | `failed_testing_by_origin` |
| `drying_performance` | `dry_room_performance` |
| `late_pulls` | `schedule_compliance` |
| `yield_gap` | `issue_yield_gap` |
| `employees` | `people` |
| `aging_stock` | `issue_aging` |
| `ff_dry_equiv` | `fresh_frozen_equiv` |
| `metrc` | `metrc_mirror` |
| `metrc_cultivation` | `metrc_mc` |
| `lab_turnaround` | `lab_turnaround_report` |

18 of the 43 now resolve to `deep`, 7 to `reports`, 1 to `hr` — **they only work
because of the routing fix**; the two changes are only complete together.

## The four missing views — rebuilt

HANDOFF.md says the definitions are in the session transcript. **They are not** —
zero mentions of any of the four across the whole transcript. They were rebuilt
from the underlying tables.

**`v_open_issues`** — the register holding the owner's fix/leave/ignore/reset
decisions, and the most serious of the four. Built from `watchdog_findings` joined
to `issue_decisions`. Each run records a single finding, so "latest run" is not a
snapshot; it takes the **most recent observation per distinct fingerprint**, with
`times_seen` and `first_seen_on`. Honours rule H1 — a decided issue still appears,
and an ignored one says so explicitly. **14 open issues, 2,634.7 lb at stake, all
awaiting a decision.**

**`v_lab_fail_rate_by_origin`** — fail rate per supplier, splitting ours from third
party (rule C6), stating plainly when no completed test exists to compute a rate.
28 rows.

**`v_lab_turnaround_summary`** — monthly, from `lab_turnaround_log`.
Two honest findings surfaced rather than smoothed over:
- `laboratory` and `category` are **null on all 2,384 rows**, so they cannot be
  broken out. The view says so and names the Lab Results import as the fix.
- **13 records show the result returning BEFORE the sample went out**, worst −22
  days. Impossible. They were dragging April's average to **−0.67 days**. They are
  now excluded from the averages and **counted in `impossible_records_excluded`**
  so the defect is visible. April now reads +0.72.

**`v_issue_yield_gap`** — shortfall against our own average, per room, from
`v_issue_yield_by_harvest`. 3 rows.

## Access and security

- **`is_finance_reader()`** added and applied as `cfo_read` SELECT policies on 19
  tables. The `cfo` role could previously read none of the Metrc mirror, because
  every table gates on `is_executive()` = owner|executive. Adding `cfo` there would
  have granted **write** as well, since those policies are `FOR ALL` — so a
  read-only predicate was used instead.
- **`abh_write`** on `ai_bridge_heartbeat` (anon, ALL, `USING true`) replaced with
  scoped insert/update/select policies. **anon can no longer DELETE.** Verified the
  bridge still upserts (HTTP 200) and the delete is now a no-op.
- **Zero anon-permissive `ALL` policies remain**, and no table allows anon to
  insert freely.

## Verified after every change (rule E2)

| | |
|---|---|
| Views readable | **185 of 185** |
| Materialized views populated | **7 of 7** |
| Nav rows pointing at nothing | **0** (was 4) |
| Dashboard drill targets broken | **0** (was 29) |
| Cron jobs active | 20 |

## Search and date coverage — measured, and the gap made visible

`v_page_filter_coverage` (Settings → Platform health → **Page Search & Date
Coverage**) lists every page, whether it offers search and a date range, and where
a date filter is missing, **why**.

A correctness note: an earlier count of this was wrong because
`information_schema.columns` **does not include materialized views**, so all eight
department dashboards were mis-reported as having no search. The register now
reads `pg_attribute`, which covers them.

| | Pages |
|---|---|
| Date filter available | **183** |
| No date column at all | 52 |
| **Fixable but not fixed** | **0** |

The 52 are configuration, rate and reference tables, plus single-row KPI summaries
such as `v_schedule_discipline` — pure numbers with no date to filter by. Forcing a
date filter onto those would be worse than not having one. The register states that
per page so it reads as a decision, not an omission.

Only one page lacks search — `v_schedule_discipline` — for the same reason: it has
no text column, being a single row of numbers.

## Final verification

| | |
|---|---|
| Views readable | **186 of 186** |
| Views broken | **none** |
| Materialized views populated | **7 of 7** |
| Nav dead ends | **0** |
| Broken drill targets | **0** |
| Pages with a fixable missing date filter | **0** |
| Anon-permissive `ALL` policies | **0** |
| Cron jobs active | 20 |

## Still open, and deliberately not rushed

**The 35 bespoke pages** registered in App.jsx's `special` map — `MetrcMirror`,
`ControlTower`, `FinishedGoods` and the rest — hand-roll their own UI. Most have
neither search nor a date range, and the register above cannot see them because
they do not render through the generic table.

The right fix is to extract the search / date-range / export toolbar into **one
shared component** and adopt it across all 35. Patching them individually
guarantees they drift apart again; a shared component is the only thing that makes
it genuinely consistent sitewide. That is a substantial front-end change and
should be done as its own piece of work, with each page verified after.

---

# Metrc reports analysed, and the harvest gap closed — 6 August 2026

The owner supplied nine Metrc report exports. They change several conclusions.

## The sync was missing 60% of harvests

| | |
|---|---|
| Harvests in the Metrc report | **380** |
| Harvests in the database | **153** |

Metrc's `/harvests/v2/*` endpoints return only a recent window by default. The
Edge Function already supported `winStart`/`winEnd` for exactly this, and it had
never been used. Walking 2024-01 to 2026-08 in five windows recovered every one:
**153 → 380, an exact match to the report.** Explicit windows do not advance the
delta cursor, so normal syncing is unaffected.

**This should be a scheduled quarterly backfill**, or the same gap reopens for any
harvest that closes outside the delta window.

## D1 — the moisture band, answered from Metrc's own arithmetic

Metrc records `Wet = Waste + Packaged + Remaining`, and **all 380 harvests balance
to exactly zero**. There is no moisture-loss line in Metrc at all; the Weight
column silently absorbs evaporation.

Across the **350 finished** harvests:

| | Pounds |
|---|---|
| Wet in | 39,853.3 |
| Waste | 3,667.4 |
| Packaged | 11,289.1 |
| **Still shown on finished harvests** | **24,896.7** |

**271 of 350 finished harvests still carry weight.** A finished harvest should
carry none, so the true moisture loss is **24,896.7 lb — 62.5% of wet weight.**

**The 75–80% band is too aggressive.** At 75% the theoretical dry yield is ~9,963
lb, but 11,289 lb was actually packaged — more than the band permits. That is the
impossibility recorded in HANDOFF.md D1, now measured across the full set rather
than a sample. **The phantom is 24,896 lb, not 6,796.**

## Wholesale revenue exists after all

`/transfers/v2/deliveries/{id}/packages/wholesale` returns 401, but the Wholesale
Transfers report carries an `Amount` column: **$420,047.46 shipped**, 99 lines,
38 invoices. Buds $415,503 · Shake/Trim $3,750 · Vape $544. Largest counterparty
Eagle Eyes Transport Solutions at $215,935.

The platform values inventory at owner-set rates because it had no invoiced
figures. It now has them.

## D6 — correcting the handoff

The Inventory Point-in-Time report has **no quantity column**: Type, Tag, Name,
Category, Strain, Location, Sublocation, dates, Status. It lists the 2,103 items
held on 1/1/2025 but not how much of each. **It cannot produce a fileable return
on its own.**

Separately, `inventory_snapshot` now records one row per package per day from
6 Aug 2026, with `tg_snapshot_inventory()`. First snapshot: **747 packages.**
Every FUTURE as-of date is answerable from our own record. Dates before today
still need the Metrc export.

## Yield monitoring against the 380 lb target

`v_yield_by_harvest` and `v_monthly_yield` give dried flower, trim and fresh
frozen per harvest and per month, with the owner's 380 lb minimum.

Two counting traps were found and handled:

- **Current quantity is not production.** `metrc_packages.quantity` is what
  remains today, so anything sold reads zero and the month it was produced in
  looks empty. Production must be measured on **`CreatedQuantity`**.
- **1,192 packages name more than one source harvest, one names 82.** Counting a
  package once per harvest inflated flower to 12,279 lb against a true 11,289.
  Weight is now divided evenly across the harvests named — the only attribution
  Metrc supports, as it does not record how much came from each.
- Packages **repackaged from other packages** still carry the harvest name. Only
  packages made directly from a harvest are counted, or production doubles.

**Honest limitation:** the category split does not reconcile exactly to Metrc's
`Total Pkg'd`. Direct-from-harvest totals 6,074 lb, repackaged 13,147 lb, Metrc's
own figure 11,879 lb. Metrc records no category split on the harvest itself, so
`packaged_lb` is authoritative and the three categories are directional. The view
says so on every row.

**Against the 380 lb minimum, 2 of the last 12 months met it** — May 2026
(520.5 lb) and June 2026 (476.5 lb).

## Yield judged on a rolling average, not calendar months

The owner's point: harvests land on a **14-day pull cadence**, not calendar months,
so a short month — or a pull falling either side of a month end — makes any single
month misleading. January closed 37 harvests, December closed 5.

`v_yield_vs_target` adds 3-month and 6-month rolling averages and flags any month
with fewer than 8 harvests as not a performance signal.

| Month | Harvests | Flower lb | 3-month avg | Verdict |
|---|---|---|---|---|
| 2026-07 | 15 | 233.5 | **410.2** | on target |
| 2026-06 | 30 | 476.5 | **446.0** | on target |
| 2026-05 | 22 | 520.5 | **401.2** | on target |
| 2026-04 | 15 | 341.1 | 304.4 | below |

**Three consecutive months on target on a rolling basis.** Counting calendar months
gave "2 of 12", which was the wrong lens.

## Getting this daily — what the API can and cannot do

Probed `/transfers/v2/deliveries/{id}/packages` in full: **70 fields**, including
`ShippedQuantity`, `ReceivedQuantity`, `CreatedQuantity`, `SourceHarvestNames` and
`ProductCategoryName`.

**No price field of any kind.** `ShipperWholesalePrice` and
`ReceiverWholesalePrice` appear only in the Packages-Transferred export.

| Data | Daily by API? |
|---|---|
| Packages, harvests, plants, transfers, categories, quantities | **yes, already running** |
| Lab results and COA documents | **yes** |
| Manifest PDFs | **yes** |
| Package adjustments | **yes** (endpoint probed 200) |
| **Wholesale price** | **no — export only** |
| Historical point-in-time | **no — snapshot ourselves from today** |

So a daily automated feed covers everything except **price** and **history before
today**. Those two need either the desktop bridge driving the Metrc UI with the
owner's own session, or prices captured in the OS as orders are processed.

`metrc-probe` was extended with `?keys=1` to return an endpoint's full field list
rather than a truncated sample, so this kind of question can be settled with
evidence instead of a guess.

## Package exports reviewed

| Export | Rows | What it adds |
|---|---|---|
| Packages-Active | 86 | current, with Source Harvest(s) and Category |
| Packages-Inactive | 1,562 | 86 + 1,562 = 1,648, matching Facility Metrics exactly |
| **Packages-Transferred** | **4,902** | **Shipper/Receiver Wholesale Price per package** |

The Transferred export is the only source of package-level wholesale price, and it
also carries Source Harvest and Category — enough to reconcile the yield category
split that the API alone cannot.

## Package adjustments, both licences — and D1 confirmed a second way

The owner supplied the MP281909 exports. Manufacturing carries five times the
adjustment activity of cultivation.

**4,414 adjustments, net −871.6 lb**

| Reason | Count | Negative lb | Positive lb |
|---|---|---|---|
| Over/Under Pulled | 3,121 | −1,341.7 | +1,366.0 |
| **Waste** | 156 | **−642.7** | 0.5 |
| **Processing Loss** | 534 | **−199.2** | 0 |
| Entry Error | 342 | −115.5 | +182.0 |
| Spoilage | 28 | −107.3 | 0 |
| Package Material | 190 | −69.9 | +57.4 |
| Plants Unpacked | 6 | −1.4 | 0 |
| Scale Variance | 16 | −0.1 | +0.2 |
| **Drying** | **1** | **−0.0** | 0 |

| Licence | Adjustments | Net |
|---|---|---|
| MC281714 cultivation | 749 | −56.9 lb |
| **MP281909 manufacturing** | **3,665** | **−814.7 lb** |

Manufacturing is **93% of the net loss**. Worst categories: Buds −1,548.8 lb,
Fresh Frozen Flower −559.7 lb, Concentrate (Bulk) −193.0 lb.

Over/Under Pulled nets to roughly zero (−1,341.7 against +1,366.0) — those are
corrections either way, not loss.

### D1 confirmed from a second, independent direction

**There is exactly one "Drying" adjustment in 4,414 records, for zero pounds.**
Moisture loss is not recorded as an adjustment on either licence.

Combined with the harvest arithmetic — `Wet = Waste + Packaged + Remaining`
balancing to exactly zero on all 380 harvests — this establishes that **evaporated
water has never been removed from Metrc anywhere in the business.** It sits as
24,896 lb of weight Metrc still believes is on finished harvests.

That is now proven twice over, from harvests and from adjustments, rather than
inferred from a moisture band.

### Manufacturing exports

| Report | MC281714 | MP281909 |
|---|---|---|
| Packages Adjustments | 749 | **3,665** |
| Packages Inventory | 62 | 446 |
| Inventory Point-in-Time | 2,103 | 648 |
| Test Batches Relationships | 739 | 0 |

---

# D1 CLOSED — and a correction to my own earlier finding

## Metrc records moisture loss. I was wrong to call it phantom weight.

Earlier in this document I concluded, from the Harvests report, that
`Wet = Waste + Packaged + Remaining` balanced to exactly zero on all 380 harvests
and therefore **evaporated water had never been removed from Metrc** — describing
24,896.7 lb as "phantom".

**That was wrong.** The Harvests report does not carry a moisture column. The
`Metrc-Massachusetts-MC281714-Plants-HarvestsInactive` export does, and moisture
loss is recorded properly. I was reading "Weight" (current remaining) and
inferring an absence that was not there.

## The measured figure, across all 350 finished harvests

| Measure | Pounds | % of wet |
|---|---|---|
| Wet weight in | 39,853.3 | — |
| Waste | 3,667.4 | 9.2% |
| **Total packaged** | **11,289.1** | **28.3%** |
| **Moisture loss** | **24,896.7** | **62.5%** |
| **Unaccounted** | **0.0** | — |

The balance closes to **zero**. 271 of 350 harvests carry a moisture figure; the
77 showing zero will be fresh-frozen runs, which are packaged wet and never dry.

## What this settles

**True moisture loss is 62.5%, not the 75–80% band.**

The platform currently holds `expected_moisture_pct_min = 75` and
`expected_moisture_pct_max = 80`. At 75% the theoretical dry yield from 39,853 lb
is ~9,963 lb, but **11,289 lb was actually packaged** — more than the band permits.
That is exactly the impossibility recorded in HANDOFF.md D1, and the cause is the
band, not the weights.

HANDOFF.md D1 says *"Either the band is too aggressive, wet weights are
under-recorded at the takedown scale, or packaged weights include material from
elsewhere."* **It is the first: the band is too aggressive.** Now established from
Metrc's own field across the full population, not a sample.

## NOT changed

`expected_moisture_pct_min/max` are owner-set rows and sit under every conversion,
yield and valuation figure in the platform. Changing them is the owner's decision
and should be recorded in `issue_decisions` per rule H1. The evidence is here; the
decision is his.

Also note the earlier "phantom weight" claim in this document is superseded by
this section. It is left in place rather than deleted so the reasoning, and its
correction, both remain on the record.
