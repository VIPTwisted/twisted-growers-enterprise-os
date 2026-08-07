# Agent Work Division, Fortification Brief, and Watchdog Charter

**Issued 7 August 2026 at the owner's direction. Binding on every agent working on this
platform.**

There are three parties:

| Party | Scope |
|---|---|
| **Agent A** | All Metrc report import work |
| **Agent B** | Everything else |
| **Watchdog** (this reviewer) | Oversight of both. Verifies, does not build. Reports to the owner. |

**Read `CLAUDE.md` and `HANDOFF.md` in full before your first tool call.** If you were
launched from `C:\Users\demar\OneDrive\Desktop\Twisted Growers`, you started blind — that
folder is a redirect stub and `CLAUDE.md` did not load. Go to
`C:\Users\demar\Documents\Claude_Twisted Growers` and read both files. This has already
happened once today.

---

## SECTION 0 — Non-negotiables for both agents

These are not preferences. Breaking one is a stop-work event.

1. **THEME IS LOCKED.** Neon green. Do not touch `styles.css` or `rules.css` for any colour,
   theme or visual-identity change. Zero purple, no grey icons, no pastels. (Rules 9, I1.)
2. **Never invent a number.** Not a price, not a benchmark, not a square footage. If it is not
   measured or supplied, it does not exist. (Rule A1.) A hardcoded figure in a dashboard is
   the single most damaging defect found in this codebase — see BUG 2 in the audit.
3. **Every threshold resolves through `f_rule()`.** Never a literal. `conversion_factors` is
   the only home for a threshold. (Rules G1, G4.)
4. **Absence is explained, never blank.** Every missing value states WHY it is missing and
   WHAT would make it appear. (Rule A3.)
5. **Metrc is the legal record. This platform is a READ-ONLY MIRROR.** No write credentials
   exist. Recording a correction here does not change Metrc. (Rule D1.)
6. **Never `drop view … cascade`.** It has blanked every dashboard three times. Use
   `create or replace`. Re-query `pg_matviews` afterwards. (Rule E1.)
7. **Never `grant … to anon`.** (Rule E6.) See the live exposure findings below.
8. **Never delete from the immutable tables:** `watchdog_findings`, `issue_decisions`,
   `cost_input_history`, `metrc_corrections`, `moisture_loss_entries`. (Rule H2.)
9. **A tile without a drill-down is not finished and must not ship.** (Rule C1.)
10. **Anchor scripted edits on the function signature**, never on a common line like
    `const [busy, setBusy]`. That caused three blank screens. (Rule F1.)
11. **Check units before comparing anything.** Grams per plant against grams per square foot
    produced a finding wrong by a factor of six. (Rules A4, B1–B4.)
12. **Never assume business practice — ask.** Model unknowns as an owner-set field defaulting
    to "not recorded", and say so on the page. (Rules A5, 7.)
13. **Verify against the live system before reporting.** Every expensive mistake in this build
    was an unchecked assumption. (Rule A6.)

---

## SECTION 1 — Collision map: where you will break each other

You are both working on one live database with no staging environment. These are the shared
surfaces. **Do not touch anything in this table without announcing it.**

| Shared resource | Risk | Rule |
|---|---|---|
| **The `anon` revoke** | A global `revoke … from anon` is a single action. If B runs it while A's import functions still need grants, imports break. If A re-grants narrowly, B's revoke is undone. | **Neither agent runs a blanket revoke.** Each publishes the list of functions its surface genuinely needs, then it is executed **once**, by one party, with both lists in hand. |
| **`watchdog_findings`** | Append-only by design (H2). A migration today took it from 100 rows to 43. | Nobody deletes from it. If a uniqueness constraint requires dedup, the deletion is recorded in `issue_decisions` with who and why, first. |
| **Materialized views** | `refresh` is expensive and 6 cron jobs already do it. Concurrent refreshes will lock. | Do not add refresh calls. Use the existing `tg_refresh_dashboards()`. |
| **`mv_department_dashboard`** | B is fixing the `Command` / `Command Center` mismatch. A must not change `department` values. | B owns the `department` vocabulary. |
| **`conversion_factors`** | Both agents will want to add thresholds. | Additive only. Never edit another agent's row; never change a `value` without recording `where_it_came_from` and `set_by`. |
| **`App.jsx`** (7,797 lines, single file) | Two agents editing one file will conflict badly. | **B owns `App.jsx` and `budz.jsx`.** A requests front-end changes from B rather than editing directly. |
| **Migrations** | 6 migrations landed in 7 minutes today. | Prefix every migration with your agent letter, e.g. `a_lab_results_map`, `b_metric_registry`. |
| **`git`** | Production code was uncommitted until today. | Commit your own work. Never commit another agent's working changes. Branch, do not work on `main`. |

