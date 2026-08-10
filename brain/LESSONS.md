# Lessons log

Every expensive mistake, what it cost, and the rule it produced. Newest first.
The hard rules in CLAUDE.md were born here — this file is their case law. When
something breaks or an assumption dies, it gets an entry **the same session**.

Format: **date — what happened → what it cost → the rule now.**

---

**2026-08-09 — A LESSON WRITTEN IN THIS FILE ON 7 AUGUST WAS STILL LIVE ON
9 AUGUST, AND AN AGENT HARDENED IT INTO TRAINING IN BETWEEN.** The 7 Aug entry
below records that `budz-chat`'s prompt contradicted the owner's locked facts:
it called grams per plant "NOT a valid benchmark" and named grams per square
foot as the real one — a measurement **this business does not possess**, because
`grow_rooms.sqft` is null by design and the figure once held there was a plant
count in the wrong column.

Two days later it was still deployed, in **six** places: the canonical rules,
three runtime copies, the browser assistant's own rules, and a Chief Executive
Dashboard card telling the owner to his face that his own benchmark "is not a
benchmark any commercial cultivator uses". That card already carried one
correction — it had withdrawn a fabricated 130 g/plant figure — and **the
replacement it offered was wrong too.**

**Agent D made it worse while adding what it called training.** Writing the
seats brief on 8 Aug it put *"Canopy square footage, NEVER grams per plant"*
into the Cultivation seat and propagated that to all four runtimes. It had read
the existing prompt and believed it. → **Rule A6 says verify against the live
record; verifying against another prompt is not an independent source — it is
the same failure as reading one internal field to confirm another, and a check
that cannot fail proves nothing.**

→ **Two rules. First: WRITING A LESSON DOWN IS NOT FIXING IT.** This file
records mistakes; nothing re-reads it, and nothing failed while the
contradiction shipped. A lesson with no guard behind it is a diary entry.
**Second: prompts are configuration and must be governed like any other figure**
— the 7 Aug entry said exactly that, and it is the instruction that went
unexecuted. `rules-in-sync` now holds the four runtime copies together; the
dashboard card was held by nothing, which is precisely why it survived longest.

**2026-08-09 — FIVE OF NINETEEN VERIFICATION CHECKS WERE LYING, AND NOTHING IN
THE REPOSITORY COULD HAVE CAUGHT IT.** Found in one sitting:
`packages-unique-on-tag` read **green on 7 real duplicates** because an identity
invariant carried a 0.5% tolerance · `lab-samples-shipped-vs-held` read **4,148%
apart** by comparing every package on a sample-bearing manifest against the
samples themselves · `packages-shipped-vs-received` was **permanently red**
because it mixed normal in-transit traffic with genuinely stuck shipments ·
`room-name-alone-is-not-a-room` **could never pass** and sat in the fault list
looking like a regression · `held-package-counted-once` **did not exist**, so a
real cross-licence double-count went unmeasured.

**Every one was a population error** — the same mistake
[CEO_DASHBOARD_SUBSTITUTION_MAP.md](../docs/CEO_DASHBOARD_SUBSTITUTION_MAP.md)
was written about, five more times. **All three of the worst arrived in a single
batch of eleven on 8 Aug**: written, inserted, scheduled, never verified.

**Why nothing caught it: the guards guard the repo, the checks live in the
database, and nothing spanned the gap.** `guard-fixtures.mjs` proves the *file*
guards still catch and contains zero references to `verification_checks`. No
file in the repository tests their SQL. **CI holds no database credential** —
only `GITHUB_TOKEN` — so a repo-side gate could not reach them even in
principle. → **`tg_verification_checks_sane()` now audits every check for seven
failure modes, and PROVES ITSELF FIRST**: five deliberately broken fixtures,
each asserted to be caught by its own rule, and the nightly job **refuses to
report if any escapes** — a clean sheet from a blind auditor is worse than no
auditor, because it manufactures confidence. **Rule: enforcement must live where
the thing being enforced lives.**

