---
name: verify
description: Test a single claim by deriving it two independent ways. Use before any figure goes into a meeting, a report, or a contractual conversation — and whenever someone says a number out loud that matters. Disagreement is the finding, never averaged.
---

# Verify — one claim, two derivations

The platform's own philosophy, applied on demand: **never compare a source to
itself.** `verification_checks` is the pattern book — eight checks, each
deriving one fact two ways.

## The method
1. **State the claim and where it came from** — a tile, a document, a meeting,
   a memory. Quote it exactly.
2. **State the basis before measuring.** Wet or dry. Cost or price. Per plant
   or per pound. Plants started or plants harvested. **Most disputed numbers
   are not wrong — they are answers to a different question.** "Over 400 lb"
   was true of wet weight and false of dry, and the contract said dry.
3. **Derive it two independent ways** — different tables or pipelines, never
   the same source twice. Good pairs on this platform: `metrc_harvests` (API)
   vs `metrc_rpt_harvests` (report export) · plan vs actual · package-derived
   vs ledger-derived · `has_table_privilege` vs `information_schema`.
4. **Agree within tolerance?** Verified. Show both queries and both results.
5. **Disagree?** **The disagreement is the finding.** Report both numbers,
   both methods, the gap in absolute and percentage terms, and which is more
   likely stale. **Never average. Never pick silently.**
6. **Show the arithmetic in words**: "5 packages × 75.4 lb × $1,100 = $82,940."

## Watch for a check that cannot fail
A derivation whose second source is computed from the first proves nothing.
Real case: `room-capacity-never-exceeded` compares the largest pull anywhere
to the largest capacity anywhere — and every room's maximum pull exactly
equals its recorded capacity, suggesting the capacity rows were populated from
the pulls. **A check built to enforce "never compare a source to itself" was
doing exactly that.** Ask where the second number came from.

## Before it counts as verified
- Sample size stated. One harvest is not evidence.
- Artifacts controlled (see `/investigate` step 4).
- Units confirmed, not assumed (A4, B1).
- If it cannot be verified, say so plainly and name what access would settle
  it. **"Not computable" is a valid and often important result.**