---

## SECTION 2 — AGENT A · Metrc report imports

### Start here: your layer is in far better shape than `HANDOFF.md` claims

**Measured 7 August 2026, 11:40.** All 11 report types report `Up to date`, imported this
morning between 10:35 and 10:47. 435 imports completed. This is genuinely well-engineered —
signature-column auto-detection, per-report key columns, backup-before-import, and an
import-check harness.

| Report | Staged rows | Imports | API covers it? |
|---|---|---|---|
| `metrc_rpt_lab_results` | **39,531** | 42 | ❌ No — this report is the only route |
| `metrc_rpt_package_transfers` | **18,196** | 71 | ❌ No — only source of wholesale price |
| `metrc_rpt_wholesale` | 12,276 | 36 | ❌ No |
| `metrc_rpt_point_in_time` | **7,266** | 53 | ❌ No |
| `metrc_rpt_adjustments` | 4,414 | 47 | ✅ Yes |
| `metrc_rpt_plant_waste` | 4,396 | 36 | ❌ No |
| `metrc_rpt_plants_destroyed` | 3,773 | 32 | ❌ No |
| `metrc_rpt_test_batches` | 739 | 37 | ❌ No |
| `metrc_rpt_packages_inventory` | 508 | 33 | ✅ Yes |
| `metrc_rpt_harvests` | 380 | 22 | ✅ Yes |
| `metrc_rpt_harvest_moisture` | 350 | 26 | ❌ No — only source of moisture loss |
| `coa_extract` | 983 | — | |
| `metrc_import_backup` | 210,880 | — | |

**This corrects the record.** `HANDOFF.md` defect D5 says "Lab Results never imported — no
THC, TAC, terpenes or COA anywhere". The *import has happened* — 39,531 analyte rows are
staged. I repeated the old framing in my own audit and I am correcting it here.

### 🔴 A-1 — Your highest-value task: staged data is not reaching the platform

**Confirmed:** `metrc_rpt_lab_results` holds **39,531 rows**. `lab_result_values` holds
**0**. `coa_documents` holds **0**.