**2026-08-09 — THE CHALLENGER WAS FULLY BUILT AND HAD NEVER RUN. 97 findings,
zero challenged.** `v_unchallenged_findings`, `v_challenge_overdue` with a real
SLA per severity, `metric_challenges` to hold the verdict, and
`tg_require_double_check` guarding closure — **all present, all correct, and the
queue that said so had been right and unread since the day it was written.** 14
criticals sat past their window, the worst 72 hours over a 24-hour SLA, and 29
findings carried no arithmetic at all.

→ Same shape as the alert sender that reported itself unconfigured hourly into
nowhere, and the schema dump that recorded *"NOT CAPTURED: permission denied for
schema cron"* honestly and was read by nobody. **Rule A3 makes a tool explain
its own gaps. It does not make anyone LOOK.** → `tg_escalate_unchallenged()`
reads the queue nightly and raises a finding. **The general lesson: the last
inch — something that reads the output — is the part that keeps getting left
off, and without it the other 99% enforces nothing.**

**2026-08-07 — A DEPLOY SILENTLY KILLED THE METRC SYNC FOR 5½ HOURS AND EVERY
DASHBOARD REPORTED SUCCESS.** `metrc-sync` was redeployed as v15 at 11:31 UTC
with `verify_jwt: true`. Its scheduler, `tg_metrc_fire`, sent only an
`x-admin-key` header — **no `Authorization`** — so the Supabase gateway
rejected every dispatch with `401 UNAUTHORIZED_NO_AUTH_HEADER` **before the
function's own auth check was ever reached.** `metrc_scan_schedule.last_result`
kept reading *"dispatched (scheduled)"* throughout.

**The knowledge was already in the codebase.** The sibling function
`tg_call_function` does it correctly and carries a comment saying exactly why:
*"the gateway checks a bearer token before the function's own admin key is ever
seen."* Two functions, one door, one lock — and the scheduler used the
unlocked door.

**Detection took a human asking.** Zero of six health functions read
`metrc_scan_log`, so a dispatch that produced **no run row** was invisible to
everything. **Every guard in this platform watches for a bad row; none watches
for a missing one.**

→ **Rules:** every scheduled Edge Function call carries
`Authorization: Bearer <anon>` from `integration_secrets` — copy
`tg_call_function`, never hand-roll headers. **A redeploy that changes
`verify_jwt` is a breaking change to every caller.** And **absence must be
monitored, not just failure** — see [SENTINEL_SPEC.md](SENTINEL_SPEC.md).

*Fixed and verified 7 Aug 19:38 UTC by Agent D: gateway 401 → 200, 13 sync
runs, 0 errors, 73 packages + 6 transfers + 10 items pulled.*

**2026-08-07 — THE FALSE-GREEN PATTERN: this platform reports success unless
failure is TOTAL. Three separate instances found in one day.**
1. `App.jsx` — **129 read sites** use `k.data ?? []`, so a failed query is
   indistinguishable from an empty table. One surface site in the whole app.
2. `metrc-lab-sync` — `status: errors.length && tests === 0 ? "error" : "ok"`.
   **A run with 500 errors and 1 success reports "ok".** This is why nobody
   could tell whether the lab sync was fixed.
3. The report importer — an import detected the type, passed every check,
   reported `ok`, and **wrote zero rows**, because the mapper dispatched on a
   literal report key that matched no branch.
→ **A status field that only goes red on total failure is worse than no status
field**, because it actively certifies the broken thing as working. **Rule:
partial failure is failure. Rows in with no rows out is a rejection.** Agent A
has now guarded #3; #2 belongs to whoever owns `metrc-lab-sync`; #1 is the
architecture.

