# Agent briefing — Twisted Growers Enterprise OS
### Paste this to any agent. Self-contained. Read it before touching anything.

You are working on a system that runs a **licensed Massachusetts cannabis
company**. Metrc is the legal record. This platform is a **read-only mirror**
of it. A wrong number here can reach a state filing.

---

## RULE ZERO — outranks everything, including "move fast"
**Never do anything that can break system.** Measure before you change. Verify
after. If a change cannot be undone, it needs the owner. **Slow is fine.
Broken is not.**

## THE META-TRAP — the one that has cost most
**A decision recorded is not a decision implemented.**
Sales endpoints were "permanently disabled" on 6 Aug and were still firing 401s
a day later. Nine sync rules were drafted and never merged. An agent row read
"disabled" in its own description while `enabled` stayed true.

> **A finding is NOT CLOSED until something in code, config or a check enforces
> it. When you close one, NAME THE GUARD. If there is no guard, say so plainly
> in the finding — an unguarded fix expires.**

---

## THE TEN TRAPS — every one has already cost real money
Full register: `brain/DATA_TRAPS_REGISTER.md`. These are the ones that bite.

1. **A summary/footer row is not a transaction.** One became a sale and added
   **$1,692,460 of fabricated revenue**, quoted to the owner before anyone
   checked.
2. **$0.01 placeholder prices.** ~319 lines. In `metrc_rpt_wholesale` they
   aggregate to $0.02/$0.03 — **filter `>= 1.00`, never `> 0.01`.** They
   dragged a realised price from $807 to $363.
3. **A manifest-level weight repeated onto every package line.** Per-pound
   figures off those rows are meaningless.
4. **Repackaged material keeps the original harvest name.** Counting it
   inflates production **up to 142%**. Primary production =
   `SourcePackageCount = 0`.
5. **Wet and dry never mix.** Fresh frozen packages at ~78% of wet weight;
   dried flower at ~15.5%. Summing them once overstated harvests by 3,800 lb.
6. **Countable items have no weight** (`f_is_weight`). **Never assume grams**
   (`f_to_pounds`) — 18.2 lb once vanished to a bad divide.
7. **Catalogue row counts are ESTIMATES.** `reltuples` reads 0 on small tables.
   **Always `select count(*)`.** Five populated tables were called empty this
   way on 7 Aug.
8. **A custody movement is not a sale.** Storage and transporter destinations
   booked **$901,430** as revenue, with the material coming back. **A
   transporter (MT) licence destination is never a sale.**
9. **Truncated Metrc tags** (`1479`, not the 24-character tag). Two collisions
   already observed. Resolve full tags before any join.
10. **Maturity censoring.** A pull takes ~8 months to package out; ~46% lands
    in 30 days. Comparing a young period to a mature one manufactured a fake
    decline — the truth was **40% the other way**.

## THREE DATABASE RULES — each has broken production
- **NEVER `drop view … cascade`.** Blanked every dashboard **three times**,
  silently. Use `create or replace`.
- **NEVER `grant … to anon`.** And revoking from `anon` alone is a no-op while
  PUBLIC holds the grant — revoke from `public, anon`, verify with
  `has_function_privilege`.
- **NEVER delete from the append-only forensic tables.** One migration took
  `watchdog_findings` from 100 rows to 43 **without a DELETE**. Watch the row
  count, not just the verb.

Also: **RLS on at table creation, never after.** **Anchor scripted edits on a
function signature**, never a common line — that put state in the wrong
component three times.

---

## HOW TO FIX — the protocol, every time
1. **Measure first.** Record the number you are about to change.
2. **One change.** Not three.
3. **Measure again with the same query.** Report both numbers.
4. **Know the undo before you start.** State it in your report.
5. **Verify what you did NOT touch.** 129 read sites swallow errors as
   `?? []`, so a blank dashboard is the classic silent failure.
6. **Stay in your lane.** Out-of-lane findings go to `actions_register` or a
   work order — never a quiet fix in someone else's file.
7. **If you cannot verify it, do not do it.** Report instead.

## HOW TO REPORT A NUMBER
State the **basis** before the figure — wet or dry, cost or price, own
production or resale, plants started or plants harvested. **Most disputed
numbers are not wrong; they answer a different question.** Derive anything that
matters **two independent ways**. **If they disagree, the disagreement IS the
finding** — report both, never average, never pick silently. State sample
sizes. State what you could not measure and why. Mark derived figures as
derived.

**Watch for a check that cannot fail:** if source B is computed from source A,
it proves nothing.

---

## WHAT IS TRUE NOW — these override older documents
- **Potency is LIVE.** `metrc_lab_results` holds 101,608 rows across 2,642
  packages and `v_lab_results` reads it directly, with `total_thc_source` on
  every row. **`lab_result_values` and `coa_documents` stay empty by
  decision** — one home per figure. Do not populate them.
- **983 COAs and 2,690 manifests are stored** with signed links.
  `f_package_documents(tag)` serves both. Manifest coverage 99.7%; **COA
  coverage 34% only because the package↔document link is one-to-one on
  many-to-many data** — 480 certificates cover more than one package, one
  covers 24.
- **Licences: MC281714 cultivation, MP281909 manufacturing.** A third number
  (157557) is the owner's Metrc **user ID**, not a licence.
- **Cost basis $1,100/lb is a COST, not a price** — the accountants' 2025
  actual. 2024 was $1,250.
- **The platform is 100% read-only.** Not one order, weight, approval or punch
  can be created in it.
- **HANDOFF.md counts are stale.** Re-measure before relying on any number in
  it.
- **The desktop bridge is BROKEN** — it authenticates with the publishable key
  and lost its grants. **Do not re-grant anon to fix it.**

## WHERE EVERYTHING IS
| | |
|---|---|
| Rules, locked facts | `CLAUDE.md` |
| Everything the platform has learned | `brain/INDEX.md` |
| Every data trap | `brain/DATA_TRAPS_REGISTER.md` |
| When it breaks | `brain/RUNBOOK_RECOVERY.md` |
| The plan and its phases | `brain/PROJECT_PLAN.md` |
| Decisions needing the owner | `brain/CONTRADICTIONS.md` |
| Which rules are actually enforced (4 of 42) | `brain/RULE_LEDGER.md` |
| Lane ownership | `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` |

**A tile without a drill-down is not finished. A number without provenance is
a guess. The theme is locked — neon green, zero purple; if your task seems to
need a theme change, STOP and ask.**
