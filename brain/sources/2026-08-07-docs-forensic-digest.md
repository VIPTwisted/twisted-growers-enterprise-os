# Ingested 7 Aug 2026 — full line-by-line read of docs/ and gap registers

*Provenance: a dedicated read agent read all 15 design/gap files completely
(every line, no skims) on 7 Aug 2026. This is the condensed digest; the
per-file detail below tells a future agent which file to open for what.
Related: [2026-08-07-handoff-digest](2026-08-07-handoff-digest.md) and the
codebase map (both pending as of writing).*

## The Four Laws (docs/05, binding, owner-confirmed 2026-08-04)
1. **One system, whole company** — a single database of record, one audit trail.
2. **Fully dynamic** — every number computed from live records at read time.
3. **No fake data** — real records or an honest empty state. Never samples.
4. **No code edits to operate** — every business value is database config.
Plus **Principle #5** (same day, evening): the OS monitors its own adoption —
"every previous attempt died of abandonment, not malfunction."

## What each file is for (open it when…)
- `docs/02_CURRENT_STATE.md` — the workbook autopsy: 79 sheets, 161,690
  formulas, 12 named defects that made the gauges lie. History, not state.
- `docs/03_PLATFORM_BLUEPRINT.md` — the module contract: CODE-001…012 with
  acceptance criteria. Still the vocabulary everything else uses.
- `docs/04_ENHANCEMENT_PLAN.md` — the enhancement backlog + the owner's two
  standing requirements (per-employee actual pay rates; COA/testing tracked
  end-to-end, "Very important"). CODE-013…022 defined here.
- `docs/05_OS_MAP_AND_BLUEPRINT.md` — **the constitution**: Four Laws, M1–M5
  milestones, personas and the Jan 1 2027 readiness gate (a gate, not a
  forced cutover), the live build ledger.
- `docs/06` / `docs/08` — the two intakes (pre-roll planner → migration 0005;
  work layer → CODE-023, migrations 0009/0012, M4–M5). Specs, unbuilt.
- `docs/07_DEEP_SCOPE_ENHANCEMENTS.md` — 30 enhancements + #0 (adoption
  telemetry, "the one that matters most").
- `docs/09_METRC_API_ACCESS.md` — Metrc auth settled: HTTP Basic,
  `software:user`, both keys mandatory; onboard as standard integrator via
  Metrc Connect. ⚠ Uses licence **MC157557** where CLAUDE.md's locked facts
  say **MC281714** — see contradiction below.
- `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` — the most current operational
  doc: Agent A (Metrc reports) / Agent B (everything else) / Watchdog
  (verifies, never builds). 13 stop-work non-negotiables, the collision map,
  the **useNav trap** (see LESSONS).
- `docs/AUDIT_2026-08-07_SENIOR_REVIEW.md` — the current state-of-system:
  341 security advisor findings, 3 criticals, 5 proven bugs, grade **B−**
  against the owner's own Rule 10. Closing line: "What is missing is not
  intelligence — it is enforcement."
- `docs/gap_register/*` — chat demands (56 rows judged), ClickUp capability
  map (HAVE/PLANNED/MISSING + explicit skips), export/import/print map,
  the 46 reference screenshots, and the 68-item workbook gap register whose
  verdict on "90% was omitted" is **"approximately correct — and verifiable."**

## > [!contradiction] Licence number — owner must arbitrate
CLAUDE.md locked facts and HANDOFF.md say cultivation licence **MC281714**.
`docs/09_METRC_API_ACCESS.md` (2026-08-05) uses **MC157557** in its Metrc
request template. Both cannot be right. Not resolved here — flagged to owner
7 Aug 2026.

## The audit's three criticals (7 Aug, all open at time of reading)
1. **anon could EXECUTE 131 functions** (42 SECURITY DEFINER, 33 that write) —
   partially closed since; watchdog #347 + ddl_guard rows show the surface
   trying to reopen with each new object.
2. **30 relations leaked real business data to anon** — customers, manifests,
   wholesale money. Closed 7 Aug; the tripwire exists because a **previous
   revoke did not hold** (it covered only the views existing on 6 Aug; the
   surface grew straight back, 177 → 215 views).
3. **A live database password was committed and pushed to git** in
   `.mcp.json` (commits `a0fe5aa`, `9af82a7`, on origin/main, with
   `sslmode=no-verify`). `.gitignore` now covers `.mcp.json`, but git history
   is forever: **treat as public until rotated.**

## The five proven front-end bugs (audit Part 3, all open at reading)
1. Command Center shows **zero tiles** in production: code maps the key to
   `"Command Center"`, the matview stores `"Command"`; the empty result is
   hidden by `?? []` (App.jsx ~6710 / ~7034).
2. CEO dashboard states **nine hardcoded numbers as live proof** (budz.jsx),
   already contradicting a live tile on the same page.
3. Hardcoded thresholds contradict `conversion_factors` — code counts >21
   days where the owner ruled 28 in writing; dry window 7–16 vs stated 10–14.
4. A literal `)}` renders as visible text on the Executive Control Tower
   (~App.jsx:3568) — nothing lints this code.
5. Sparklines have 2 days of history and **36 of 43 tiles have no target**
   (drill coverage is 43/43 — that part is excellent).
Architecture behind them: **127 of 153 queries discard errors via `?? []`**,
zero error boundaries, no router, 902 KB bundle, aggregation in the browser,
414 DB performance findings (84 `auth_rls_initplan` first), no tests/lint/CI.

## Scorecard vs the owner's Rule 10: **B−**
Met: colour-rail KPI tiles, change-since-yesterday in words, forensic drill
43/43, honest empty states ("consistently excellent"), 11/11 categories have
dashboards. Partial: targets 16%, sparklines (2 days), assign-from-tile built
but `tasks` empty, roll-up to the two masters not wired. Missing: master
dashboard personalisation.

## Also settled in this read (decisions absorbed to DECISIONS.md)
Standing requirements #1/#2; Real-Records-Only; no code reuse from the
abandoned platform (concepts only); intake law (capability concepts, never
external code/copy/branding); CSV import per-screen and allow-listed —
generic import is out of scope because it would bypass DB gates; the Metrc
mirror is never importable; seed-data ban enforced at CI; private-only
storage; secrets only in provider dashboards; migrations agent-prefixed, no
work on main; `conversion_factors` additive only; HANDOFF.md to be generated
from `platform_state`; the 201 security_definer_view conversions are a
scheduled refactor, not a freeze-time fix; D6 stays blocked correctly (the
point-in-time report has no quantity column — do not infer one).

*The full per-file agent report is longer than this digest; if a detail is
missing here, re-run the read on the specific file rather than trusting
memory.*
