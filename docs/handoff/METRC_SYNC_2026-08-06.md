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
