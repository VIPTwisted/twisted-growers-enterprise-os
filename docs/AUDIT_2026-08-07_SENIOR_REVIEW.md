# Twisted Growers Enterprise OS — Independent Senior Engineering Review

**Date:** 7 August 2026
**Scope:** the whole repository, the live Supabase project `fxetuqjryttnypgepsru`, and the
live Netlify deployment `twisted-growers-enterprise-os.netlify.app`.
**Changes made to the site or the database:** **none.** This review is read-only. Every
figure below was measured, not assumed, and the query that produced it is named so you can
re-run it yourself.

---

## PART 0 — How to read this document

This is written to be read by you, not by an engineer. Every section has:

- **What I found** — plain English.
- **Why it matters** — in money, risk or time.
- **The evidence** — so you never have to take my word for it.
- **What to do** — concrete, sequenced.

Two words I use precisely:

- **Confirmed** — I ran a query or a command and saw the result myself.
- **Assessed** — my professional judgement, not a measurement. I label these honestly.

### What I did NOT do, and why

Being explicit, in keeping with the standard this project already holds itself to:

| Not done | Why |
|---|---|
| Signed-in walkthrough of all 278 pages | Requires a live session as a real user. I will not set someone else's password. This is the single biggest remaining gap in this review, and I flag it rather than pretend coverage. |
| Executed any of the write functions I found exposed | Executing them would change data. Confirming the exposure did not require it. |
| Committed, deployed, built, or fixed anything | You asked for no changes. Note the build directory is also the deploy directory, so even a local `npm run build` would have altered deployable state. I did not run one. |
| Read all 215 view definitions line by line | I sampled and pattern-matched at scale instead. Assessed, not confirmed, where noted. |

---

## PART 1 — The headline: your documentation and your live system disagree

Before any list of improvements, this is the finding that matters most, because it
undermines every other decision you make.

`HANDOFF.md` is the stated single source of truth for *state*. **It is materially out of
date, and in one place it states the opposite of the truth.** A new agent or engineer
reading it would make wrong decisions on day one.

| `HANDOFF.md` says | Actually true on 7 Aug 2026 | Verdict |
|---|---|---|
| "Anon access: **0 views readable** after the second revoke pass" | **30 relations return real rows to `anon`**, including customers, manifests, wholesale money and package documents | ❌ **The opposite of true** |
| "176 base tables · 177 views · 7 materialized views · 19 cron jobs · 262 nav entries" | **218 tables · 215 views · 9 matviews · 23 cron jobs · 278 enabled nav entries** | ❌ Stale |
| "D4 · Front end built and staged but **NOT DEPLOYED**" | **It is deployed.** Live bundle `index-CJcM9QS0.js` is byte-identical to local `dist` | ✅ Defect already closed |
| "4 navigation entries point at views that do not exist" | **Zero broken nav entries.** `v_open_issues` exists again | ✅ Already fixed |
| "Open questions for the owner: **30**" | **44** | ❌ Grew (consistent with defect D2) |
| "Go-live items open: **173**" | **184** | ❌ Grew |
| "App.jsx (~6,400 lines)" | **7,797 lines** | ❌ Stale |

**Why this matters:** you are running a freeze so that a handover is safe. A handover
document that says "anon access is revoked" when 30 relations are readable is worse than no
document — it actively stops the next person from looking.

**What to do:** treat `HANDOFF.md` as a generated artefact, not a hand-written one. See
*Part 8, Check 1* — a nightly job should write these counts, so they can never drift again.

---

## PART 2 — Security. Read this part first, and act on it this week.

I ran Supabase's own security advisor and then verified its claims independently against the
live database. The advisor returned **341 findings**. Here is the breakdown, then the three
that actually matter.

| Level | Count | Finding |
|---|---|---|
| ERROR | 201 | `security_definer_view` — view runs as its owner, bypassing row-level security |
| WARN | 53 | SECURITY DEFINER function executable by `authenticated` |
| WARN | **42** | **SECURITY DEFINER function executable by `anon`** |
| WARN | 29 | Function with a mutable `search_path` |
| WARN | 9 | Materialized view exposed through the API |
| ERROR | 2 | RLS disabled on a public table |
| INFO | 2 | RLS enabled but no policy exists |
| WARN | 2 | Extension installed in `public` (`pg_net`, `pg_trgm`) |
| WARN | 1 | Leaked-password protection disabled |

### 🔴 CRITICAL 1 — An unauthenticated stranger can write to your database

This is the most serious finding in this review.

**Confirmed:** `anon` — the role every anonymous visitor to your website holds — can
`EXECUTE` **131 functions**, of which **42 are `SECURITY DEFINER`**, of which **33 contain
`INSERT`, `UPDATE`, `DELETE` or `REFRESH`**.

`SECURITY DEFINER` means the function runs *as its owner*, so row-level security does not
apply. Anyone on the internet can call these over the public REST API. The exposed write
functions include:

| Function | What a stranger could do |
|---|---|
| `tg_import_undo(p_id, p_note)` | **Roll back one of your data imports** |
| `tg_import_report_do(...)` | **Push arbitrary rows into your Metrc report tables** |
| `bootstrap_app_user()` | Touch user provisioning |
| `tg_task_from_dashboard(...)` | Create tasks assigned to named staff |
| `tg_agentmapper_approve(...)` | **Approve a column mapping without review** |
| `tg_resolve_challenge(...)` | Close out a challenge to a metric |
| `tg_review_import(...)` | Mark an import as reviewed |
| `tg_map_lab_results(...)` | Write into lab-result mapping |
| `tg_refresh_dashboards()`, `tg_snapshot_dashboards()` | Force expensive refreshes repeatedly — a denial-of-service lever |
| `tg_sweep_unknowns()` | Regenerate the owner's open-questions list |