So 39,531 potency and terpene results are sitting in staging while every potency field on the
platform still correctly explains that the value is absent. **The data is in the building and
not on the shelves.** This is the single largest unrealised gain in the entire system — it
closes defect D5, and D5 sits underneath rule C3 ("every product shows THC, terpenes,
manufacturer, certificate, manifest").

**Do not guess which table is canonical.** There are now two possible homes for potency and
one is empty. Ask the owner (rule A5):

> "Should `lab_result_values` be populated from `metrc_rpt_lab_results`, or is
> `metrc_rpt_lab_results` now the canonical source and `lab_result_values` obsolete?"

Whichever it is, there must be exactly **one**. Two homes for the same fact, one empty, is
how a platform starts contradicting itself.

Then: **`f_potency_status()` and every potency field must read from the canonical table**, and
per rule C3, when data arrives it must **back-fill every past record automatically**.

### A-2 — Wire the point-in-time return honestly

`metrc_rpt_point_in_time` holds 7,266 rows across 53 imports. But the report's own
documentation in `v_report_mapping_status` states: *"carries NO quantity column, so it cannot
value a return on its own."*

**So D6 is still genuinely blocked, and correctly so.** Do not attempt to value the 2025
return from this file. Do not infer a quantity. Instead:

- Join point-in-time holdings to a quantity source and **state the join and its limits on the
  face of the report** (rule A2).
- Where a row has no quantity, show the gap and name it. Never fill it. (Rule A1, and the
  third unbreakable part of the tile rule: *never invent a number to fill a gap*.)
- Report what fraction of the 271 rows can be valued and what fraction cannot, with the
  dollar figure that is therefore missing.

### A-3 — Fix D7: malformed harvest names will misfile

Room suffixes appear as `f3` and `F3` (handled by `ilike`) but also as **`7f3` and `aF3`**,
which are malformed. Those harvests misfile silently. Add a validation check that raises a
finding for any harvest name not matching the expected pattern — and per rule D2, the fix
goes in `metrc_corrections` for correction *at source in Metrc*, not just locally.

### A-4 — Enforce the unit-column requirement at import time

`v_report_mapping_status` carries an explicit warning for `packages_transferred`:

> "TICK THE UNIT COLUMNS: the export defaults to omitting Shipped UoM and Received UoM, and
> without them a quantity is a bare number that cannot be converted or priced."

**A bare number that cannot be converted is exactly rule B1.** Make this a hard import
validation, not a note: if `Shipped UoM` / `Received UoM` are absent from an uploaded
`packages_transferred` file, **reject the import with a plain-English message telling the
user which checkbox to tick in Metrc.** Do not accept it and warn.

### FORTIFY — Agent A's checks and balances

These are yours to build, in your own domain:

1. **Idempotency proof.** Re-importing the same file must not double-count. You have
   `key_cols` per report type — assert a unique constraint on them and prove a re-import is a
   no-op. Test it with the largest file (39,531 rows).
2. **Stated-versus-stored reconciliation.** `tg_verify_import_group` exists — make it
   mandatory. If the file says 4,000 rows and 3,988 landed, the import is **failed**, not
   "mostly fine". (Rule C2.)
3. **Unmapped columns halt, never guess.** `metrc_report_unmapped` is currently empty, which
   is good — but confirm that is because nothing was unmapped, not because capture is broken.
   An unrecognised column must stop the import and ask. (Rules A1, A5.)
4. **Backup-before-import must be restorable.** `metrc_import_backup` holds 210,880 rows. A
   backup nobody has restored is a hope. Prove `tg_import_undo` actually restores, on a copy.
5. **Undo must be authorised and logged.** `tg_import_undo` can currently be called by
   `anon` (see A-6). It must require an authorised role and write who/when/why.
6. **Separation of duties.** `tg_agentmapper_propose` and `tg_agentmapper_approve` model
   four-eyes correctly — **enforce that the proposer and approver are different people.**
   Right now nothing checks.
7. **Provenance on every imported row.** Which file, which report type, when, by whom, which
   licence. (Rule A2.)
8. **Unit safety on every import path.** `f_to_pounds()` from the *actual* recorded unit;
   `f_is_weight()` decides whether a weight even exists. Countable items have no weight —
   never a pound figure for a vape. (Rules B1, B2.)
9. **Never mix wet and dry.** Fresh frozen is packaged wet. Never subtract a dry weight from a
   wet one — that once overstated open harvests by 3,800 lb. (Rules B3, B4.)
10. **Cadence alerting.** `v_report_upload_due` and `v_report_upload_alerts` exist. A monthly
    required report that is late must alert someone, not sit quietly.

### 🔴 A-6 — Security: most of the exposed write surface is yours

Of the 33 `SECURITY DEFINER` functions currently executable by **`anon`** (any anonymous
visitor, since the publishable key ships in the JS bundle), **these are in your domain**:

```
tg_import_report_do      tg_import_undo          tg_import_report
tg_import_preview        tg_backup_before_import tg_review_import
tg_run_import_checks     tg_verify_import_group  tg_map_lab_results
tg_map_adjustments       tg_map_test_batches     tg_capture_unmapped
f_automap_tag_column     trg_automap_on_import   tg_agentmapper_propose
tg_agentmapper_approve   agent_sheet_reconciliation
```

An unauthenticated stranger can, on paper, **undo your imports** and **approve your column
mappings**. `agent_sheet_reconciliation()` additionally has **no `search_path` set at all**,
which is the classic PostgreSQL privilege-escalation pattern.

Also yours: **`import_review` has RLS disabled entirely** and is anon-readable.

**Your action:** publish the list of functions your UI genuinely calls from the browser, and
which role calls them. Do **not** run a blanket revoke — that is coordinated (Section 1).
Then set `search_path = public, pg_temp` on every function you own.

---

## SECTION 3 — AGENT B · Everything else

### 🔴 B-1 — The Command Center dashboard shows zero tiles, in production

`App.jsx:6710` maps `dept_dash_command → "Command Center"`. `mv_department_dashboard` stores
**`"Command"`**. Proven: the app's query returns **0 rows**; the data has **8**.

Eight KPI tiles on the top-level dashboard render as nothing, and it looks partly alive
because `FlowStrip` and `MoneyBar` do render. Fix the mapping, then **audit all 11
`DEPT_BY_VIEW` values** against the view's actual department values.

### 🔴 B-2 — 127 of 153 queries fail silently. Fix the class, not the instances.

`App.jsx` swallows errors with `?? []` in **127** places, against 12 `catch` blocks and 15
`.error` checks. This is `CLAUDE.md` drift-risk #1, still fully present, and it is what hid
B-1 for who knows how long.

Build **one data-access wrapper** every query goes through: log the failure to
`watchdog_findings` (rule H2), throw, and show a visible banner naming the view that failed.
Then "no data" and "broken" can never look identical again — which is rule A3 enforced by
architecture instead of by memory.

Also: **zero error boundaries** exist. One render exception white-screens the entire OS. Add a
root boundary plus one per route.

### 🔴 B-3 — The CEO Dashboard states hardcoded numbers as live proof

`budz.jsx` `CeoDashboard` has frozen figures inside "proof" text: `"65 days"`,
`"Fulfillment Vault 7,962 lb"`, `"Cure Vault 2,082 lb"`, `"975 plants"`, `"29 of 143"`,
`"78 dried too long and 36"`, `"29.5 days average, worst 107"`, `"30 harvests … oldest at
190 days … 4,515 pounds"`, `"TG LMNT 115 #5 … 106 pounds"`.

It already contradicts itself on one page: one tile computes `${dryOk} of ${dry.length}`
**live** while a card below hardcodes `"29 of 143"`. Under rule C2 that is a bug.

**Keep the plain-English narrative — it is the best thing about that page.** Move the prose
to data (`metric_registry.plain_english` and a `metric_playbook` table) and delete every
frozen number.

### 🔴 B-4 — Thresholds contradict the owner's own locked rules

| Rule | `conversion_factors` (authoritative) | Code | |
|---|---|---|---|
| Harvest open limit | `harvest_open_max_days` = **28** | `> 21` | ❌ |
| Dry window | min **10**, max **14** | `>= 7 && <= 16` | ❌ |
| Dry window label | 10–14 | label says 10–14 but counts 7–16 | ❌ |

The `harvest_open_max_days` provenance note explicitly says the limit is *"not 21 or 65"*. The
CEO dashboard uses 21 anyway and titles the tile "Harvests open past 21 days". Route
everything through `f_rule()` (rule G4) and rename the `kpi_targets` row.

### B-5 — The literal `)}` on the Executive Control Tower

`App.jsx:3568` has a stray `)}` inside JSX. Not a syntax error, so it shipped — React renders
it as **visible text** under each metric group. Confirmed by
`esbuild --loader:.jsx=jsx src/App.jsx`, which warns
*"The character `}` is not valid inside a JSX element"*. Fifteen-second fix, and proof that
nothing lints this code.

### B-6 — The dashboard standard is only partly met

Measured against Rule 10:

| Requirement | Status |
|---|---|
| Forensic drill on every tile | ✅ **43 of 43.** Fully compliant |
| Entity cards, failed material split ours/third-party on the tile face | ✅ Met (rule C6) |
| Honest empty states | ✅ Consistently excellent |
| Target on every tile, red on breach | ⚠️ **7 targets / 43 tiles = 16%** |
| Trend sparkline from real snapshots | ⚠️ Only **2 days** of `dashboard_snapshots`; 34 of 70 pairs correctly say "no history yet" |
| Collapsible sections remembered per user | ❌ `Section` uses local state; resets every visit |
| Users personalise the two masters | ❌ `dashboards` and `dashboard_widgets` are **empty**; no drag-to-rearrange exists |
| Assign from the tile | ⚠️ Built and working, but **`tasks` is empty** — never used in production |
| Everything replicates up to the two masters | ❌ The three tiers compute independently — this is *why* B-4 happened |

**Assessed:** with only 2 snapshot points a sparkline is a straight line that reads as a
confident trend and conveys nothing. Suppress it below ~7 points.

### B-7 — Architecture and performance

- **No router.** Navigation is React state, so no deep links, no working Back button, no
  bookmarks, and all **902 KB** of JavaScript loads before first paint. Adopt `react-router`,
  map `nav_registry.view_key` to real paths, add code splitting.
- **Aggregation is happening in the browser.** `runWidget` with `agg === "sum"` pulls every
  matching row and reduces client-side. `CeoDashboard` pulls ~4,800 rows on every mount.
  Aggregate in PostgreSQL and return the scalar.
- **No virtualisation** anywhere — a 2,690-row manifest ledger becomes 2,690 DOM nodes. Add
  `react-window` above ~100 rows.
- **307 `useState`, 86 `useEffect`, 12 `useMemo`/`useCallback`** in one 7,797-line file.
  Split by feature; memoise the hot paths.
- **Database performance: 414 advisor findings.** Start with the **84 `auth_rls_initplan`**
  policies — they re-evaluate `auth.uid()` *per row*, and since policies call
  `is_executive()` which queries `app_users`, one page can trigger thousands of lookups. Wrap
  as `(select auth.uid())`. Then 207 multiple-permissive-policies, 91 unindexed foreign keys,
  3 duplicate indexes, 1 table with no primary key.

### 🔴 B-8 — Security: the anon read exposure, and the trap inside it

**30 relations return real rows to `anon`** — including `v_customer_directory` (214),
`v_customers` (127), `v_manifest_ledger` (2,690), `v_wholesale_reconciliation` (2,537),
`v_sales_history_monthly`, `mv_package_documents` (3,548). `HANDOFF.md` §6 claims "0 views
readable"; that is the opposite of true, and it must be corrected so nobody stops looking.

**⚠️ THE TRAP — read this before you revoke anything.**

`useNav(navVersion)` at `App.jsx:300` runs at mount with dependencies `[version]` only, and
`if (!session) return <Auth />` sits at **line 7549 — after every hook**. So the nav menu is
fetched **while the user is still anonymous**, and because `navVersion` never changes on
sign-in, `useNav` **never re-fetches after login**.

**Your entire menu system currently works *because* `anon` can read `nav_registry`.**

Revoking anon on `nav_registry` without first making `useNav` depend on the session will
**empty the sidebar and make the app unusable.** Ship both changes together. Expect two or
three more couplings like this — hunt for them before revoking, not after.

Also yours: enable RLS on `_mv_dept_backup` (looks like leftover scaffolding — confirm, then
drop it), add policies to `dashboard_snapshots` and `lab_result_values` (RLS on, no policy),
move `pg_net` and `pg_trgm` out of `public`, enable leaked-password protection.

### B-9 — Adoption is the real blocker, not features

**2 `app_users` against 21 `employees`.** A dashboard builder already ships with 26 catalogue
widgets and **has never been used** — zero dashboards. `tasks` is empty. You are replacing
ClickUp; nobody has switched yet.

Also: **owner accounts still use build-phase passwords.** Change before staff onboarding.

### FORTIFY — Agent B's checks and balances

1. **ESLint + CI that actually gates**, with `react-hooks/exhaustive-deps` enabled (the code
   currently disables it in places). Would have caught B-5.
2. **No-hardcoded-numbers lint** — fail CI on 3+ digit literals and on `lb`/`$`/`%` adjacent
   to a literal inside dashboard components, with an explicit
   `// provenance: <rule_key>` escape so exceptions are visible. Prevents B-3.
3. **Drill-coverage gate** — CI fails if any tile lacks a drill, any metric lacks a
   `target_rule_key`, or any nav entry points at a non-existent relation. Turns Rule 10 into a
   build failure.
4. **Migration safety gate** — reject any migration containing `drop view … cascade`
   (rule E1) or `grant … to anon` (rule E6).
5. **Reconciliation invariant** — for every tile, the sum of its drill rows equals the tile
   value (rule C2), asserted continuously rather than trusted.
6. **Unit-safety invariant** — no view adds or compares a weight to a count; no expression
   subtracts a dry weight from a wet one.

### B-10 — The keystone: build `metric_registry`

The three dashboard tiers compute independently from different sources with different
thresholds. That is the root cause of B-4, and it means the same business fact can appear
three times with three values. Build one definition per metric:

```
metric_registry
  metric_key (pk), label, plain_english, department, unit, format,
  sql_source, drill_view, target_rule_key, direction,
  rolls_up_to_metric, weight_in_parent, owner_role,
  provenance_note, is_headline_for
```

Roll-up becomes **data** via `rolls_up_to_metric`, so a CEO tile is derived from its
departments and **cannot disagree with them**. Thresholds resolve via `target_rule_key`, so
B-4 becomes structurally impossible. A metric without `drill_view` fails CI, enforcing rule
C1. Then generate the CEO Dashboard and Control Tower from it rather than hand-writing them.

Then: `page_preferences` (per-user column visibility, order, width, sort, filters, density,
plus a dept-head "publish as team default") and one unified `<Tile>` used by every surface,
so custom dashboards inherit targets, sparklines, deltas, assign and drill automatically.

**Customisation guardrails:** compliance columns (package tag, licence, test status) cannot be
hidden; hidden columns are disclosed on the page face; exports state who/when/which
filter/which columns hidden; provenance survives customisation.

---

## SECTION 4 — Watchdog charter

I verify. I do not build. I report to the owner.

### What I check, and how

**Every check below is a query or command I run against the live system — not a review of what
an agent tells me it did.** Rule A6: verify against the live system before reporting.

| # | Check | Method |
|---|---|---|
| 1 | **Anon exposure has not regressed** | Assume the `anon` role; count rows on every grantable relation; check `EXECUTE` on every function. Expect zero and zero. |
| 2 | **No new `SECURITY DEFINER` function without `search_path`** | `pg_proc` where `prosecdef` and `proconfig is null`. |
| 3 | **Immutable tables have not shrunk** | Row counts on `watchdog_findings`, `issue_decisions`, `cost_input_history`, `metrc_corrections`, `moisture_loss_entries`, tracked over time. A decrease is a rule H2 breach. |
| 4 | **No hardcoded numbers entered the dashboards** | Pattern scan of `App.jsx` / `budz.jsx` for multi-digit literals and unit-adjacent constants. |
| 5 | **Thresholds match `conversion_factors`** | Cross-check every numeric comparison in the front end against `f_rule()` keys. |
| 6 | **Every tile still drills** | `mv_department_dashboard` and `metric_registry` where `drill is null`. |
| 7 | **Nav integrity** | Every enabled `nav_registry.table_ref` resolves to a real relation. |
| 8 | **Matviews populated, cron succeeding** | `pg_matviews.ispopulated`; `cron.job_run_details` last status per job. |
| 9 | **Totals reconcile to items** | Sample tiles; compare the headline to the sum of its drill rows (rule C2). |
| 10 | **Theme untouched** | `git diff` on `styles.css` and `rules.css` — any colour change is a stop-work event. |
| 11 | **Import integrity** | Staged row counts versus canonical destinations; stated-versus-stored per import; idempotency on re-import. |
| 12 | **Source still parses cleanly** | `esbuild --loader:.jsx=jsx` — zero warnings. |
| 13 | **Production is committed** | No uncommitted source behind the deployed bundle. This was violated until today. |
| 14 | **Schema drift** | Table/view/matview/cron/nav counts against the last recorded baseline, so changes are always attributed. |

### Baseline as at 7 August 2026, 11:40

Any deviation from these gets attributed to an agent and reported:

| Measure | Value |
|---|---|
| Base tables | 221 |
| Views | 219 |
| Materialized views | 9 (all populated) |
| Cron jobs | 23 (all succeeding) |
| Enabled nav entries | 278 |
| Broken nav entries | 0 |
| Relations readable by `anon` | **30 — must reach 0** |
| Functions executable by `anon` | **131, of which 42 `SECURITY DEFINER`, 33 writing — must reach 0** |
| `SECURITY DEFINER` fns with no `search_path` | 29 |
| Security advisor findings | 341 |
| Performance advisor findings | 414 |
| `watchdog_findings` | 43 (was 100 earlier today) |
| `open_questions` | 44 |
| `golive_items` | 184 |
| `tasks` / `dashboards` / `dashboard_widgets` / `kpi_snapshots` | 0 / 0 / 0 / 0 |
| `lab_result_values` / `coa_documents` | 0 / 0 |
| `kpi_targets` | 7 (against 43 tiles) |
| Live bundle | `index-CJcM9QS0.js` |
| Deployed commit | `6786126` |

### How I report

Per pass, to the owner, in plain English: **what changed, who changed it, which rule it
serves or breaks, and what I could not verify.** I state "confirmed" only for what I measured
and "assessed" for judgement. I name gaps in my own coverage rather than implying completeness.

**The one thing I cannot check:** the platform as a signed-in user. That needs a live session
for a real account, and I will not set someone else's password. Every UI-level defect
reachable only behind login is outside my coverage, and I will keep saying so rather than let
silence imply otherwise.

---

## SECTION 5 — Corrections to the existing documentation

Both agents should know these, because the current documents will mislead you:

| Document says | Actually true | |
|---|---|---|
| `HANDOFF.md` §6: "Anon access: 0 views readable" | 30 relations return real data to `anon` | ❌ **Opposite of true** |
| `HANDOFF.md` D4: front end "NOT DEPLOYED" | It **is** deployed — live bundle matches `dist` byte for byte | ✅ Closed |
| `HANDOFF.md` D5: "Lab Results never imported" | **39,531 rows are staged.** The gap is staging → canonical, not the import | ⚠️ **Materially changed** |
| `HANDOFF.md`: "4 nav entries point at views that do not exist" | Zero broken. `v_open_issues` exists | ✅ Closed |
| `HANDOFF.md`: 176 tables / 177 views / 7 matviews / 19 cron / 262 nav | 221 / 219 / 9 / 23 / 278 | ❌ Stale |
| `HANDOFF.md`: 30 open questions, 173 go-live items | 44 and 184 | ❌ Stale |
| `HANDOFF.md`: `App.jsx` ~6,400 lines | 7,797 | ❌ Stale |
| My own audit, Part 10 step 3: blanket anon revoke | **Unsafe standalone** — see the `useNav` trap in B-8 | ❌ **My error, corrected** |
| My own audit, D5 framing | Repeated the "never imported" claim. The import has happened | ❌ **My error, corrected** |

**Treat `HANDOFF.md` as a generated artefact.** A nightly job should write these counts to a
`platform_state` table so this can never drift again. Until that exists, do not trust a number
in it without re-measuring.
