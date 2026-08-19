# Twisted Growers Enterprise OS — Handoff Report

<!-- GENERATED: tg_handoff_state_md(). Do not hand-edit between these markers. -->
_Measured 19 Aug 2026 15:33 UTC, direct from the live database._

**Security invariants hold.** Zero anon reach, zero tables without row-level security.

| Measure | Value | Should be |
|---|---:|---|
| Base tables | 448 | — |
| Views | 506 | — |
| Materialized views | 28 | — |
| Matviews unpopulated | 0 | 0 |
| Relations readable by anon | 0 | 0 |
| Functions executable by anon | 0 | 0 |
| Of those, functions that WRITE | 0 | 0 |
| Tables without row-level security | 0 | 0 |
| SECURITY DEFINER with mutable search_path | 0 | 0 |
| Menu entries enabled | 659 | — |
| Menu entries pointing nowhere | 0 | 0 |
| Scheduled jobs | 70 | — |
| Jobs failing on their latest run | 7 | 0 |
| Jobs that failed at least once in 24h | 11 | 0 |
| Tiles with no owner-set target | 32 of 52 | 0 |
| **Questions waiting on the owner** | **49** | 0 |
| Go-live items open | 179 | 0 |
| Staff without an account | 13 | 0 |

_Every figure above is read from `platform_state`, the append-only nightly self-check._
_Regenerate with `node tools/gen-handoff.mjs`. Never retype these by hand: the numbers_
_move daily, and a hand-written count in this file was once the opposite of the truth._
<!-- END GENERATED -->

**Prepared 6 August 2026. Corrected 7 August 2026 after an independent verification pass.
Read this before touching anything.**

> ### Read this box first
>
> On 7 August 2026 this document was checked line by line against the live system. **Several
> statements were stale and one was the opposite of the truth.** Corrections are marked inline
> and dated; the original wording is struck through rather than deleted, so the record of what
> was believed survives.
>
> **The one that mattered:** section 6 claimed anonymous access was closed. It was not — 30
> relations were returning real customer, manifest and money data to anyone holding the
> publishable key, and 33 `SECURITY DEFINER` functions that write were callable by anyone on
> the internet. All of it is now closed, and there is an automated check so it cannot silently
> return.
>
> **The freeze has been lifted.** Two agents plus a watchdog are working in parallel. Lanes and
> the rules that keep them from breaking each other are in
> `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md`; the full findings are in
> `docs/AUDIT_2026-08-07_SENIOR_REVIEW.md`.
>
> **Treat every count in this file as indicative, not current.** The schema is moving
> continuously — the table count changed three times during a two-hour audit. Re-measure
> before you rely on a number.

`CLAUDE.md` is the single source of truth for rules. This file is the single
source of truth for *state*. Where they disagree, `CLAUDE.md` wins on rules and
this file wins on facts.

---

## 1. What this is

One system running a Massachusetts cannabis company — cultivation licence
**MC281714**, manufacturing licence **MP281909**. It replaces Metrc's interface,
ClickUp, Monday and spreadsheets. The owner (Vinny) is non-technical and expects
plain English everywhere.

- **Live:** https://twisted-growers-enterprise-os.netlify.app
- **Supabase project:** `fxetuqjryttnypgepsru`
- **Netlify site:** `b565a8cc-c82b-41b9-b9ec-4dae875af078`
- **Front end:** single-file React SPA, `app/web/src/App.jsx` (~6,400 lines),
  plus `styles.css`, `rules.css`, `budz.jsx`

---

## 2. Architecture

**Metrc is the legal record. This platform is a READ-ONLY MIRROR of it.**
It has never written back to Metrc and holds no write credentials. Anything
recorded here about a Metrc correction is a *record of intent*, not the
correction itself. This is the single most important fact for a new agent.

```
Metrc API  ──►  metrc_* tables (raw jsonb)  ──►  v_* views  ──►  mv_* matviews  ──►  React SPA
                                                      ▲
                          conversion_factors, valuation_rates, cost_inputs,
                          grow_rooms, harvest_plan_2026, suppliers  (owner-set config)
```

