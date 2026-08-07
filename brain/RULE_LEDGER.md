# The Rule Ledger — which rules are enforced, and which are hope

**Built 7 August 2026 by Agent D.** Every hard rule in CLAUDE.md, mapped to
the machinery that proves it is still held. The audit's closing line —
*"What is missing is not enforcement… the rules live in a markdown file that
no build step reads"* — is measurable, and this is the measurement.

**Method:** each rule was matched against the enforcement inventory verified
in the 7 Aug code map — CI steps in `.github/workflows/ci.yml`, hooks in
`tools/hooks/`, checks in `tools/checks/` and `supabase/checks/`, the
`verification_checks` table, and the nightly platform check. Grades are
assessed from that evidence; where a rule cannot be checked by machine today,
it says so rather than pretending.

## The headline number

**42 hard rules. 4 are enforced by machinery that runs on its own.**
The other 38 hold because someone remembers them.

| Grade | Count | Meaning |
|---|---|---|
| 🟢 **Enforced** | 4 | A check runs automatically and fails/blocks on violation |
| 🟡 **Partial** | 13 | Machinery exists but does not block, is baselined, or is manual |
| 🔴 **Unenforced** | 24 | Held by discipline alone |
| ⚫ **Fake** | 1 | An artefact exists that looks like enforcement and tests nothing |

---

## 🟢 Enforced — the four that actually hold

| Rule | What proves it |
|---|---|
| **E6** never `grant … to anon` | Best-defended rule in the system: the SQL guard hook blocks it pre-execution, CI greps for it, `anon_exposure.sql` catalogues exposure, the nightly platform check counts it, the DDL guard trips on new objects, and **two** `verification_checks` derive it independently. |
| **E1** never `drop view … cascade` | SQL guard hook blocks it; CI greps `*.sql`. Earned after it blanked every dashboard three times. |
| **I1** theme is locked (neon green) | `theme-lock.mjs` in CI diffs both CSS files against the merge base; `guard-protected-files.mjs` blocks the write. Unlock requires an explicit environment variable. |
| **D1** Metrc is a read-only mirror | **Enforced by architecture, the strongest form** — the platform holds no Metrc write credentials. It cannot violate this rule even if instructed to. |

## ⚫ The fake one — fix this first

| Rule | The problem |
|---|---|
| **C2** totals must reconcile to the items | `supabase/checks/reconcile_tiles.sql` is **27 lines of comments containing no SQL.** It documents four verdicts and instructs `select * from tg_reconcile_tiles()` — a function it never defines. Anyone auditing this project would see a reconciliation check and conclude the rule is tested. It is not. **A rule that appears enforced and is not is more dangerous than one openly unenforced.** |

## 🟡 Partial — machinery exists but does not hold the line

| Rule | Where it stands |
|---|---|
| **A1** never invent a number | `no-hardcoded-numbers.mjs` runs in CI — but **ratcheted against a 29-entry baseline**, so 29 known violations are permanently permitted, including 17 in the CEO dashboard. New violations fail; existing ones are legal. |
| **A5** never assume business practice, ask | `open_questions` is the mechanism and it works — **44 unanswered**. Nothing forces a question to be raised instead of guessed. |
| **C1** every tile drills to per-item proof | Audit measured 43/43 coverage once, by hand. No standing check; a new tile can ship without a drill. |
| **C5 / C6** testing status, failed-material split | Canonical functions exist (`f_test_status`, `v_flow_failed_split`); nothing prevents a view bypassing them. |
| **D2 / D3** Metrc corrections at source | `metrc_corrections` cannot close without a Metrc reference — real enforcement at the row level, none at the workflow level. |
| **E5** functions need `search_path` | Nightly check counts `secdef_mutable_path`; currently 0. Detective, not preventive — and watchdog #280 shows three RLS-deciding functions still unprotected. |
| **G1** nothing hardcoded | Same baselined ratchet as A1. Code still carries thresholds (7/14/21/30/180 days) that `conversion_factors` owns. |
| **H1** issues never clear themselves | Strong at the row level: reason codes required, "ignore" must carry a review date. |
| **H2** forensic records immutable | Hook and CI block `delete`/`truncate` on the seven tables — **yet `watchdog_findings` went 100 → 43 rows in one day via a migration.** The guard covers the obvious verb, not every path. **A row-count monitor is the recommended fix and is not built.** |
| **I2** every category has a real dashboard | 11/11 measured once by audit. No standing check. |
| **B2** countable items have no weight | `f_is_weight()` exists and is correct; nothing forces its use. |
| **I3** plain English beside professional | `page_help` and `page_explainers` both **0 rows**. `/explain` skill added 7 Aug; content not yet written. |
| **A2** every figure carries provenance | `metric_provenance` table **exists and holds 0 rows** — designed, never populated. See the Proof Engine below. |