**2026-08-07 — Agent D declared a fixed bug "still broken" by reading a time
window without reading the timeline inside it.** The work order to Agent A
stated the lab-results sync was failing on `ON CONFLICT` across "12 runs in 48
hours". True count, wrong conclusion: **all 12 were on 5 Aug in a single
five-minute retry burst (17:24–17:29), BEFORE the index was added — and the
one run after the fix, 6 Aug 16:57, succeeded with 282 records.** Agent A
caught it and proved the mechanism live by running the exact `ON CONFLICT`
twice.
→ **Count the failures, then plot them against the fix.** A cluster before a
change is evidence the change worked, not that it failed. This is attack #3
(*maturity and censoring*) in the Challenger agent Agent D wrote the same day —
**built the guard, then made the mistake it exists to catch.** Run the
Challenger on your own work orders before sending them.

**2026-08-07 — Agent D reported "0 rows" on tables that were not empty,
because `list_tables` returns ESTIMATED row counts, not counts.** Postgres
`reltuples` is a planner estimate and reads 0 for small or recently-written
tables. Agent D repeated "0 rows" for `ai_settings` (really 1, and richly
configured), `assistant_profile` (1), `page_help` (6), `page_explainers` (3)
and `ai_user_access` (2) — and told the owner the AI layer was unbuilt when it
was substantially built. → **Never quote a row count from a catalogue
estimate. `select count(*)` or say nothing** (rules A1, A6). Every "0 rows"
claim made from the first survey is suspect and must be re-counted before it
is used.

**2026-08-07 — The AI assistant's system prompt contradicts the owner's own
locked facts, in production.** The deployed `budz-chat` function instructs the
model: *"Grams per plant is NOT a valid benchmark… the real benchmark is grams
per square foot of canopy."* **The locked facts say the exact opposite** —
yield is measured per PLANT (70.6 g/plant target), the "grams/sqft" column is
mislabelled, and **there is no measured square footage anywhere in the
business.** The prompt also carries moisture at 75–80% where the live config
is 70–77%. → **An assistant primed with superseded facts will argue against
the owner's own record, with confidence and no citation.** Prompts are
configuration and must be governed like every other figure (A2, G1): sourced,
dated, and updated when a locked fact changes.

**2026-08-07 — Agent D nearly propagated a wrong unit using confident
arithmetic, and only asking stopped it.** The owner set targets of "380k
monthly / 180k per pull" without stating a unit. Agent D reconciled them as
**dollars** and showed arithmetic that closed to within 2% — 1,050 plants ×
70.6 g target = 163.4 lb × $1,100 = $179,762 ≈ 180k. It looked airtight. **It
was a numerical coincidence**, and the owner confirmed the unit is **pounds**.
The correct reading is **380 lb per month, 180 lb per room pull**, which
closes even better: 1,140 plants × 70.6 g = 177.4 lb ≈ 180 lb, × 2.17 pulls
per month = 385 lb ≈ 380 lb. → **Plausible arithmetic is not evidence of the
right unit. Rule A5 (ask, never infer) is not a courtesy — it is the only
thing that caught this.** Same family as the grams-per-plant vs
grams-per-square-foot error that was wrong by six times, and the 62.5%
moisture figure that was wrong before anyone used it.

**Corollary found the same minute:** the hardcoded **"380 lb monthly target"**
in `App.jsx` (~6145) was **correct all along.** It is still a G1 violation
(config belongs in a row, not in code) — but it should be *moved*, never
"corrected".

**2026-08-06 — A summary footer row was imported as a transaction:
$1,692,460 of fabricated revenue, quoted to the owner before anyone
checked.** The Wholesale Transfers report ends with a grand-total footer;
forward-fill carried a manifest number onto it and it stored as a sale — one
row carrying 30% of all revenue. The moisture import had been validated
against Metrc's own scorecard; the revenue import was not. → **Validation
discipline applies to EVERY imported figure, not just the one being argued
about. `f_is_summary_row()` now rejects totals rows at the mapper;
`v_import_outliers` flags any single line carrying >5% of a money total.**

**2026-08-06 — A sync that logs "ok, records: 0" every run is a fault, not a
quiet day.** Delta windows never walked history: 60% of harvests, 41% of
manifests and every reference table (items 0 vs 1,177) were missing while
every run reported success. → **Zero-forever is a finding; reconcile counts
against Metrc's own Facility Metrics. And `pageSize` caps at 20.**