**Counts as at 7 Aug 2026, re-measured:** **229 base tables · 225 views · 9 materialized
views · 23 cron jobs · 278 enabled navigation entries.**

> The figures previously here (176 / 177 / 7 / 19 / 262, dated 6 Aug) were stale within a day.
> **Do not trust a count in this file without re-measuring** — two agents are shipping schema
> changes continuously; the table count moved three times during a two-hour audit.
> `supabase/checks/anon_exposure.sql` and a `platform_state` job are the durable fix; until
> that job exists, treat every number in this document as indicative.

### Navigation is database-driven
`nav_registry` drives every menu. Columns: `category`, `category_order`,
`subcategory`, `label`, `item_order`, `icon`, `view_key`, `table_ref`,
`description`, `enabled`, `report_group`, `surface`.

`surface` routes the item:
- `side` — the production floor rail
- `launcher` — the grid icon (Workspace only)
- `reports` — the Reports dropdown
- `finance` / `tax` / `hr` — their own top-bar dropdowns
- `deep` — not on the rail; appears at the bottom of its category dashboard
  under *"Still to be built out — temporary list"*

`nav_role_visibility` filters per role. Roles: `owner`, `executive`, `planner`,
`dept_head`, `staff`, `readonly`.

### Key functions (use these; do not re-derive)
| Function | Purpose |
|---|---|
| `f_to_pounds(qty, uom)` | Converts to pounds from the **actual** unit. Returns **null** for countable units. |
| `f_is_weight(uom)` | True only for g/kg/mg/oz/lb. |
| `f_is_ours(licence)` | Reads `company_licenses`. Never hardcode MC281714/MP281909. |
| `f_rate_for(stream, tag)` | Valuation rate: batch override → concentrate sub-type → stream rate → fallback. |
| `f_rule(key)` | Any business threshold from `conversion_factors`. |
| `f_test_status(state, submitted, result)` | The canonical testing wording, sitewide. |
| `f_potency_status(thc, terp, state)` | THC/terpenes, or exactly why they are absent. |
| `f_concentrate_rate_per_lb(item)` | Per sub-type from `concentrate_rate_map`. |

---

## 3. State of the OS — measured 6 August 2026

### Inventory
| Measure | Value |
|---|---|
| On hand, weighed | **2,527.7 lb** |
| On hand, counted | **21,532 units** (vapes, edibles) |
| Dry-equivalent still on open harvests | **625.5 lb** |
| Cost per saleable pound | **$591.39** |

### Exceptions — all live, all with per-item drill-downs
| Exception | Count | Detail |
|---|---|---|
| Out at the laboratory, no result | **54** | 270.2 lb, longest 170 days |
| Never submitted for testing | **358** | 144.3 lb, oldest 836 days |
| Phantom weight, CLOSED harvests | **87** | **6,796 lb** — moisture loss never entered in Metrc |
| Harvests past the 28-day limit | **22** | oldest cut 191 days ago |
| Pulls off the 2026 calendar | **13 of 26** | room rotation drifted one position |
| Metrc corrections outstanding | **3** | see `metrc_corrections` |
| Open questions for the owner | **44** (was 30) | **3,484 lb at stake**, every one still unanswered |
| Go-live items open | **179** (was 173) | 59 of them flagged as needing owner action |
| Valuation rates unconfirmed | **1** | |
| Business rules unset | **0** | all sourced |

---

## 4. KNOWN DEFECTS — read every one

### D1 · Moisture band is provably wrong — BLOCKS the Metrc corrections
The mass ledger says: 18,476.7 lb wet in → 14,319.4 lb evaporated at the 75–80%
band → **4,157.1 lb dry available**. But **5,199.1 lb was actually packaged.**
That is impossible. Either the band is too aggressive, wet weights are
under-recorded at the takedown scale, or packaged weights include material from
elsewhere. **Nothing may be adjusted in Metrc until this is settled** — owner
decision, recorded in `issue_decisions`. Fix: weigh 2–3 harvests end to end,
then set the true band on Settings → Business Rules.

