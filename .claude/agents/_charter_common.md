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