Worse: three of these have **no `search_path` set at all** — `agent_sheet_reconciliation()`,
`audit_row()`, `audit_secret_touch()`. A `SECURITY DEFINER` function with a mutable
`search_path` is the classic PostgreSQL privilege-escalation pattern. `audit_row` and
`audit_secret_touch` are audit-trail functions, which is precisely where an attacker would
want to interfere.

**Is this exploitable in practice? Yes.** Your publishable key is hardcoded in
`app/web/src/lib/supabase.js` and therefore ships inside the JavaScript bundle to every
visitor. That is correct and normal for a publishable key — but it means the only thing
standing between the internet and these functions is that nobody has looked yet.

> **Important nuance, stated honestly:** I did **not** execute any of these functions,
> because doing so would have changed your data. What I confirmed is the *grant* — that
> `anon` holds `EXECUTE` and the function is `SECURITY DEFINER` and contains writes. Several
> may fail on an internal permission check or a null argument. I am reporting an
> unacceptable **attack surface**, not 33 proven exploits. That distinction matters, and the
> correct response to it is the same either way: revoke.

**What to do — highest priority in this document:**

1. `revoke execute on all functions in schema public from anon;`
2. Re-grant `EXECUTE` to `authenticated` only for the specific functions the signed-in app
   actually calls. From the front-end code that is a short list — `tg_task_from_dashboard`,
   `tg_snapshot_dashboards`, and a handful of others.
3. Set `search_path = public, pg_temp` on **every** `SECURITY DEFINER` function. 29 currently
   lack it.
4. Add the regression test in *Part 8, Check 2*, so this can never come back.

### 🔴 CRITICAL 2 — 30 relations leak real business data to anonymous visitors

`HANDOFF.md` §6 states anon access was revoked and "0 views readable". **That is not true
now.** I tested empirically — I assumed the `anon` role and counted rows on every relation
`anon` can select from. 248 relations carry a grant; **30 return real data.**

| Relation | Rows exposed | What it contains |
|---|---|---|
| `v_metrc_facility_names` | 3,704 | Facility names |
| `mv_package_documents` | 3,548 | Package documents |
| `v_manifest_ledger` | 2,690 | **Transfer manifests** |
| `v_wholesale_reconciliation` | 2,537 | **Wholesale money** |
| `v_sync_report` | 2,385 | Sync detail |
| `v_catalogue_items` | 1,177 | Item catalogue |
| `v_findings` | 862 | Watchdog findings |
| `v_adjustment_conflicts` | 652 | Adjustment conflicts |
| `v_harvest_report` | 380 | Harvest detail |
| `v_facility_registry` | 216 | Facilities |
| `v_customer_directory` | 214 | **Customer directory** |
| `v_catalogue_strains` | 209 | Your strains |
| `v_customers` | 127 | **Customers** |
| `v_sales_history_monthly` | 58 | **Sales history** |
| `v_strain_performance` | 45 | Strain performance |
| `mv_tower_inventory` | 22 | Inventory |
| `import_review`, `_mv_dept_backup`, `ai_bridge_jobs`, +11 more | 1–18 each | Assorted |

That is your customer list, your manifests, your wholesale figures and your strain
performance — readable by anyone who opens your website and reads the key out of the
bundle. It is the exact category of exposure §6 says was closed.

**Why the previous fix did not hold:** the revoke pass covered *the views that existed on
6 August*. It did not (a) revoke the underlying **table** grants, (b) cover **materialized
views**, which cannot carry RLS at all, or (c) install anything that prevents the next new
view from being exposed. There were 177 views then and there are 215 now. The surface grew
straight back.

**A structural point worth understanding:** for the ~95 base tables where `anon` holds a
grant, your data is currently protected *only* by RLS — the `exec_all` policy applying
`is_executive()` to `PUBLIC`. The grant was never removed. That is a single layer of
defence where you should have two. If one policy is ever written slightly wrong, or RLS is
disabled on a table during maintenance, data is exposed instantly and silently. Two tables
are in exactly that state right now: **`_mv_dept_backup` and `import_review` have RLS
disabled entirely.**

**What to do:**

1. `revoke all on all tables in schema public from anon;` — the app authenticates; `anon`
   needs nothing.
2. Enable RLS on `_mv_dept_backup` and `import_review`. `_mv_dept_backup` looks like leftover
   scaffolding — confirm, then drop it.
3. Add policies to `dashboard_snapshots` and `lab_result_values`, which have RLS on but no
   policy (currently deny-all, which is safe but almost certainly unintended — it will
   silently break sparklines and lab imports later).
4. Move `pg_net` and `pg_trgm` out of `public`.
5. Turn on leaked-password protection.
6. Automate the check — *Part 8, Check 2*.

### 🔴 CRITICAL 3 — A live database password is committed to git and pushed

**Confirmed.** `.mcp.json` is tracked in git and contains a working connection string in
plaintext:

```
postgresql://tg_desktop_reader.fxetuqjryttnypgepsru:TGdesk-2026-r3ad0nly-8f3k2m@...?sslmode=no-verify
```

- Present in commits **`a0fe5aa`** and **`9af82a7`**, and **pushed to `origin/main`**.
- `.gitignore` covers `.env`, `bridge/token.txt` and logs — but **not** `.mcp.json`.
- `sslmode=no-verify` disables certificate validation, so the connection is also open to a
  machine-in-the-middle.

`tg_desktop_reader` is read-only, which limits the damage — but per the policy list above
it can read `employees`, `employee_rates`, `customers`, `invoices`, `cash_snapshots` and
`metrc_packages` with `using (true)`. That is payroll and customer data.

**What to do:**

1. **Rotate that password now.** It must be treated as public.
2. Add `.mcp.json` to `.gitignore`; commit a `.mcp.json.example` with a placeholder.
3. Purge it from history (`git filter-repo`) — or, if that is disruptive, accept that
   rotation is the real control and the old value is permanently burned.
4. Remove `sslmode=no-verify`; use `sslmode=require` with the Supabase CA.
5. Add a secret-scanning pre-commit hook — *Part 8, Check 3*.

### 🟠 The 201 `security_definer_view` errors