### D2 · `tg_sweep_unknowns()` re-raises answered questions
It regenerates from its own rules and does not check `suppliers.supplier_name`
or `suppliers.bought_as` before asking again. Every answer Vinny gives reappears
next morning. **Fix: add `not exists` guards.** Small change, high value.

### D3 · No date-range filtering anywhere
Owner has asked repeatedly for QuickBooks-style presets (This month, Last month,
YTD, Custom, with prior-period comparison). Not started. Most reporting views
have no date column to filter on — **that is the first step**, not the UI.

### D4 · ~~Front end built and staged but NOT DEPLOYED~~ — **CLOSED 7 August 2026**
It was already deployed when this was written. Verified by comparing the live bundle hash to
`app/web/dist/index.html` — byte-identical.

Deployed again on 7 August with the Command Center fix, the `useNav` session fix and the stray
`)}` removal. Live bundle is now `index-Bu1iHbgh.js`, and all three fixes were confirmed
present in the deployed JavaScript rather than assumed.

> **Note for whoever deploys next: a push to `main` now deploys.** The Netlify project builds
> from the GitHub repo, so `git push origin main` ships to production. A CLI deploy
> (`netlify deploy --prod --dir=dist`) also works — the CLI is authenticated as TwistedG /
> team TG and linked to project `b565a8cc-c82b-41b9-b9ec-4dae875af078`.

### D5 · Lab Results — **MATERIALLY CHANGED 7 August 2026. Re-read this.**
The original claim — *"Lab Results never imported"* — **is no longer true**, and repeating it
sent one agent looking in the wrong place.

**The import has happened.** `metrc_rpt_lab_results` holds **39,531 staged rows** across 42
imports, last run 10:47 on 7 August. `metrc_rpt_point_in_time` holds 7,266 rows across 53
imports. All 11 report types report **"Up to date"** in `v_report_mapping_status`, with 435
imports completed in total.

**What is still true:** `lab_result_values` and `coa_documents` are both **empty**. So every
potency field on the platform still correctly explains that the value is absent.

**So the gap is staging → canonical mapping, not the import.** 39,531 potency and terpene
results are in the building and not on the shelves. This is now code-fixable and it is the
largest unrealised gain in the platform.

**Blocked on one owner decision, and no agent may guess it:** should `lab_result_values` be
populated from `metrc_rpt_lab_results`, or is `metrc_rpt_lab_results` now canonical and
`lab_result_values` obsolete? **There must be exactly one home.** Two homes for potency, one
empty, is how a platform starts contradicting itself. Once settled, `f_potency_status()` reads
the canonical table and — per rule C3 — arriving data must back-fill every past record.

The original observation about the API remains correct and worth keeping: Metrc's package
interface exposes only `LabTestingState` and dates, with no analyte values and no COA URL. The
report import is the only route, which is why it was built.

### D6 · Year-end tax report is not fileable
`tg_inventory_as_of('2025-12-31')` returns 271 rows; only **10 carry a quantity**
and **none carry a category**, totalling $8,408. Metrc's API exposes no historical
point-in-time. Requires the **Inventory Point-in-Time export** from the Metrc
Reports Control Panel. No calculation fixes this.

### D7 · Harvest names are inconsistent in Metrc
Room suffixes appear in mixed case (`f3`, `F3`) — handled by `ilike`. But some
are malformed: **`7f3`, `aF3`**. Those harvests will misfile.

### D8 · Overhead is one lump, not itemised
$285,000/month, **wages included** (owner-confirmed — do NOT add payroll on top).
Total is right; nothing can be attributed to a cause. QuickBooks or a P&L upload
replaces it.

### D9 · Unvalued streams
Pre-rolls have no computed per-unit cost (formula exists, chain not evaluated).
Edibles have no cost model in the worksheet at all.

---

## 5. Drift risks — how this project has broken before

**These are not hypothetical. Each happened during the build.**

1. **`drop view … cascade` destroyed `mv_department_dashboard` three times.**
   Every dashboard went blank with no error, because `App.jsx` swallows the
   failure with `k.data ?? []`. It also silently reverted `v_money_position`
   to the wet-weight figure. **Use `create or replace`. Always re-query
   `pg_matviews` afterwards.**
