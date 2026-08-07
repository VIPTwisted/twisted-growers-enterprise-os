# Hardcoded values — the full register

**Owner, 7 August 2026: "Anything hardcoded is a serious violation of my
rules."** Rule G1: *Nothing is hardcoded. Every threshold, rate and licence is
a database row an authorised user can change. Config = rows, never code.*

Compiled by Agent D from the 7 Aug forensic code walk of `App.jsx` (7,910
lines), `budz.jsx` (2,027), the bridge, the recovered edge functions and
`tools/`. **Line numbers are as of 7 Aug and will drift — re-grep before
editing.** Fixing these is Agent B's lane (front end) and the watchdog's
(credentials); cataloguing and re-grading them is Agent D's.

---

## The finding that matters most

**The check that enforces this rule has been configured to permanently allow
29 violations.** `tools/checks/no-hardcoded-numbers.mjs` runs in CI, but
ratchets against `no-hardcoded-numbers.baseline.json` — 29 entries, **17 of
them in the CEO dashboard.** New violations fail the build; **every existing
one is legal forever.** The rule is being broken by its own enforcement.

**And worse than hardcoded — hardcoded *and contradicting the owner*:**
| Code says | The owner / database says |
|---|---|
| harvests open past **21** days | **28 days** — owner's own calendar, and `conversion_factors.harvest_open_max_days` carries a note reading *"…so it is the limit, **not 21 or 65**"* |
| dry window `>= 7 && <= 16` | **10–14 days** — and the on-screen label says 10–14 while the code counts 7–16 |

A note written specifically to argue down a wrong number was read, and the
wrong number was used anyway.

---

## 1 · Numbers stated as measurement that are actually arithmetic in code
**Metrc scan-schedule page** (`App.jsx` ~5744–5855) — the worst offender,
because it presents fabricated figures as measured fact **under a footer that
reads "Times are owner-set and editable — no code change."**
`daytime = scheduled + 10` · `total = daytime + 1099` · `"5,141"` calls/day ·
`4032` baseline · `"4 records from roughly 400 calls"` · **two entire
hardcoded table rows** (Lookups 7:20am/1/10; Nightly reconcile 7:10am/1/1,099)
· `"returning an error 200 times a day"` · `"re-reads all 21,132 records"` ·
`width: "27%"`.

**Report imports page** (~6145–6146, 6274): **"the 380 lb monthly target"** ·
"12,675 of the 13,246 priced packages" · "returns 401" · "uploaded eight times
and still holds exactly 350 harvests".
> ⚠ **"380 lb monthly target" collides with the owner's 380k harvest goal set
> 7 Aug.** One is weight, one is probably dollars, and they share a number.
> Unit unconfirmed — see [DECISIONS.md](DECISIONS.md). Rule A4.

**CEO dashboard** (`budz.jsx`): nine frozen figures presented as live proof —
"65 days", "7,962 lb", "29 of 143", "190 days / 4,515 pounds" — **already
self-contradicting a live `${dryOk} of ${dry.length}` tile on the same page.**

## 2 · Business thresholds in code while `conversion_factors` exists to hold them
Cash staleness `>= 7` (**duplicated**, ~3568 and ~7629) · severity ladder
`>= 30 / >= 14 / >= 7` (~3627) and the *same* ladder re-implemented as
critical/elevated/watch (~5498) · lab turnaround `> 14` (~786) · waste
`> 10` (~890) · findings open `> 14` (~2032) · package idle `> 14` (~6830) ·
ageing `> 180 / > 60` (~6900) and `> 180` again (~7239) · `?? 999` sentinel
for "never updated" (~3565).

## 3 · Formula constants inside the Production Calculator
Under a subtitle reading **"Nothing is hardcoded"**: `/ 454` (~2320, ~2355) ·
`/ 0.877` decarboxylation (~2344) · `hours_workday - 2` (~2348) ·
`workdays_week * 52 - holidays_year` (~2349) · "the 13 percent
decarboxylation loss" (~2406) · "the inherited $1,100 default" (~2163).
**A forecast built on constants the team cannot edit is not their forecast.**