Every one of your views runs with its creator's privileges rather than the caller's. It is
how the platform was built and it is *why* the RLS-based protections work at all — so this
is not a "fix all 201" item. But it means **the view layer is your entire access-control
boundary.** One view accidentally granted to the wrong role exposes everything it selects,
regardless of RLS on the tables underneath. That is exactly what happened in Critical 2.

**Assessed recommendation:** for genuinely multi-role data, convert to
`security_invoker = true` views over RLS-protected tables, so the caller's identity is
enforced by the database rather than by which view you happened to grant. This is a
significant refactor — schedule it deliberately, do not attempt it during a freeze.

---

## PART 3 — Correctness: real bugs, found and proven

### 🔴 BUG 1 — Your Command Center dashboard shows zero key figures

This is live, in production, on your most important departmental page.

**The cause:**

- `App.jsx:6710` maps the page to a department name: `dept_dash_command: "Command Center"`
- `App.jsx:7027` queries: `.from("mv_department_dashboard").eq("department", dept)`
- But the data is stored under **`"Command"`**, not `"Command Center"`.

**Proven:**

| Query | Tiles returned |
|---|---|
| `where department = 'Command Center'` (what the app asks for) | **0** |
| `where department = 'Command'` (what exists) | **8** |

So eight Command Center KPI tiles — the top of your whole hierarchy — render as nothing.

**And this is why it went unnoticed:** line 7034 is `setRows(k.data ?? [])`. The query
returns an empty set, not an error, so the page renders happily with the subtitle "Live
from the records" above an empty grid. `FlowStrip` and `MoneyBar` *do* render (they check
for `"Command Center"` and pass), so the page looks partly alive. This is the
error-swallowing pattern in `CLAUDE.md` drift-risk #1 doing exactly what that rule warns
about.

**Fix:** one word — either the map value or the view's `department` value. **But fix the
class of bug, not the instance:** see BUG 3 and *Part 8, Check 4*.

### 🔴 BUG 2 — Your CEO Dashboard states hardcoded numbers as live proof

This breaks the platform's own most important rule (`A1. Never invent a number`,
`A2. Every figure carries its provenance`, `G1. Nothing is hardcoded`) — on the one page an
executive is most likely to act from.

`budz.jsx` `CeoDashboard` mixes live computed values with **numbers frozen into template
strings**. Confirmed examples:

- `"Average across all open harvests is 65 days."`
- `"By room: Fulfillment Vault 7,962 lb sitting across 16 open, Cure Vault 2,082 lb across 4, Pre Trim Storage 786 lb across 6, Dry Room #2 882 lb across 4"`
- `"Dry Room #2 has four harvests, 975 plants and 882 lb wet with zero packaged."`
- `"only 29 of 143 harvests dried inside the 10 to 14 day window. 78 dried too long and 36 dried in under seven days"`
- `"Fulfillment Vault 29.5 days average, worst 107 ... Cure Vault 26.4 days average, worst 57, 17 over"`
- `"30 harvests are sitting open, averaging 65 days and the oldest at 190 days, with roughly 4,515 pounds"`
- `"TG LMNT 115 #5 from 27 January has been open 190 days with 106 pounds"`

These were true on the day they were typed. They are now permanent. **The dashboard will
state them as fact forever, with total confidence, as the real numbers drift away.**

It is already self-contradictory. On the same page:

- One tile computes `${dryOk} of ${dry.length}` **live**.
- A card below states `"only 29 of 143"` **hardcoded**.

Those two numbers describe the same quantity and will disagree. An executive reading that
page cannot tell which is real. Under rule C2 ("totals must reconcile") this is a bug, not
a cosmetic issue.

**Fix:** every one of these must come from a view with its own provenance, or be deleted.
Nothing in between. Then add *Part 8, Check 5* to stop it recurring.

### 🔴 BUG 3 — Thresholds are hardcoded and contradict your own locked rules

Your `conversion_factors` table is the designed home for every threshold, and it is
excellent — each row carries `label`, `what_it_means`, `where_it_came_from`, `set_by` and
`evidence_status`. That is better provenance than most enterprise systems have.

**The CEO Dashboard ignores it.**

| Rule | `conversion_factors` (authoritative) | `CeoDashboard` code | Verdict |
|---|---|---|---|
| Harvest open limit | `harvest_open_max_days` = **28** | `total_days_start_to_now > 21` | ❌ **Contradicts** |
| Dry window | `dry_window_min_days` = **10**, `dry_window_max_days` = **14** | `>= 7 && <= 16` | ❌ **Contradicts** |
| Dry window label | 10–14 | label says `"target 10–14"` but counts against 7–16 | ❌ **Label lies about its own maths** |

The `harvest_open_max_days` row is emphatic. Its `where_it_came_from` reads:

> "…28 days on the median across 141 scheduled pulls (minimum 21). That is the schedule the
> business is run to, so it is the limit, **not 21 or 65**."

The owner explicitly ruled out 21. The CEO Dashboard uses 21 anyway, and the tile is
literally titled "Harvests open past 21 days". `kpi_targets` carries the same wrong name.
So the number an executive sees is measured against a limit the owner rejected in writing.

**Fix:** these must resolve through `f_rule()`. That function exists precisely for this.

### 🟡 BUG 4 — Literal `)}` is printed on the Executive Control Tower

`App.jsx:3568` has a stray `)}` inside JSX. It is not a syntax error — which is why it
shipped — but React renders it as **visible text**. esbuild flags it:

```
▲ [WARNING] The character "}" is not valid inside a JSX element
    src/App.jsx:3568:11:
      3568 │           )}
```

So the characters `)}` appear on the page under each metric group on your Control Tower.
Confirmed by parsing the file. Fifteen-second fix; it is here because it demonstrates that
**nothing is linting this code** — see Part 4.

### 🟡 BUG 5 — Sparklines cannot work yet, and 84% of tiles have no target

Your dashboard standard requires a trend sparkline and an owner-set target on *every* tile.
Measured:

| Requirement | Reality |
|---|---|
| Trend from real daily snapshots | `dashboard_snapshots` holds **2 days only** (6 and 7 Aug). 36 of 70 KPI/department pairs have ≥2 points; the other **34 correctly show "no history yet"** |
| Owner-set target on every tile | **7 targets** exist, across 4 of 11 departments. There are **43 tiles** — so **36 tiles (84%) have no target** and can never turn red |
| Forensic drill on every tile | ✅ **43 of 43 tiles have a drill.** Fully compliant — credit where due |

The sparkline behaviour is *honest* — `Spark` correctly says "no history yet" below two
points rather than drawing a fake line, which is exactly right and exactly what rule 10
demands. It simply needs time and a reliable nightly snapshot. But note: with only two
points a sparkline is a straight line between them, which reads as a confident trend and
conveys nothing. **Assessed:** suppress the sparkline until you have ~7 points.

The target gap is the bigger issue: a red-when-breached rail that exists on 16% of tiles is
not a control system.

---

## PART 4 — Front-end architecture: the honest assessment

Your instinct that "the pages and the overall site" have problems is correct, and the
reasons are structural rather than cosmetic.

**Measured:**

| Metric | Value | Comment |
|---|---|---|
| `App.jsx` | **7,797 lines**, 91 components | Single file |
| `budz.jsx` | 2,023 lines | |
| `useState` calls | **307** | |
| `useEffect` calls | **86** | |
| `useMemo` / `useCallback` | **12** | Almost no memoisation against 307 state hooks |
| Supabase queries in `App.jsx` | **153** | |
| `?? []` error-swallows | **127** | |
| `catch` blocks | **12** | |
| `.error` checks | **15** | |
| Error boundaries | **0** | |
| List virtualisation | **0** | |
| Tests | **0** | No test framework installed |
| Linter / TypeScript / CI | **none** | |
| Router | **none** | |

### 🔴 The single most damaging pattern: `?? []`

**127 of 153 queries discard their errors.** The consequence is precisely the failure mode
your own `CLAUDE.md` documents as drift-risk #1: *"Every dashboard went blank with no
error, because `App.jsx` swallows the failure with `k.data ?? []`."*

That is not a historical note. It is still the current architecture, and BUG 1 is a live
instance of it — a dashboard that has been silently empty rather than loudly broken.

**What this costs you:** every failure — a dropped view, a revoked grant, a typo'd
department, an RLS policy change, a network blip — presents identically: an empty page that
claims to be live. You cannot operate an enterprise OS where "no data" and "broken" look
the same.

**Fix (the highest-leverage change in this document):** one data-access wrapper that every
query goes through.

```js
// Illustrative only — not applied.
async function q(label, builder) {
  const { data, error } = await builder;
  if (error) {
    reportToWatchdog(label, error);          // forensic row, per rule H2
    throw new DataError(label, error);        // visible, never silent
  }
  return data ?? [];
}
```

Then: empty means empty, and broken means a red banner naming the view that failed. Rule
A3 ("absence is explained, never blank") becomes enforceable by the architecture rather
than by everyone remembering.

### 🔴 No error boundary

Zero `ErrorBoundary` components. One render-time exception anywhere in a 7,797-line tree
white-screens the entire OS. For a system people run a licensed facility on, that is not
acceptable. Add a boundary per route, plus one at the root.

### 🟠 No router — the biggest "it doesn't feel like an OS" cause

Navigation is React state (`setView`). Consequences:

- No deep links. You cannot send a colleague "look at this page".
- The browser Back button does not work as expected.
- No bookmarks, no refresh-in-place — a reload dumps you at the start.
- No per-page code splitting, so all **902 KB** of JavaScript loads before anything renders.

You asked for Microsoft/Google-grade. Addressable URLs are table stakes. Adopt
`react-router`, map `nav_registry.view_key` to real paths (`/cultivation/harvests`), and the
site immediately feels like an application rather than a kiosk.

### 🟠 Performance: aggregation is happening in the browser

Two confirmed patterns pull whole tables to the client and reduce them in JavaScript:

1. **`runWidget` with `agg === "sum"`** selects the value column for *every matching row*
   and sums it client-side. On a table like `mv_package_documents` (3,548 rows) that is a
   full transfer per widget, per load.
2. **`CeoDashboard`** issues 13 queries with limits of 2000, 1200, 600, 400, 300, 300 — up
   to roughly **4,800 rows** on every mount — then aggregates in JS.

Meanwhile there is **no virtualisation anywhere**, so a 2,690-row manifest ledger becomes
2,690 live DOM nodes.

**Fix:** aggregate in PostgreSQL — it is what it is for. Expose one row per widget from a
view or an RPC returning the scalar. Add `react-window` for any table over ~100 rows.
**Assessed:** this alone will make the site feel several times faster.

### 🟠 Database performance debt — 414 findings

| Count | Finding | Impact |
|---|---|---|
| **207** | Multiple permissive policies on the same table/role/action | Every policy is evaluated on every query. Directly slows all reads |
| **91** | Unindexed foreign keys | Slow joins; slow cascading deletes |
| **84** | `auth_rls_initplan` — policy re-evaluates `auth.uid()` **per row** | **The most costly item.** Wrap as `(select auth.uid())` so it evaluates once |
| 27 | Unused indexes | Wasted write cost |
| 3 | Duplicate indexes (e.g. `metrc_items`) | Pure waste |
| 1 | Table with no primary key | Cannot replicate or safely upsert |

The 84 `auth_rls_initplan` findings are worth fixing first — mechanical, low-risk, and they
touch every read in the system. Your policies call `is_executive()`, which itself queries
`app_users`; per-row evaluation means that lookup can run thousands of times for one page.

### 🟡 Deployed code is not in version control

`git status` shows **four modified, uncommitted files**: `App.jsx`, `budz.jsx`, `rules.css`,
`styles.css`. The `dist` bundle was built *after* those edits and is byte-identical to what
is live.