2. **Scripted edits anchored on a common line** (`const [busy, setBusy]`) put
   React state in the wrong component three times → three blank screens
   (`mustChange`, `qfind`, `openTile`). **Anchor on the function signature.**
3. **Comparing figures without checking units** produced a "you are at half your
   plan" finding that was wrong by a factor of six (grams-per-plant vs
   grams-per-square-foot). **Check units first.**
4. **Assuming a benchmark** — a fabricated 130 g/plant figure was presented as
   fact. Everything must carry provenance.
5. **Aggregate views counted as rows** — `count(*)` on `v_stock_on_hand` returns
   group count, not packages. Use `sum(packages)`.

---

## 6. Security

> **CORRECTED 7 August 2026.** This section previously read *"Anon access: 0 views
> readable."* **That was false when written.** A verification pass on 7 August found
> **30 relations still returning real rows to `anon`** — including `v_customers` (127),
> `v_customer_directory` (214), `v_manifest_ledger` (2,690 manifests),
> `v_wholesale_reconciliation` (2,537) and `mv_package_documents` (3,548) — plus **131
> functions executable by `anon`, 42 of them `SECURITY DEFINER`, 33 of which write**,
> including `tg_import_undo` and `tg_agentmapper_approve`.
>
> The 6 August revoke covered only the views that existed that day. It did not revoke the
> underlying **table** grants, did not cover **materialized views** (which cannot carry RLS
> at all), and installed nothing to stop the next new view being exposed. The view count went
> from 177 to 225 in the interim and the surface grew straight back.

**State as at 7 August 2026, measured not assumed:**

| Surface | Was | Now |
|---|---|---|
| Relations readable by `anon` | 248 granted / 30 returning rows | **0** |
| Functions executable by `anon` | 131 | **0** |
| `SECURITY DEFINER` functions that write | 33 | **0** |
| `SECURITY DEFINER` with mutable `search_path` | 29 | **0** |
| Public tables with RLS disabled | 5 | **0** |

Verified empirically, not by reasoning: an anonymous browser request carrying the real
publishable key now returns `401 permission denied for table nav_registry`, and an anonymous
load of the deployed site makes **zero** Supabase calls.

**Two things learned doing it — do not repeat them:**

1. **Revoking from `anon` is a NO-OP while `PUBLIC` holds the grant.** PostgreSQL's default
   for a new function is `EXECUTE` to `PUBLIC`, shown in `proacl` as `=X/postgres`. The first
   sweep appeared to succeed and changed nothing.
2. **That default is why the surface reopened three times in one day**, twice within minutes
   of being closed. A manual sweep will always lose the race against agents shipping
   functions. `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON
   FUNCTIONS FROM PUBLIC` is now set. `supabase_admin`'s defaults are not ours to change, so
   the nightly check remains the backstop.

**The check that would have caught all of this on day one is now in the repository:**
`supabase/checks/anon_exposure.sql`. It expects zero rows; any row is a finding. It
deliberately excludes extension-owned functions, which otherwise bury the six that matter
under 31 `pg_trgm` entries. **Run it after adding any view, table or function.**
`grant … to anon` is now blocked by a `PreToolUse` hook.
- RLS is on all config tables. Write policies restrict to
  `owner`/`executive`/`planner`/`dept_head`; `company_licenses` is owner/exec only.
- `tg_desktop_reader` is a read-only role; `app_secrets` denied.
- Owner accounts still use weak passwords from the build phase. **Change before
  real staff onboarding.**

---

## 7. Immutable records — do not "clean up"

| Table | Rule |
|---|---|
| `metrc_corrections` | Delete rule discards deletes. Cannot close without who/when/reference ≥3 chars. Cannot be reopened. |
| `moisture_loss_entries` | Delete rule discards deletes. Cannot claim Metrc entry without a reference. |
| `issue_decisions` | Append only. Insert restricted to owner/executive. |
| `cost_input_history` | Trigger-written on every cost change. |
| `watchdog_findings` | Append-only forensic log. No update or delete policy **by design**. |