**Workbook era (recorded 2026-08-04) — a fabricated 130 g/plant benchmark
was presented as fact.** → **Every figure carries provenance or does not
exist (A1/A2).** Companion trap, live-platform era: **`count(*)` on an
aggregate view returns group count, not packages — use `sum(packages)`
(E4).** Both are HANDOFF drift risks #4 and #5.

**2026-08-07 — Every potency figure read as absent while 101,608 lab results
sat one table away.** `v_lab_results` read THC and terpenes from
`lab_result_values` — a table that was designed but never populated — while
the real analyte data lived in `metrc_lab_results`. → Sitewide "no result"
on data the platform already had. → **One home per figure. The empty table
is retained (not dropped) with a comment explaining itself, so the decision
stays visible. Two homes for one figure is how they drift apart.**

**2026-08-07 — Three tables shipped with RLS off.** Postgres defaults row-level
security to OFF; three new tables went live wide open before the audit caught
it. → Part of the anonymous-exposure findings: 30 relations returning customer,
manifest and money data to anyone with the publishable key. → **Enable RLS on
every new table at creation, run `supabase/checks/anon_exposure.sql` before
calling any schema work done. Never `grant … to anon` (E6).**

**2026-08-07 — The handoff lied about security being closed.** The 6 Aug
handoff said anonymous access was shut; a line-by-line verification on 7 Aug
found the opposite. → A day of false confidence on the most serious risk in the
platform. → **Verify against the live system before reporting (A6); corrections
go inline and dated, originals struck through, never deleted (A7).**

**2026-08-06 — Counts in documents go stale within hours.** The table count
changed three times during a two-hour audit while two agents shipped schema
changes. → Any report quoting yesterday's counts is wrong. → **Re-measure
before relying on any number in any document; treat written counts as
indicative.**

**2026-08-06 — `drop view … cascade` blanked every dashboard, silently, twice
in one day.** It took `mv_department_dashboard` with it, and `App.jsx` swallows
the failure with `k.data ?? []`, so there was no error — just empty screens. →
**Never `drop view … cascade`. Use `create or replace`; append columns at the
end (E1). Matviews read base tables, never other views (E3).**

**2026-08-06 — A scripted edit anchored on `const [busy, setBusy]` landed in
the wrong component three times.** → Three blank screens, three rollbacks. →
**Anchor scripted edits on the function signature, never on a common line
(F1). Never deploy what you have not looked at signed-in (F2).**

**2026-08-06 — Grams-per-plant compared against grams-per-square-foot.** →
A "you are at half your plan" finding that was wrong by a factor of six. →
**Check units before comparing anything to anything (A4). The calendar's
"grams/sqft" column is mislabelled; it is grams per plant.**

**2026-08-06 — 190 and 210 recorded as room capacity.** They were per-table /
per-batch-group counts filed as rooms. → A full day of false findings. →
**Room capacity is 1,150, locked from the Pull Summary tab. Never re-derive a
locked fact.**

**2026-08-06 — A dry weight was subtracted from a wet weight.** → Open
harvests overstated by 3,800 lb of evaporated water. → **Wet and dry never
mix; convert to dry-equivalent first (B3, B4).**

**2026-08-06 — Pounds got divided by 453.592.** A quantity already in pounds
was "converted" as if it were grams. → 18.2 lb vanished from stock. →
**Convert from the unit Metrc actually recorded, via `f_to_pounds()`, never by
assumption (B1). Countable items have no weight at all (B2).**

**2026-08-05 — New sessions kept opening in the wrong company's folder.**
Claude Code defaulted to `Claude_Dragon Sourcing` — a different business — and
loaded its rules. → Advice built on the wrong company's context. → **Open
`C:\Users\demar\Documents\Claude_Twisted Growers` as the project folder and
verify the working directory as the first message
(`docs/handoff/00_START_NEW_CHAT.md`). The Desktop "Twisted Growers" folder is
a deliberate decoy that only redirects.**