**So the running production site is code that exists only in your working directory.** If
that directory is lost, the live system cannot be reproduced. Commit before anything else.

---

## PART 5 — Scorecard against your own dashboard standard

Rule 10 of `CLAUDE.md` is the bar. Measured against it:

| Requirement | Status | Evidence |
|---|---|---|
| Live KPI tiles with unit and colour rail | ✅ **Met** | `DeptDashboard` |
| Target on the tile, red on breach | ⚠️ **16%** | 7 targets / 43 tiles |
| Trend sparkline from real snapshots | ⚠️ **Partly** | 2 days of history; honest empty state ✅ |
| Change since yesterday in words | ✅ **Met** | `WhatChanged`, `delta()` |
| Forensic drill on every tile | ✅ **100%** | 43 of 43 have a drill |
| Assign from the tile, capturing the value | ⚠️ **Built, never used** | `AssignTask` + `tg_task_from_dashboard` exist; **`tasks` table is empty** |
| Entity cards per stream/room/supplier | ✅ **Met, and good** | Stock-by-stream cards split failed material ours/third-party on the face, per C6 |
| Live activity feed | ✅ **Met** | Watchdog section |
| Collapsible sections with counts | ⚠️ **Not remembered** | `Section` uses local state; resets every visit. Rule says "remembered per user" |
| Action bar (recompute, print, tasks, alerts) | ✅ **Met** | |
| Honest empty states | ✅ **Excellent** | Consistently strong throughout |
| Every category has a dashboard | ✅ **11 of 11** | |
| Everything replicates up to two masters | ⚠️ **Not wired** | See Part 7 |
| Users personalise the masters | ❌ **Not built** | See Part 6 |
| Nothing omitted when consolidating | ⚠️ **83 pages** still on "still to be built out" lists | |

**Assessed grade: B−.** The *quality of thinking* in `DeptDashboard` is genuinely high —
unit-aware tiles, honest empty states, ours-versus-third-party on the tile face, 100% drill
coverage. That is better than most commercial systems. What is missing is **completeness and
enforcement**: targets on 16% of tiles, one dashboard silently empty, and personalisation
and roll-up unbuilt. You have built the hard part and left the connective tissue.

---

## PART 6 — Your ask: letting the team customise data from pages

You want your team to customise pages. Here is what exists, what is missing, and how I would
build it.

### What already exists (more than you may realise)

| Piece | State |
|---|---|
| `dashboards`, `dashboard_widgets` tables | Exist — **0 rows** |
| `widget_catalog` | **26 widgets** defined |
| `DashboardsScreen` — create/share/add/remove widgets | **Built and working** |
| `DASH_STARTERS` — 4 one-click presets | Built |
| `saved_views` | 10 rows — in use |
| `user_settings` | 1 row |
| `nav_registry` + `nav_role_visibility` | Database-driven menus, per role |

**So a custom-dashboard builder already ships — and nobody has ever used it.** Zero
dashboards, and only **2 `app_users`** against **21 employees**. This is not a build
problem; it is an adoption problem. Onboard the team before building anything new here.

### The four real gaps

**1. No drag-to-rearrange.** `dashboard_widgets.position` exists, but `DashboardsScreen`
only appends and removes. Rule 5 explicitly requires "drag to rearrange". Add
`@dnd-kit/sortable` and persist `position`.

**2. Custom dashboards are second-class.** A catalogue widget renders a bare number. It has
no target, no sparkline, no "change since yesterday", no Assign button. So a user-built
dashboard cannot meet your own Rule 10. **Unify this:** make one `<Tile>` component used by
`DeptDashboard`, `ControlTower`, `CeoDashboard` and `DashboardsScreen` alike. Build it once,
every surface inherits every capability, and the standard becomes structural.

**3. No per-page column control.** This is the heart of your ask and it does not exist. Your
team cannot choose which columns they see, in what order, with what filter, and save it.
`useDataToolbar` and `useClientToolbar` give filtering and date ranges, but nothing persists
per user.

**What I would build — a `page_preferences` table:**

```
page_preferences
  user_id, view_key                    -- one row per user per page
  visible_columns  text[]              -- which, and in what order
  column_widths    jsonb
  sort             jsonb
  filters          jsonb               -- saved filter set
  page_size        int
  density          text                -- comfortable | compact
  is_default_for_role  text            -- a lead publishes a team default
  updated_at
```

Then one `<DataGrid>` reads it, with a gear menu on every page: show/hide columns, drag to
reorder, resize, save as a personal view, or — for a dept head — **publish as the team
default**. That last part is what turns a preference into an operating standard, and it is
the piece most systems miss.

**4. Section collapse is not remembered.** Rule 10 says "remembered per user"; `Section`
uses component state. Move it into `page_preferences`.

### Guardrails — because customisation is where data integrity usually dies

Customisation must never let someone hide a number and then act as if it does not exist.

- **Provenance survives customisation.** Hiding a column never removes its provenance from
  the drill-down or the export.
- **Mandatory columns.** Compliance fields (package tag, licence, test status) cannot be
  hidden. Mark them `is_mandatory` in a column registry.
- **Exports state the view.** Every export carries a header: who exported, when, which
  filter, which columns hidden. A filtered export that looks like a full one is how bad
  decisions get made.
- **A hidden column is disclosed.** "3 columns hidden — show all" on the page face, never
  silent.
- **Filters are visible and clearable.** A stale filter silently applied is a data-integrity
  incident. Show an always-visible chip row with a one-click "clear all".

---

## PART 7 — Your ask: category dashboards wired up to a CEO Dashboard

### What exists today

- **11 department dashboards** through one generic `DeptDashboard` reading
  `mv_department_dashboard`. Good architecture — one component, database-driven.
- **`ControlTower`** — the operational master.
- **`CeoDashboard`** (in `budz.jsx`) — narrative, rich, and compromised by the hardcoded
  numbers in BUG 2.

### The problem: nothing actually replicates up