---

## 8. Sync pipelines

| Pipeline | State |
|---|---|
| **Metrc → platform** | Working, read-only. `metrc_sync_runs` logs it. 2,356 packages · 15,595 plants · 153 harvests · 2,235 transfers. |
| **Platform → Metrc** | **DOES NOT EXIST.** No write credentials. All corrections are manual. |
| **Sheet Sync** | Built. Paste or file upload; auto-detects the package-tag column by Metrc's `1A4…` format and matches against real labels. Reconciles hourly via `agent_sheet_reconciliation()`. No sheet imported yet. |
| **QuickBooks** | **NOT STARTED.** Overhead is a manual lump. |
| **Desktop bridge** | `bridge/server.mjs`, 127.0.0.1:8765, Supabase job queue (browsers block HTTPS→localhost). `bridge/sheet-sync.mjs` reads a restricted Google Sheet through the owner's own signed-in Chrome profile — never tested end to end. |

**19 cron jobs** run watchdog sweeps, dashboard refreshes, reconciliation and
lab-turnaround recording.

---

## 9. Locked facts — never re-derive

Full detail and sources in `CLAUDE.md`. Summary:

- **Rooms:** 4 tables × 287.5 = **1,150 plants**, 56-day cycle, 14-day pull
  cadence, 26 pulls in 2026, 28 days harvest→availability.
  **190/210 are WRONG and must never be reinstated.** No square footage exists
  in any spreadsheet; `grow_rooms.sqft` is null by design.
- **Yield target is per PLANT: 70.6 g.** The calendar column headed "grams/sqft"
  is mislabelled. Actual 82.3 g/plant across 87 closed harvests.
- **Plants are 100% own genetics.** 754 clone batches, all from own mothers,
  zero from packages.
- **Money:** bulk flower $1,100/lb (owner) · trim $300/lb · fresh frozen
  $119.77/lb · concentrate by sub-type from the Inventory Value Sheet · trim
  input cost $250/lb · total operating cost $285,000/month **wages included**.

---

## 10. What the new agent should do first

1. **Do not build anything.** Confirm the freeze holds.
2. **Deploy the staged front end** (D4) and verify it as a signed-in user.
3. **Fix D2** — the sweep guard. Smallest change, stops Vinny's answers evaporating.
4. **Settle D1** — the moisture band. It sits underneath every conversion,
   yield, inventory and valuation figure, and blocks 6,796 lb of Metrc work.
5. **Then, and only then**, ask the owner what to build next.

**Working style that has worked:** verify against live data before reporting,
state the arithmetic, name what is missing and why, never invent a number to
fill a gap, and correct yourself plainly when wrong.

---

## 11. VERIFICATION RESULTS — run 6 August 2026

Measured, not assumed. This is what a takeover audit actually returns.

### Passed
- **All 177 views readable by `authenticated`** — 0 failures.
- **All 7 materialized views refreshed successfully** — `mv_department_dashboard`,
  `mv_harvest_pkg_rollup`, `mv_harvest_yields`, `mv_package_harvest`,
  `mv_seed_to_sale`, `mv_strain_census`, `mv_tower_counts`.
- **Anon access: 0 views readable** after the second revoke pass.
- **19 cron jobs** registered and scheduled.

### ~~FAILED — 4 navigation entries point at views that do not exist~~ — **CLOSED 7 Aug 2026**

All four now resolve. `v_open_issues`, `v_lab_fail_rate_by_origin`,
`v_lab_turnaround_summary` and `v_issue_yield_gap` all exist, and a full sweep of
`nav_registry` found **zero** enabled entries pointing at a missing relation, out of 278.

A fifth was found and fixed on 7 August that this audit missed: **Laboratory Turnaround** was
pointed at `v_lab_turnaround_by_month`, a view that had **never existed** — so that page had
been blank since the day it was built. It now reads `v_lab_turnaround_report`.

