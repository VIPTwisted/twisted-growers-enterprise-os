# Twisted Growers Enterprise OS — Handoff Report

**Prepared 6 August 2026. Development is FROZEN. Read this before touching anything.**

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

**Counts as at 6 Aug 2026:** 176 base tables · 177 views · 7 materialized views ·
19 cron jobs · 262 enabled navigation entries.

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
| Open questions for the owner | **30** | 3,444.9 lb at stake |
| Go-live items open | **173** | |
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

### D4 · Front end built and staged but NOT DEPLOYED
`app/web/dist` is current and staged at the deploy directory. The last deploy
predates: unit-aware tile labels, the Proof page wiring, and `quantity_shown`.
**The database is correct; the site is one deploy behind.**

### D5 · Lab Results never imported — no THC, TAC, terpenes or COA anywhere
Verified: Metrc's package interface exposes only `LabTestingState` and dates. No
analyte values, no COA URL. `lab_result_values` and `coa_documents` are both
empty. The only route is the **Metrc Lab Results report import**. Until then
every potency field correctly says why it is absent.

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

- **Anon access revoked** on all views and materialized views (6 Aug 2026).
  Previously 36 views were readable with only the publishable key — package
  tags, strains, suppliers and dollar figures. **Re-check after adding any view;
  `grant … to anon` must never be used.**
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