## 🔴 Unenforced — held by discipline alone
**A3** absence explained · **A4** check units first · **A6** verify against live ·
**A7** correct yourself plainly · **B1** convert from the recorded unit ·
**B3** wet and dry never mix · **B4** never subtract dry from wet ·
**C3** potency/COA/manifest everywhere · **C4** location carries dates ·
**E2** re-query after errors · **E3** matviews read base tables ·
**E4** `sum(packages)` not `count(*)` · **F1** anchor edits on signatures ·
**F2** never deploy unseen · **F3** no truncation · **F4** no abbreviations ·
**F5** use the whole page · **G2** licences from `company_licenses` (literals
found at 5 sites in App.jsx) · **G3** rates through `f_rate_for` ·
**G4** thresholds through `f_rule` · **H3** say why something is unrecorded ·
**I4** reports live in the Reports dropdown

Note: **B1, B3, B4 and E4 each have a documented incident behind them** —
18.2 lb vanished, 3,800 lb of evaporated water, a six-fold unit error. The
rules exist *because* they were broken, and nothing today would stop a repeat.

---

## What this ledger is for — the Proof Engine

Four of the pieces are already designed and sitting empty: `metric_provenance`
(0 rows), `metric_challenges` (0 rows), `industry_benchmarks` (0 rows), and
`metric_registry` — which the audit calls **"the keystone"** — which does not
exist. Somebody planned this and never finished it.

**The build:** every number in the platform carries a computed grade on its
face, not a decorative badge:

- **MEASURED · VERIFIED** — derived from Metrc raw data and confirmed by a
  second independent derivation that agrees.
- **MEASURED · SINGLE SOURCE** — real, but nothing corroborates it.
- **OWNER-SET** — a config row, showing who set it and when.
- **DERIVED** — computed from measured inputs, with the formula shown.
- **DISPUTED** — two derivations disagree. The disagreement is displayed, not
  averaged away.
- **ABSENT** — and exactly why, and what would make it appear.

`metric_challenges` is the part that makes it alive: **any user can challenge
any number**, and the challenge becomes a finding with an owner, not a
complaint in a hallway.

**Why this is the flagship:** it turns rules A1, A2, A3 and C2 from prose into
machinery, it completes a design already half-built in the schema, and it
gives the business something almost no enterprise software has — a platform
that states how sure it is, and refuses to pretend when it doesn't know.

## Recommended order
1. **Make C2 real.** Write `tg_reconcile_tiles()`. Highest urgency: it is the
   only rule currently lying about itself.
2. **Wire the guards that exist but nothing runs** — `routing.mjs`,
   `error-boundaries.mjs`, `report_fixtures.py` into CI; add
   `--max-warnings 0` to eslint. Free enforcement, already written.
3. **Row-count monitor on the seven forensic tables** (closes the real H2
   breach).
4. **`metric_registry` + `metric_provenance`** — the Proof Engine spine.
5. **`metric_challenges`** — let every number be contested.

*Items 1–3 are Agent B / watchdog lanes. Items 4–5 need the owner's ruling on
grade definitions before anyone writes schema. Agent D owns this ledger and
re-grades it whenever enforcement changes.*
