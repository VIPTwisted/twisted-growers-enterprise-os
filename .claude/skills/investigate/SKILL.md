---
name: investigate
description: Run a deep forensic investigation across the live data — the multi-step pattern that finds what nobody knew. Use when a question cannot be answered by a single query: "did any pull ever exceed 400 lb", "which strains actually earn", "is this claim consistent with the record". Distinct from /recall, which answers from what is already known.
---

# Investigate — find what nobody knew

This is the deepest capability in the department. It is how the record showed
that storage was booked as revenue, that a "yield improvement" was a packaging
change, and that rooms were full when every report said otherwise.

## 1 · Frame it so it can be proved WRONG
A question that cannot fail is not an investigation. Convert vague to
falsifiable: not *"is yield bad"* but *"has any room pull ever exceeded 400 lb
of dry flower, and on which basis."* Write the frame down before querying.

## 2 · Establish what is actually joinable BEFORE computing
Inspect columns and sample rows first. Report which joins are possible and
which are not. **More investigations die on a bad join than a bad idea.**
Real examples: `HarvestType` reads `WholePlant` on all 380 rows and is
useless; 55% of transfer lines carry no strain at all.

## 3 · Derive it two independent ways — always
The house rule: **never compare a source to itself.** API vs report export,
plan vs actual, catalogue vs privilege check, wet basis vs dry basis. If they
agree, the finding is solid. **If they disagree, the disagreement IS the
finding** — report both numbers and both methods, never average, never pick
silently.

## 4 · Control for the known artifacts — every one has bitten before
- **The flat 6,822 g packaged default** — 41 harvests, a one-package default,
  not a measurement. Exclude.
- **$0.01 placeholder prices** — ~319 lines, and in `metrc_rpt_wholesale`
  they aggregate to $0.02/$0.03, so `> 0.01` does not catch them. Use `>= 1.00`.
- **Repeated manifest-level weights** stamped onto every package line.
- **Repackaged material** carries the original harvest name — counting it
  double-counts production by up to 142%.
- **Unfinished packaging** — a pull takes ~8 months to package out; ~46% lands
  in 30 days. Comparing a young pull to a mature one manufactures a decline.
- **Internal transfers and transporter destinations are not sales.**
- **Wet and dry never mix** (B3/B4). Fresh frozen is packaged wet.
- **Countable items have no weight** (B2).
- **Catalogue estimates are not counts** — `reltuples` reads 0 on small or
  recently-written tables. Always `select count(*)`.

## 5 · Decompose before concluding
An aggregate hides the mechanism. February's shortfall was not drift — it was
one absent room pull. The dry-yield step change was not growth — packaged
share went 15.1% to 19.9% and reproduced it entirely. **Break the number down
by room, month, strain, customer until the pattern names its own cause.**

## 6 · Report
- The direct answer first, in one paragraph.
- Arithmetic in plain English, the way `watchdog_findings.the_arithmetic` does.
- **Sample size on every comparison.** One harvest is never evidence.
- **Measured vs derived, marked.** Derived figures carry their assumptions.
- **Exculpatory findings as prominently as adverse ones** — a report that only
  points one way is advocacy and will not survive challenge.
- **"What I could not measure and why"** — mandatory, never dropped (A3).

## Delegation
Large investigations run as sub-agents with the `auditor` role — read-only,
SELECT only. Never write, never fix. **A finding handed back is worth more
than a fix made by the investigator**, because a fix by the reviewer destroys
the review.