Rule 4 says every category dashboard feeds the two masters. In reality the three tiers
compute **independently**, from different sources, with different thresholds:

| Tier | Reads | Threshold source |
|---|---|---|
| `DeptDashboard` | `mv_department_dashboard` | `kpi_targets` (7 rows) |
| `ControlTower` | `v_control_tower` + `useLiveCounts` | hardcoded `METRIC_GROUPS`, cash bands 7/14/30 |
| `CeoDashboard` | 13 separate views | **hardcoded in JSX** |

**So the same business fact can appear three times with three different values and three
different limits** — and BUG 3 proves it already does (21 days vs the owner-set 28). Three
dashboards that disagree are worse than one, because now nobody trusts any of them.

### How I would build it — one metric spine

This is the architectural change I would most strongly recommend, and it is what a Microsoft
or Google team would do. **One definition per metric, in one place, consumed by every
surface.**

```
metric_registry                        -- the single definition of every number
  metric_key            (pk)           -- 'harvests_open_past_limit'
  label, plain_english                 -- rule I3: plain English beside the professional
  department, category
  unit, format                         -- lb | $ | units | %
  sql_source                           -- the view that computes it
  drill_view                           -- rule C1: the per-item proof
  target_rule_key                      -- -> conversion_factors, via f_rule()
  direction                            -- at_most | at_least
  rolls_up_to_metric                   -- the parent. THIS is the replication rule.
  weight_in_parent
  owner_role                           -- who is accountable
  provenance_note                      -- rule A2
  is_headline_for                      -- ceo | tower | dept | null
```

With that one table:

1. **Roll-up is data, not code.** `rolls_up_to_metric` builds the tree. A CEO tile is the
   aggregate of its children by construction — it *cannot* disagree with the department
   dashboards, because it is derived from them.
2. **Every threshold comes from `conversion_factors`** via `target_rule_key`. BUG 3 becomes
   structurally impossible.
3. **Every metric declares its drill.** A metric without `drill_view` fails CI (*Part 8,
   Check 4*), enforcing rule C1 automatically.
4. **The CEO dashboard becomes generated**, not hand-written — so no one can type `7,962 lb`
   into it again.
5. **Adding a metric is one row**, and it appears on its department dashboard, rolls into the
   Tower and the CEO board, gets a target, a drill and a provenance note. That is what makes
   this feel like an OS.

Then `CeoDashboard` renders `is_headline_for = 'ceo'` with each tile showing: the number, the
target from `f_rule()`, the sparkline from snapshots, change since yesterday, contributing
departments, drill-to-proof, and Assign. Personalisation (Rule 5) is `page_preferences` on
top.

**Keep the narrative.** The genuine strength of the current CEO Dashboard is that it explains
*why a number matters and what to do about it* in plain English. That is rare and valuable.
Move that prose into `metric_registry.plain_english` and a `metric_playbook` table — keep the
words, drop the frozen numbers.

---

## PART 8 — Your ask: advanced checks and balances for every aspect

You asked for this twice, so I have treated it as a first-class requirement. Today the
platform has **strong forensic recording** (`watchdog_findings`, `issue_decisions`,
`cost_input_history` — all immutable and append-only, which is genuinely well done) but
**almost no preventive control**. Everything is caught after the fact, by a person noticing.

Here is a layered control framework. Layer 1 is where I would start.

### Layer 1 — Automated gates (nothing merges or deploys without passing)

**Check 1 — State reconciliation.** A nightly job writes the real counts (tables, views,
matviews, cron jobs, nav entries, open questions, go-live items) into a `platform_state`
table, and `HANDOFF.md` is generated from it. **Directly prevents the Part 1 drift.**

**Check 2 — Exposure regression test.** Nightly: assume `anon`, attempt a select on every
relation and an execute-privilege check on every function. **Any** row returned or **any**
`EXECUTE` held by `anon` raises a critical finding. This is the test that would have caught
Criticals 1 and 2 the day they appeared, and it is perhaps 40 lines of SQL.

**Check 3 — Secret scanning.** A pre-commit hook plus CI step (`gitleaks`) blocking any
commit containing a connection string, JWT or password. **Prevents Critical 3.**

**Check 4 — Dashboard standard gate.** CI fails if any tile lacks a `drill`, any metric lacks
a `target_rule_key`, or any nav entry points at a non-existent relation. Turns Rule 10 from
a document into a build failure.

**Check 5 — No-hardcoded-numbers gate.** A lint rule failing CI on numeric literals of three
or more digits, and on `lb`/`$`/`%` adjacent to a literal, inside dashboard components.
**Directly prevents BUG 2.** Allow an explicit `// provenance: <rule_key>` escape so real
exceptions are visible and reviewed.

**Check 6 — Actually lint and type-check.** ESLint (with `react-hooks/exhaustive-deps` — note
the code currently *disables* it in places), plus TypeScript incrementally via JSDoc. **Would
have caught BUG 4 and, with typed view models, BUG 1.**

**Check 7 — Migration safety.** CI rejects any migration containing `drop view ... cascade`
(rule E1, which has bitten three times), and re-queries `pg_matviews` after every structural
change.

### Layer 2 — Data integrity invariants

Assertions that run continuously and raise a finding when violated:

- **Reconciliation:** for every tile, the sum of its drill rows equals the tile value.
  Rule C2, tested rather than trusted.
- **Unit safety:** no view adds or compares a weight to a count; `f_is_weight()` gates every
  aggregate. Rule B2, and the origin of a factor-of-six error.
- **Wet/dry safety:** no expression subtracts a dry weight from a wet one. Rule B4, which
  once overstated open harvests by 3,800 lb.
- **Threshold usage:** every threshold in the front end resolves through `f_rule()`. Any
  literal is a finding. **Catches BUG 3.**
- **Snapshot continuity:** if a daily snapshot is missed, say so on the sparkline rather than
  interpolating.