## 4 · Licence numbers as literals — a named rule (G2), broken at 5+ sites
`MC281714` / `MP281909` at ~36, ~1593, ~4524, ~4567–4568, ~7686–7687.
**G2: licences come from `company_licenses` via `f_is_ours()`, never
literals.** Now doubly important: the owner settled on 7 Aug that MC281714 is
cultivation and MP281909 manufacturing, and a licence change would today
require a code deploy.

## 5 · Permission lists as literals — 9 sites
`["owner","executive","planner","dept_head"]` repeated at ~2120, ~2305,
~2538, ~2792, ~3042, ~3157, ~3473; plus `role === "manager"` (~4275) and the
owner/executive check (~7648). **`permission_catalog`, `app_roles` and
`role_permissions` are all 0 rows** — the permission model lives entirely in
code, which is the direct blocker on the owner's "those with permissions"
requirement.

## 6 · Registries that should be rows — roughly 20
`METRIC_GROUPS` (tile labels + drill targets) · **`TRACE_KEYS` / `NEVER_TRACE`
— literal room and vault names** · `TODAY_BOARDS` (nine hand-written queries)
· `SYNC_SOURCES` (integration registry with live true/false flags) ·
`KPI_TABLES` · `MIRROR_SETS` · `STATUS_COLS` · `DIM_COLS` · `FG_TABS`
(per-product-line columns) · `REPORT_TYPES` · `DASH_STARTERS` · `TASK_STATUSES`
· `VE_*` · `G_PER` / `COUNT_UOMS` · `TGSS_HOURS` · `HELP` article bodies ·
`OVERHEAD_SUGGESTIONS` · `BRAIN_*` · WIP stage names (~6866) · lab-state
mapping (~6913) · **`DEPT_BY_VIEW`, annotated in the file itself as having
already broken once** · `LAUNCHER_APPS` (dead, superseded by a DB-driven list).

## 7 · Credentials as literals — watchdog lane, not front end
One shared `x-admin-key` literal across **16 recovered edge functions**
(redacted in the repo copies; still live in the deployed ones) · the bridge's
default token fallback and an embedded anon JWT (`bridge/server.mjs` ~26,
~162) · a literal admin key in `tools/pushreports.py` ~17.
*Exposure sized 7 Aug: repo is private, `pushreports.py` is untracked, the key
never reaches a browser. Low exposure, severe blast radius.*

---

## What to do about it — recommended order

1. **Stop the bleeding.** Drop the CI baseline from 29 to zero-new **and set a
   deadline for the existing 29**, or the ratchet legalises them forever.
2. **Fix the contradictions first** (§ the 21-vs-28 and 7–16-vs-10–14
   thresholds). These are not just hardcoded, they are hardcoded *wrong* and
   overrule the owner in production.
3. **Kill the fabricated-measurement pages** (§1). A page that states invented
   arithmetic as fact breaks A1 and A2, not just G1.
4. **Move thresholds to `f_rule()` and rates to `f_rate_for()`** (§2) — the
   functions already exist and are already correct.
5. **Licences through `f_is_ours()`** (§4) and **permissions into
   `permission_catalog` / `app_roles` / `role_permissions`** (§5) — the latter
   is a prerequisite for the owner's work/plan/goal/budget/forecast
   requirement.
6. **Registries to rows** (§6), largest blast radius first: `DEPT_BY_VIEW`,
   `SYNC_SOURCES`, `TODAY_BOARDS`.
7. **Credentials to secrets** (§7) — required before any edge function is
   redeployed from the recovered copies anyway.

**Then re-grade G1 in [RULE_LEDGER.md](RULE_LEDGER.md), which currently reads
🟡 Partial for exactly this reason.**
