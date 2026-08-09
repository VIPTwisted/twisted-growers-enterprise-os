# TG OS Common Charter — every department reads this FIRST and obeys it absolutely.

## The Four Laws
(1) ONE system — the TG OS is the record. (2) Fully dynamic — everything computed live.
(3) NO FAKE DATA ever — honest empty states. (4) No code edits to operate — config is DB rows.

## FORBIDDEN — no agent may EVER do these, no matter what its task says:
- **NEVER change the theme.** Do not edit theme tokens, --canvas, --canvas-glow, brand colors,
  fonts, the glow system, or ANY visual styling in styles.css beyond adding new-component
  classes that consume EXISTING tokens. The theme is FINISHED AND LOCKED by the owner
  (2026-08-05). Visual changes happen ONLY on explicit owner direction routed through the COO.
  If your task seems to require a theme change, STOP and report instead.
- Never push company data to ClickUp/Monday/any external system beyond the owner's approved
  scope (currently: ClickUp structure names + roster only). Pulling inward is always safe.
- Never invent statistics, prices, employees, or records. Never seed sample data.
- Never delete or overwrite owner content (spaces, sheets, boards, tasks) — flag instead.
- Never handle credentials in plain text — secrets live in integration_secrets, write-only.
- **Never write a licence number into a document, a template or code.** There are exactly two
  and they come from `company_licenses`: **MC281714 = cultivation**, **MP281909 = manufacturing**.
  **157557 is the owner's Metrc USER ID and is NOT A LICENCE** — it belongs to the user key and
  is never associated with a facility. Rules G1 and G2. In code use `f_is_ours()`, or
  `f_any_ours(text)` / `f_all_ours(text)` where a field may hold a comma-joined LIST — labs print
  `License #: MC281714, MP281909` and **621 of our 983 certificates are stored that way**, where
  `f_is_ours()` returns FALSE because it matches neither member.
  *Why this is a FORBIDDEN-list item and not a style note:* the owner settled the mapping on
  7 Aug 2026 with a screenshot of the Metrc facility switcher, the live systems were fixed the
  same day, and two days later `docs/09_METRC_API_ACCESS.md` was wrong: it named MC157557 as the
  cultivation licence, and MC157557 is not a licence at all —
  in the body of an email addressed to **api-info@metrc.com**. A user ID would have gone to the
  regulator in a licence field. `brain/CONTRADICTIONS.md` §4 had flagged it verbatim and nothing
  acted. **Enforced since 9 Aug 2026 by `tools/checks/docs-vs-database.mjs`**, which verifies
  every licence in every live document against `company_licenses` and fails the build.

## IN FLIGHT IS NOT A FAILURE (established 9 Aug 2026 — bit three agents in one day)

**A check over a process must know which rows are still IN FLIGHT, or it measures the calendar.**

Three findings, three agents, one root cause, none of them looking for it:
- *201 packages "never confirmed received"*, critical, tolerance 0 → **154 were shipped that week
  and simply in transit.** Of 11 genuinely aged manifests, 3 received nothing and 8 were partial.
  **77% of a critical finding was work still in the air**, and the check had been red on every
  run since it was written.
- *A package counted twice* → it exists under both licences mid-transfer, because the sending
  side is never marked departed.
- *1,369 lab samples "missing"* → shipped to a lab, absent from a mirror that syncs only ACTIVE
  packages.

**None was an error in the data. All three were states the checks had no concept of.** A
tolerance of 0 on a metric that cannot reach 0 while anything is in flight is a check that is
always red and therefore ignored.

**How to apply.** Before writing or trusting any check that compares two ends of something —
shipped/received, sent/acknowledged, submitted/returned, started/finished — ask *what is still
in the middle?* `verification_checks` now carries `measures_a_process`, `in_flight_rule` and
`settles_within`, and a CHECK CONSTRAINT refuses a process check with no declared in-flight
rule. `settles_within` is **owner-set**: never infer it from the data, because inferring it from
late rows makes lateness normal (rule A5). `v_checks_missing_in_flight` lists what is still
undeclared.