- **Metrc mirror integrity:** row counts per endpoint compared to the last sync; a silent
  drop in `metrc_packages` raises critical. Your last sync ran 7 Aug 11:32 and the pipeline
  is healthy — protect that.

### Layer 3 — Human checks and balances

- **Four-eyes on money and compliance.** Changing a valuation rate, a licence or a cost
  input requires a second authorised approver. `cost_input_history` already records changes;
  add *approval* before effect.
- **Separation of duties.** Whoever proposes an import cannot approve it.
  `tg_agentmapper_propose` / `tg_agentmapper_approve` already model this — enforce that the
  two actors differ.
- **Decision provenance on every override.** Already strong via `issue_decisions`. Extend to
  every threshold change.
- **Quarterly access review.** List every account, role and last-login; the owner confirms
  each. Note **owner accounts still use build-phase passwords** — change before staff
  onboarding.
- **Metrc corrections stay open until fixed at source.** Already enforced (rules D2/D3) and
  correctly so.

### Layer 4 — Observability

- **Every failed query becomes a forensic row.** Ties into the Part 4 wrapper: no silent
  failures, ever.
- **A visible health page.** Last sync per endpoint, last snapshot, matview freshness, cron
  success/failure, count of relations exposed to `anon`. You have `v_agent_health` and
  `canary_runs` — surface them as a single green/red board.
- **Cron failure alerting.** 23 jobs run unattended. A silently failing snapshot job is
  invisible today.
- **Anomaly detection on the numbers.** If a KPI moves more than N standard deviations
  overnight, raise a finding *before* an executive acts on it.

### Layer 5 — Disaster recovery, currently absent

- **No automated backup verification.** A backup that has never been restored is a hope, not
  a backup. Quarterly restore-to-scratch test.
- **The deployed site is not in git** (Part 4). Fix immediately.
- **No staging environment.** Every change is tested in production. For a licensed operation
  this is the gap I would close right after security. A Supabase branch plus a Netlify deploy
  preview gets you most of the way for very little money.

---

## PART 9 — Enhancement ideas: features, functions and tools

Grouped by the value I would assess them at. These are ideas for your judgement, not
recommendations I have costed.

### Tier 1 — Highest value, unlocks the most

1. **`metric_registry` spine** (Part 7). The keystone. Everything else gets easier.
2. **The data-access wrapper** (Part 4). Kills the whole class of silent-failure bugs.
3. **`page_preferences` + universal `<DataGrid>`** (Part 6). Your customisation ask,
   delivered once for all 278 pages.
4. **Date-range filtering everywhere** — defect D3, requested repeatedly. The note in
   `HANDOFF.md` is right that most views lack a date column, and **that is the first step**:
   add a canonical `as_of` / `event_date` to reporting views, then build the QuickBooks-style
   preset control (This month, Last month, QTD, YTD, Custom) with prior-period comparison
   once, in one component.
5. **Unified `<Tile>`** so every surface meets Rule 10 by construction.
6. **Real routing + code splitting.** Deep links, working Back button, and a much faster
   first paint than 902 KB.

### Tier 2 — Strong operational value

7. **Task system, actually adopted.** `tasks` is empty and `AssignTask` works. Add: my-tasks
   view, email/SMS on assignment, overdue escalation, and a weekly digest per department
   head. You are replacing ClickUp — this is the feature that decides whether people switch.
8. **Onboard the other 19 employees.** 2 users, 21 employees. Nothing else matters as much
   for adoption. Pair with a forced password reset (build-phase passwords are still live).
9. **Alerting that leaves the building.** Watchdog findings are excellent but only visible to
   someone who opens the page. Add email/SMS/Slack for critical findings.
10. **Approval workflows** on valuation rates, cost inputs and licences (Layer 3).
11. **Global search across everything** — packages, harvests, strains, people, tasks,
    documents. `BRAIN_FINDERS` is a good start; make it a command palette (`Ctrl+K`). This is
    the single feature that most makes software feel like an OS.
12. **Offline-tolerant mobile floor mode.** Cultivation staff on a grow-room floor have poor
    signal. A read-mostly PWA with queued writes.
13. **Barcode/QR scanning end to end.** `QrDecode` and `jsqr` are already in place — extend
    to receiving, moves and takedowns.
14. **Report scheduling.** "Every Monday 6am, email the cultivation pack as PDF to these
    people." `report_alert_recipients` already exists.

### Tier 3 — Strategic

15. **QuickBooks integration** — defect D8. Overhead is a single $285,000/month lump with
    wages included, so nothing can be attributed to a cause. This is the largest remaining
    blind spot in the finance picture.
16. **Metrc Lab Results — CORRECTED 7 Aug, after this section was first written.** I
    originally repeated `HANDOFF.md`'s claim that the Lab Results report had never been
    imported. **That is wrong.** `metrc_rpt_lab_results` holds **39,531 staged rows** across
    42 imports, last run 10:47 today. What is true is that `lab_result_values` and
    `coa_documents` are **confirmed empty** — so the gap is **staging → canonical mapping,
    not the import**. This is code-fixable and it is the largest unrealised gain in the
    platform: 39,531 potency and terpene results are in the building and not on the shelves.
    See Agent A brief A-1.
17. **Inventory Point-in-Time** — defect D6. Also corrected: `metrc_rpt_point_in_time` holds
    **7,266 staged rows** across 53 imports. But the report genuinely **carries no quantity
    column**, per its own entry in `v_report_mapping_status`, so it cannot value a return on
    its own. D6 remains blocked by a real Metrc limitation — correctly documented, and not
    closable by code alone. See A-2.
18. **Scenario planning.** "If I change the trim price to $275, what happens to cost per
    pound?" You have `ProductionCalculator` and `harvest_pace_scenarios` — make it
    first-class.
19. **Predictive yield.** 87 closed harvests at 82.3 g/plant against a 70.6 g target is
    enough history to forecast per room and per cultivar, with honest confidence intervals.
20. **Capacity and constraint modelling.** 4 rooms × 1,150 plants × 56-day cycle is a clean
    model; surface the bottleneck explicitly.
