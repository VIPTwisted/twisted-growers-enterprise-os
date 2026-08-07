# Ingested 7 Aug 2026 — full forensic map of the codebase

*Provenance: a dedicated read agent walked all of App.jsx (7,910 lines —
docs still say ~6,400), budz.jsx (2,027), both CSS files, the bridge, every
script in tools/, supabase/functions and checks, and CI. Line numbers below
are as of 7 Aug 2026 and will drift — re-grep before editing.*

## Shape of the front end
- One file, no router library, no state manager, no data-access layer:
  every read is a direct `supabase.from(...)` in the component. 52 tables,
  33 views, 10 RPCs, 4 edge functions, 1 storage bucket, all called inline.
- Hash routing at App.jsx ~7559; the `special` view map ~7668 routes 35
  bespoke pages; ModuleScreen (~1167) renders everything registry-driven.
- budz.jsx is the assistant layer; `CeoDashboard` (~1625) is the source of
  all 17 baselined hardcoded-number violations.
- Dead code: `HexLogo`, `LAUNCHER_APPS`, ModuleScreen's dimension filter,
  `BudzPet`/`useBudzPet` exports.

## The silent-failure census
**129 error-swallowing read sites (`?? []`); exactly ONE surfaces an error
to the user** (ControlTower, ~3560). The worst shapes:
- **~254: the forced-password-change gate fails OPEN** — a read failure
  yields `mustChange=false` and the gate is skipped. Same shape on roles:
  ~346 falls back to `"member"`, ~325 to `"guest"` — authorization defaults
  decided by swallowed errors.
- **~924: a query error renders as a compliance verdict** — "No chain
  recorded in Metrc … That is a finding, not a blank" — when the truth may
  be "the query failed."
- ~7121: the dashboard matview read — the exact pattern that made three
  cascade-drops invisible.
- ~5507: six alert probes, each `count ?? 0` — probe failure renders as
  "All clear."

## Hardcoded-value violations (against Law #4 / G1)
- The Metrc scan-schedule page states **fabricated arithmetic as
  measurement** (~5744–5855: `total = daytime + 1099`, "5,141", two fully
  hardcoded table rows) under a footer reading "no code change."
- Thresholds re-implemented in code while `conversion_factors` exists:
  cash-staleness `>= 7` (duplicated ~3568/~7629), lab `> 14` (~786), ageing
  `> 180` (~6900/~7239), severity ladders (~3627, ~5498).
- ProductionCalculator constants (÷454, ÷0.877 decarb) under a subtitle
  reading "Nothing is hardcoded."
- ~20 registries live as code arrays (METRIC_GROUPS, TODAY_BOARDS,
  SYNC_SOURCES, FG_TABS, DEPT_BY_VIEW — the last annotated as having
  already broken once). Permission list repeated at 7+ sites.

## The bridge (bridge/)
- server.mjs: local HTTP on 127.0.0.1:8765 + a portless channel polling
  `ai_bridge_jobs` every 700 ms; spawns Claude Code with
  `--permission-mode acceptEdits` against the live project.
- **Currently BROKEN**: it authenticates with the public anon key and lost
  its grants in the revoke — bridge.log ends in unbroken `poll error` lines;
  the session-start hook says so explicitly. Recorded fix: its own
  credential (CONTRADICTIONS #8).
- Risks: token falls back to a literal default (~26) and is printed to
  console (~154); an anon JWT is embedded in source (~162); CORS falls back
  to allowing rather than denying.
- sheet-sync.mjs drives the owner's signed-in Chrome profile via DevTools
  protocol to read the restricted sheet; push carries a per-source token in
  the body, no auth header. Never tested end to end.

## Tools, hooks, checks — what exists vs what runs
**Real and wired (CI: theme-lock, parse-check, no-hardcoded-numbers ratchet,
eslint, SQL-pattern grep, gitleaks; hooks: session-start prints CLAUDE.md +
corrections, guard-protected-files blocks theme/lane violations, guard-sql
blocks E1/E6/H2 SQL):** the enforcement layer genuinely exists.

**Exists but NOTHING runs it:**
- `tools/checks/routing.mjs` and `error-boundaries.mjs` — invoked by nothing.
- `tools/report_fixtures.py` — the only regression suite for the parser
  that once produced six database faults — not in CI.
- `supabase/checks/*.sql` — run by hand only.
- `supabase/checks/reconcile_tiles.sql` is **27 lines of comments and no
  SQL** — rule C2 appears tested and is not.
- CI runs eslint without `--max-warnings 0`, so the lint rules that exist
  are non-blocking; gitleaks is `continue-on-error: true`.

## Not in version control
- **The metrc-sync edge function** — the worker the whole platform depends
  on is an 8-line placeholder in the repo; the source of record lives only
  inside Supabase. (Same class as the audit's "production only in a working
  directory" lesson.)
- `metrc-sales-detail` exists in-repo but has never been deployed or called
  (its README status table: all No).

## Top risks (agent's ranked list, condensed)
1. Password-change gate and role checks fail open on read errors.
2. 129 swallow sites / 1 surface site — findings and failures identical.
3. Query errors rendered as compliance findings (~924).
4. Bridge credential handling + acceptEdits against the live project.
5. DB password in git history (owner ruled 7 Aug: deferred until live —
   DECISIONS.md) — and the secret scanner can't fail a build.
6. budz-chat calls `undefined/functions/v1/...` (env vars that don't exist),
   absorbed by a bare catch.
7. metrc-sync source of record not in the repo.
8. Fabricated arithmetic stated as measurement on the scan-schedule page.
9. reconcile_tiles.sql tests nothing.
10. The guards that exist aren't wired to CI.
