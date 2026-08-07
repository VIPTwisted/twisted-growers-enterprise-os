# Platform — architecture and operations

*Orientation page. Live counts and IDs are in HANDOFF.md §1–2; re-measure
before quoting.*

## The pipeline (detail in HANDOFF.md §2)
Metrc API → `metrc_*` raw jsonb tables → `v_*` views → `mv_*` matviews →
React SPA. Owner-set config tables (`conversion_factors`, `valuation_rates`,
`cost_inputs`, `grow_rooms`, `harvest_plan_2026`, `suppliers`) feed the views.

## Front end
- Single-file SPA: `app/web/src/App.jsx` (**7,910 lines as of 7 Aug 2026** —
  older docs say ~6,400), plus `styles.css`, `rules.css`, `budz.jsx` (2,027).
  Full structural map with line ranges, the silent-failure census (129
  swallow sites, 1 surface site), hardcoded-value violations and dead code:
  [../sources/2026-08-07-codebase-map.md](../sources/2026-08-07-codebase-map.md).
- **Theme locked: neon green** (I1). Plain English beside professional
  language — the owner is non-technical (I3).
- Front-end safety: anchor scripted edits on function signatures (F1); never
  deploy unseen (F2); no truncation, no abbreviations, use the whole page
  (F3–F5).

## Navigation is database-driven
`nav_registry` drives every menu (columns and `surface` routing in HANDOFF.md
§2); `nav_role_visibility` filters per role: owner, executive, planner,
dept_head, staff, readonly. Reports live in the Reports dropdown (I4).
Full picture: `docs/handoff/MENU_MAP.md` and `ALL_PAGES.csv`.

## Key functions — use these, never re-derive
The canonical table is in HANDOFF.md §2: `f_to_pounds`, `f_is_weight`,
`f_is_ours`, `f_rate_for`, `f_rule`, `f_test_status`, `f_potency_status`,
`f_concentrate_rate_per_lb`.

## Database safety (E-rules — each one paid for in outages)
Never `drop view … cascade`; matviews read base tables only; `sum(packages)`
not `count(*)`; `set search_path = public` on functions views depend on;
never `grant … to anon`.

## Security
- Anonymous exposure closed 7 Aug 2026 after the senior review
  (`docs/AUDIT_2026-08-07_SENIOR_REVIEW.md`); tripwire:
  `supabase/checks/anon_exposure.sql`.
- **Enable RLS on every new table at creation** — Postgres defaults it off;
  see [LESSONS.md](../LESSONS.md), 2026-08-07.
- Earlier change record: `docs/handoff/SECURITY_CHANGE_2026-08-06.md`.

## Deploys and services
- Live site, Supabase project ref and Netlify site ID: HANDOFF.md §1.
- Deploy config: `netlify.toml`; CI in `.github/workflows/`.
- Local bridge: `bridge/` (`server.mjs`, `sheet-sync.mjs`, `SETUP.md`).
  ⚠ `bridge/token.txt` holds a live credential — gitignored, keep it that way.
  ⚠ **The bridge is currently BROKEN** (lost its anon grants in the revoke;
  log ends in poll errors). Do not restart it before the credential decision
  in [../CONTRADICTIONS.md](../CONTRADICTIONS.md) #8 — it once allowed
  unauthenticated RCE on the owner's workstation.
- ✅ All 20 deployed edge functions recovered into `app/supabase/functions/` on 7 Aug 2026 — see `RECOVERY_MANIFEST.md` there. The live deployment stays authoritative until each is diffed; never blind-redeploy.

## The agent fleet
Two build agents plus a watchdog work in parallel, in lanes —
`docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` is binding before any parallel
work. Agent B's operating prompt: `docs/AGENT_B_PROMPT.md`. Issues never
clear themselves; forensic tables are immutable (H1, H2).