21. **Document management with OCR.** `coa_extract` and `metrc_documents` exist; make
    certificates searchable.
22. **Full audit-trail viewer.** `audit_events` exists; give it a real screen — who changed
    what, when, before and after.
23. **Role-based landing pages.** A cultivation lead and a CFO should not open the same
    screen. `nav_role_visibility` already supports this.
24. **Anomaly detection** (Layer 4) — catch bad numbers before executives act on them.
25. **API for partners.** Once the anon surface is locked down, a *deliberate*, key-scoped,
    rate-limited read API for your laboratory or accountant.

### Tier 4 — Polish that changes how it feels

26. **Keyboard-first operation** — `Ctrl+K` palette, `g`-then-letter jumps, `j`/`k` in
    tables. This is most of what makes power users feel fast.
27. **Print/PDF stylesheets.** `window.print()` is wired; make the output boardroom-quality.
28. **Accessibility pass.** Contrast on neon-on-dark, focus rings, ARIA labels, keyboard
    traps. Also a legal consideration as headcount grows.
29. **Density toggle** — comfortable/compact, per user.
30. **Skeleton loaders** instead of "Loading…", so pages feel instant.
31. **"Explain this number" everywhere.** `page_explainers` and `page_help` exist but hold
    only 3 and 6 rows. Every tile should answer "where did this come from?" in one click —
    this is rule A2 as a feature, and it is your best defence against a repeat of the
    grams-per-plant incident.
32. **In-app changelog.** Vinny should see what changed since he last logged in.

---

## PART 10 — What I would do, in order

**This week — security and truth. Nothing else until these are done.**

1. Rotate the `tg_desktop_reader` password; gitignore `.mcp.json`; drop `sslmode=no-verify`.
2. `revoke execute on all functions in schema public from anon` — then re-grant narrowly.
3. `revoke all on all tables in schema public from anon`; enable RLS on `_mv_dept_backup`
   and `import_review`.
4. **Commit the four modified files.** The live site is currently un-versioned.
5. Correct `HANDOFF.md` §6 — it currently tells the next person a dangerous untruth.

**Next two weeks — stop the bleeding.**

6. Fix BUG 1 (Command Center) and BUG 4 (the literal `)}`).
7. Introduce the data-access wrapper; add error boundaries. Kill silent failure.
8. Add ESLint + CI, with Checks 2, 3 and 6 wired in.
9. Delete every hardcoded number from `CeoDashboard` (BUG 2) and route thresholds through
   `f_rule()` (BUG 3).
10. Fix the 84 `auth_rls_initplan` policies — cheap, mechanical, system-wide speedup.

**Month two — the foundation you asked for.**

11. Build `metric_registry` and migrate the department dashboards onto it.
12. Generate the CEO Dashboard and Control Tower from it. Roll-up becomes structural.
13. Build `page_preferences` + `<DataGrid>` + unified `<Tile>`.
14. Add routing and code splitting.
15. Populate `kpi_targets` for all 43 tiles with the owner, in one sitting.

**Month three — adoption and reach.**

16. Onboard all 21 employees with real passwords and roles.
17. Turn on task notifications and escalation.
18. Add date-range filtering, starting with date columns on the reporting views.
19. Stand up a staging environment and verify a backup restore.
20. Then, and only then, start on QuickBooks and the Metrc report imports.

---

## Closing assessment

**What is genuinely good here** — and I want to be clear, because the list of defects above
is long: the *thinking* in this platform is better than most enterprise systems I have
reviewed. Provenance on every business rule in `conversion_factors`. Immutable forensic
records. Honest empty states that refuse to draw a fake line. Unit-aware tiles that will not
show a pound figure for a countable item. Failed material split ours-versus-third-party on
the face of the tile. 100% drill coverage on 43 tiles. A `where_it_came_from` field that
explicitly argues down a wrong number. That is a rare standard, and it is the reason this
system is worth investing in rather than restarting.

**What is missing is not intelligence — it is enforcement.** Every defect I found is a case
of a good rule that nothing checks: "never hardcode a number" (hardcoded numbers in the CEO
dashboard), "every threshold from `f_rule()`" (21 days versus the owner's 28), "anon access
revoked" (30 relations readable), "never swallow an error" (127 swallows). The rules are
right. They live in a markdown file that no build step reads.

**The single highest-leverage change is to move your rules out of documentation and into
automated gates.** That is the actual difference between a very good internal tool and
something built like a Microsoft or Google operating system. Not more features — *enforced
invariants*. Every check in Part 8 exists to convert one of your own hard rules from an
intention into a build failure.

Do that, and the ambition in this project becomes achievable. Skip it, and you will keep
rediscovering the same class of defect for as long as the system lives.

---

### Appendix — how to reproduce every finding

| Finding | How I verified it |
|---|---|
| 341 security / 414 performance findings | Supabase advisors, `security` and `performance` |
| Anon read exposure (30 relations) | `set local role anon` then `count(*)` on every grantable relation |
| Anon write surface (33 functions) | `has_function_privilege('anon', oid, 'EXECUTE')` + `prosecdef` + `pg_get_functiondef` pattern match |
| Committed password | `git log --all -p -S "TGdesk-2026"` |
| Command Center bug | `select count(*) from mv_department_dashboard where department in ('Command Center','Command')` |
| Literal `)}` | `esbuild --loader:.jsx=jsx src/App.jsx > /dev/null` |
| Deploy state | `curl` the live site, compare bundle hash to `dist/index.html` |
| Threshold contradiction | `select key, value, where_it_came_from from conversion_factors` vs `grep` in `budz.jsx` |
| Front-end counts | `grep -c` on `App.jsx` |
| Empty tables | `select count(*)` on `dashboards`, `dashboard_widgets`, `tasks`, `kpi_snapshots` |

**Every number in this document came from one of the above. None was estimated. Where I
formed a judgement rather than took a measurement, I labelled it "Assessed".**