> **Known data gap on that page:** every row has `category = null`, so turnaround cannot be
> broken down by product. Per rule A3 the page must say why rather than render a blank
> grouping.

**The nav check is now automated** — `supabase/checks/anon_exposure.sql` covers exposure, and
CI fails on any enabled `nav_registry.table_ref` that does not resolve. This class of defect
should not reach a human again.

### STALE METADATA — 11 dashboard entries reference a dropped view
`dept_dash_command`, `_cultivation`, `_inventory`, `_quality`, `_sales`, `_mfg`,
`_metrc`, `_workspace`, `_hr`, `_preroll`, `_settings` all carry
`table_ref = 'v_department_dashboard'`, which no longer exists.

**These pages still work** — they render through the `DeptDashboard` React
component reading `mv_department_dashboard`, so `table_ref` is unused metadata.
But it is wrong and will mislead the next agent. Repoint it to
`mv_department_dashboard`.

---

## 12. What was NOT done, and why

The owner's final directive asked for a complete export package including all
table dumps, dashboard and page JSON, and screenshots or HTML of every screen.

**That was not produced, and I want to be explicit rather than ship something
that looks complete and is not.**

- **Screenshots of every page** require a signed-in browser session. The only
  session available is sitting on a forced password-change screen for
  `vincent@twistedgrowers.com`, and setting that password is not something I
  will do on someone's behalf.
- **Full table dumps** across 176 tables would be tens of gigabytes and would
  contain the entire Metrc record. A `pg_dump` from the Supabase dashboard is
  the correct tool and takes one click.
- **Dashboard and page JSON** do not exist as artefacts. Pages are React
  components in a single file; dashboards are database views. The schema and
  `App.jsx` together *are* the export.

**What the next agent actually needs is here:** `CLAUDE.md` for rules,
`HANDOFF.md` for state, the git history for how it was reasoned, and
`docs/source-of-truth/` for the owner's authoritative workbooks. A screenshot
would tell them less than the four failed views listed above.

---

## 13. What CANNOT be recovered from this repo alone

Four things are missing from the export by deliberate choice, not oversight.
Each requires a credential, a live session or an external system that no agent
can reach from the repository. **Do not spend time trying to reconstruct them.**

| Missing | Why it cannot be produced | How to get it |
|---|---|---|
| **Full `pg_dump` of Supabase** (176 tables) | Tens of gigabytes, and it contains the entire Metrc record. Not a repo artefact. | Supabase dashboard → Database → Backups → Download. One click, no agent needed. |
| **Signed-in screenshots or HTML of every page** | Requires a live session for `vincent@twistedgrowers.com`, which sits on a forced password-change screen. Setting another person's password is not something an agent should do. | Vincent signs in, sets his own password, then screenshots or the agent walks the site with him. |
| **Metrc Reports Control Panel exports** — Inventory Point-in-Time (31 Dec 2025) and the Lab Results report | Metrc's API exposes neither. The package interface carries no analyte values, no COA links, and no historical snapshot. This is a Metrc limitation, not a build gap. | Log in to Metrc → Reports Control Panel → export both → import on the Report Import page. **This is the only route to THC, TAC, terpenes, certificates and a fileable 2025 return.** |
| **QuickBooks P&L or payroll exports** | External system, never connected. Overhead is currently one owner-stated lump of $285,000/month with wages included. | Connect QuickBooks, or upload a P&L through Sheet Sync, which already parses pasted or uploaded files. |

### Two further items an agent should know are absent

- **Metrc API credentials** are not in the repo and must not be. The sync runs
  server-side; `app_secrets` is denied to every client role including
  `tg_desktop_reader`.
- **The desktop bridge Chrome profile** (`bridge/chrome-profile/`) holds the
  owner's own Google session for reading the restricted inventory sheet. It is
  deliberately not committed, is machine-local, and must never be. The bridge
  and `sheet-sync.mjs` have never been tested end to end.

**None of the above blocks a takeover.** The platform runs without them. But
three of the four sit underneath open defects — D5 (no potency data), D6
(unfileable tax return) and D8 (unitemised overhead) — and none of those can be
closed by writing code.