**And the epistemics, from the agent who caught their own error:** *"What caught it wasn't a
guard. It was looking at the seven rows instead of trusting the count."* A count is a summary of
rows you have not read. Open the rows.

---

## Standing rules
Theme: neon green brand (#2df26a/#5cff92), zero purple, zero grey/pastel icons (solid vivid
tiles), bright reds (#ff4245 dark / #f5222d light), Figtree font, user-controlled glow via
Settings only. Language: NO abbreviations user-facing (Finished Goods, Certificate of
Analysis, Quality Assurance, Bill of Materials, Human Resources). Color code: green=good,
red=issue, amber=watch, orange=elevated, blue=neutral. Verify against the live system before
reporting; log findings in actions_register; anything ambiguous → report, don't guess.
Deploy ritual: build → stage tg_deploy → fresh Netlify token → deploy → commit at repo root.

---

## RULE ZERO (owner, 7 Aug 2026) — outranks everything, including "move fast"
**Never do anything that can break system.** Measure before you change. Verify
after. If a change cannot be undone, it needs the owner. **Slow is fine. Broken
is not** — this is a licensed operation and Metrc is a legal record.

## BEFORE YOU TOUCH DATA — read `brain/DATA_TRAPS_REGISTER.md`
Every trap in it has already cost this business real money. The ones that bite
most often, inline so you cannot miss them:

- **A summary/footer row is not a transaction.** One added **$1,692,460 of
  fabricated revenue** and was quoted to the owner.
- **$0.01 placeholder prices.** ~319 lines. In `metrc_rpt_wholesale` they
  aggregate to $0.02/$0.03 — **filter `>= 1.00`, never `> 0.01`.**
- **A manifest-level weight is repeated onto every package line.** Per-pound
  figures from those rows are nonsense.
- **Repackaged material keeps the original harvest name.** Counting it inflates
  production **up to 142%**. Primary production = `SourcePackageCount = 0`.
- **Wet and dry never mix.** Fresh frozen is packaged WET (~78% of wet weight);
  dried flower packages at ~15.5%. Summing them once overstated harvests by
  3,800 lb.
- **Countable items have no weight** (`f_is_weight`). **Never assume grams**
  (`f_to_pounds`) — 18.2 lb once vanished to a bad divide.
- **Catalogue row counts are ESTIMATES.** `reltuples` reads 0 on small tables.
  **Always `select count(*)`.** Five populated tables were called empty this way.
- **A custody movement is not a sale.** Storage and transporter destinations
  booked **$901,430** as revenue. A transporter-licence destination is never a
  sale.
- **Truncated Metrc tags** (`1479`, not the 24-char tag) — two collisions
  already observed. Resolve full tags before any join.
- **Maturity censoring.** A pull takes ~8 months to package out. Comparing a
  young period to a mature one manufactured a fake decline; the truth was the
  opposite.

## DATABASE SAFETY — these three have each broken production
- **NEVER `drop view … cascade`** (E1). It blanked every dashboard **three
  times**, silently, because reads swallow errors. Use `create or replace`.
- **NEVER `grant … to anon`** (E6). And revoking from `anon` alone is a no-op
  while PUBLIC holds the grant — **revoke from `public, anon`** and verify with
  `has_function_privilege`.
- **NEVER delete from the append-only forensic tables** (H2) —
  `watchdog_findings`, `issue_decisions`, `cost_input_history`,
  `metrc_corrections`, `moisture_loss_entries`, `ddl_guard_log`,
  `alert_outbox`. One migration took `watchdog_findings` 100 rows → 43 without
  a DELETE. **Watch the row count, not just the verb.**
- **Enable RLS at table creation, never after.**
- **Anchor scripted edits on a function signature**, never a common line like
  `const [busy, setBusy]` — that put state in the wrong component three times.

## HOW TO FIX — the protocol, every time
1. **Measure first.** Record the number you are about to change.
2. **One change.** Not three.
3. **Measure again with the same query.** Report both numbers.
4. **Know the undo before you start.** State it in your report.
5. **Verify the thing you did not touch** — a dashboard going blank is the
   classic silent failure (129 read sites swallow errors as `?? []`).
6. **Stay in your lane.** Out-of-lane findings go to `actions_register` or a
   work order — never a quiet fix in someone else's file.
7. **If you cannot verify it, do not do it.** Report instead.

## THE META-TRAP — the one that has cost most
**A decision recorded is not a decision implemented.** Sales endpoints were
"permanently disabled" on 6 Aug and were still firing 401s a day later. Nine
sync rules were drafted and never merged. An agent row read "disabled" in its
description while `enabled` stayed true.

**A finding is not closed until something in code, config, or a check enforces
it.** When you close one, name the guard. **If there is no guard, say so
plainly in the finding** — an unguarded fix expires.

## Verification discipline
Derive anything that matters **two independent ways** — never the same source
twice. **If they disagree, the disagreement IS the finding**: report both
numbers and both methods, never average, never pick silently. Watch for a
check that cannot fail: if source B is computed from source A, it proves
nothing. State sample sizes. State what you could not measure and why.

---

# READ `brain/AGENT_BRIEFING.md` BEFORE ANYTHING ELSE
It holds Rule Zero, the twelve data traps, the three database rules, the fix
protocol and the ownership methodology. Everything in it has already cost real
money. **You are not briefed until you have read it.**

# ⛔ OWNERSHIP: STOP AT THE COA — owner ruling, 7 Aug 2026
**Nothing gets posted if there is a discrepancy.** No figure, tile, report or
finding leaves your hands while two sources disagree. Resolve it or report the
disagreement as the finding — never publish through it.

**Never answer "is this ours?" from `ItemFromFacilityLicenseNumber`.** That
field names whoever defined the *item*, not who owned the *material*, and it
flips to us on any repack under a new item name. **191 active packages /
420.6 lb** read as ours today and trace to outside licences.

**The order, every time:**
1. **Check ours** — the licence field, and `f_material_origin(tag)` which walks
   `SourcePackageLabels` to its roots and returns origin licences, inbound
   manifests and source harvests.
2. **Look for doubt** — a repack (`SourcePackageCount > 0`), an inbound manifest
   anywhere in the lineage, source harvests missing from `metrc_harvests`,
   harvest names off our convention `TG <strain> - <YYYYMMDD> <room>`, or a tag
   series other than `1A40A030000E5B1` (MC281714) / `1A40A030000E5B2` (MP281909).
3. **On ANY doubt, open the COA. DO NOT PROCEED WITHOUT IT.** The certificate
   from the testing laboratory is the only independent source for who grew or
   made the material. Another internal field cannot disconfirm an internal
   field — a check that cannot fail proves nothing.

**The COA calls it `Client Info`** — the name, address and `License:` under that
heading is the cultivator, manufacturer or processor. Also cross-check
`METRC Batch ID` (the harvest) and `METRC Source ID` (the sampled package).

**The PDFs are already on disk**: `metrc_documents.storage_path`
(`coa/<id>.pdf`, `manifest/<n>.pdf`) with a signed `download_url`. `curl` to
fetch, `pdftotext -layout` to read. Both work on this machine.
**`coa_extract` cannot help you** — 983 certificates parsed, not one records the
client or licence. Open the PDF yourself until that is fixed.

**Worked example, 7 Aug 2026.** Package `1A40A030000E5B2000009058`, 56.84 lb,
was ruled "ours, remediate in house". `coa/2267739.pdf` (GAMA `GGDB-00016`)
named the client as **Greater Goods, LLC, License MB282344**. Batch, source
package and the Total Yeast and Mold failure all matched the certificate
exactly. **The only discrepancy in the document was ownership, and it was ours.**

**FIXED 7 Aug 2026 — use `v_item_documents` and `v_document_package_link`.** The
manifest→package link is derived from `metrc_rpt_package_transfers` (19,256 rows,
2,643 manifests, full 24-character tags) and now attaches **2,642 manifest
documents**, up from 0. **Never read `metrc_documents.package_tag` for a manifest
— it is null on all 2,690 and always will be, because a manifest covers MANY
packages and one column cannot hold that.** Item status: COMPLETE 869 · COA only
1,219 · MANIFEST only 419 · NEITHER 1,067. **Tested or sold and not COMPLETE must
not go to a customer.** STILL OPEN: outgoing transfer records carry a null
RECIPIENT — Metrc returns it on `/transfers/v2/{id}/deliveries`, which the sync
has never called.


**📎 DOCUMENT LINKS — NO EXPIRY.** Use `f_item_documents(tag)` on every page and
every line item. It returns `storage_path`, **never a URL** — mint one at click
time with `createSignedUrl(storage_path, ttl)`. **Never store, cache or render a
stored `download_url`:** all 3,666 were signed together and expire 5–6 Sep 2026,
which would kill every print/download button on one day. **The FILE is permanent —
records are kept and sent years later.** Do not confuse that with `coa_valid_until`,
which is the REAL one-year regulatory validity of the lab result (736 packages
past it, 2 still active) — product cannot be sold on an expired certificate.
**The platform serves documents; shipping and receiving email them.**
`document_sends` is empty by decision.


**🔢 A COUNTABLE ITEM STILL HAS A QUANTITY.** `case when f_is_weight(uom) then
f_to_pounds(...) end` is right to refuse to invent a weight, but it NULLS the row —
a counted item then publishes as nothing. That hid **18,822 units across 143 active
packages** (7 Aug 2026), including 5,163 gummies shown as the bare word "countable".
**Use `f_quantity_text(qty, uom)`** — renders "12.5 lb" or "1,933 ea". Cross-check
every pounds total against **`v_countable_inventory`**. **Never add units to pounds.
Never publish a row with no quantity on it — flag it instead.**


**⚠ THE BRAIN CAN BE WRONG, INCLUDING THE BRIEFING YOU WERE JUST GIVEN.** It is
printed to you verbatim at session start, which makes it trusted — so a stale
number in it is not a documentation problem, it is **wrong training**. Two claims
written on 7 Aug 2026 were false within two hours. **Numbers in the brain are
perishable; prose and rules are durable.** Every figure is registered in
`brain_claims` with the query that proves it, re-derived nightly by
`tg_check_brain_claims()`. **If a number matters to what you are about to do,
RE-MEASURE IT and quote the live value.** If it differs from the document, that
difference IS the finding — correct the file, never delete the claim to silence it.


**⚠ A LICENCE FIELD CAN HOLD A LIST.** Labs print `License #: MC281714, MP281909`,
so `coa_extract.client_license` holds that whole string and **`f_is_ours()` returns
FALSE on it** — it matches neither member. **621 of our 983 certificates are stored
that way.** A check written for the single case reported our own product as another
company's and inflated a 3-package question into 164. It never errored; it
answered the wrong question. **Use `f_any_ours(text)` or `f_all_ours(text)`.**
`f_is_ours()` remains correct for ONE licence. General form: *a field that usually
holds one value sometimes holds a list — check before you compare.*


**🔒 HARD RULE — PROOF REQUIRED FOR "NEVER TESTED" (owner, 8 Aug 2026).** Any item
you report as untested with no COA and no manifest must be shown in **Metrc
inventory, in a named room** — Massachusetts law requires Metrc to hold the current
room for every tagged package — **with its seed-to-sale chain**. Use
`v_never_tested_proof`; `where proof like 'FAILS%'` must return zero rows.
**ALL FOUR SOURCES MUST AGREE:** Metrc `lab_testing_state`, zero `metrc_lab_results`,
zero `metrc_rpt_package_transfers` lines, and zero certificates filed DIRECTLY against
it. An **inherited** certificate is expected on untested intermediate product; a
**direct** one is a contradiction. **A benign explanation is the one to evidence
hardest, because nobody challenges it.**

---

# THE STANDARD. Owner, 9 August 2026: "always hard rule to review code and
# ensure MIT... microsoft google standard or beat them. Nothing underpar."

This is not a slogan. Every line below was earned by a specific failure on this
platform, most of them within one week, and several of them mine. A standard
nobody can check is a standard nobody keeps, so each one is written as something
you can be caught not doing.

## 1. A CHECK THAT CANNOT FAIL PROVES NOTHING

Before you rely on a guard, BREAK SOMETHING AND WATCH IT CATCH THAT. Then put it
back.

Written because `ownership.confirmed_not_ours` counted rows of the view it was
checking - it could only ever pass. And because a scheduled retry ran 1,440
times a day retrying nothing, which read as green for as long as anybody looked.

## 2. MEASURE. DO NOT ASSERT.

"It is faster now" is not a result. "17 seconds cold, 8 warm, measured through
the real queue" is. If you cannot measure it, say that instead of implying you
did.

Written because every speed claim made in one day - all mine - was a single
stopwatch reading quoted as if it were the system's behaviour.

## 3. A WRONG LABEL COSTS MORE THAN NO LABEL

A check that calls a healthy thing broken gets ignored, and then it is not a
check. Nobody ignores an alarm because it is quiet; they ignore it because it
cried wolf.

Written because the loop-health view had to be rewritten THREE times: a fixed
threshold that broke on daily jobs, an "ever failed" rule that never forgave a
recovery, and a cadence that did not understand overnight windows. Each version
looked reasonable and would have trained somebody to stop reading it.

## 4. ABSENCE AND NO-ACCESS ARE NOT THE SAME THING

A null is not an absence. A zero row count may mean "not permitted". Before
reporting that anything is empty, missing or not tracked, prove you can SEE it.

Written because a null field produced an invented blind spot, two cron jobs and
a PDF pipeline built to solve a problem that did not exist - and because the
assistant reported a table as empty when it held 3,675 rows, in one second, with
no hesitation at all.

## 5. DATA MUST SAY WHAT IT IS

A figure that does not carry its own caveat will be quoted without one, by
somebody who was not in the conversation where the caveat was explained.

Written because $1,317,836 of PURCHASES was read as revenue - the column exists
on both directions and did not say which. And because 21 pay rates that nobody
approved were presented with exactly the confidence of rates somebody had.

## 6. WHAT RUNS IN PRODUCTION IS IN THE REPOSITORY

No exceptions. If you deploy it, commit it in the same breath.

Written because three edge functions ran for days with no source anywhere -
including the one every assistant answer passes through. Two of them had been
deployed by an agent that never committed them.

## 7. DO NOT WORK AROUND A GUARD

If a hook or a gate blocks you, it is more likely to be right than you are. Fix
the thing it objected to, or tell the owner. Never route around it.

Written because a DELETE against an append-only forensic table was blocked
correctly, and because a guard that blocked a view drop held even when I thought
I had a good reason - a view an hour old is exactly the kind of thing that feels
safe to drop, and the habit is what costs you later.

## 8. SAY WHAT YOU DID NOT DO

Report the part you skipped, the case you did not cover, the number you could
not verify. A summary that mentions only successes is a lie of omission, and it
is the most common kind told by an agent.

If another agent's work is open in a file, DO NOT EDIT IT. Two agents nearly
deleted each other's work twice in one day, and both times it was caught by
reading the diff before committing rather than by anything automatic.

## 9. THE COMMIT MESSAGE IS THE RECORD

Write why, not what. The diff already says what. Include the thing you got wrong
on the way, because the next person will otherwise repeat it - and because a
message that reads as though the work went perfectly is usually hiding the part
worth knowing.

## 10. FINISH, OR SAY IT IS NOT FINISHED

"Done" means measured, committed, and verified in the place it actually runs. A
change that works on your machine and has not shipped is not done, and calling
it done is how a day's work sits invisible while somebody refreshes a page and
wonders why nothing changed.
