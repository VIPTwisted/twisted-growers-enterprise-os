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
