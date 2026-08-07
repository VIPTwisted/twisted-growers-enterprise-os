---
name: recall
description: Answer "what do we know about X" from the Twisted Growers brain with citations — searching the brain files, the docs, the locked facts, and the live database's own table comments, in that order. Use whenever the owner asks a knowledge question rather than requesting a change.
---

# Recall — ask the brain

Answer from what the organization actually knows, with the source named for
every claim. Never pad with general knowledge; if the brain doesn't know,
say exactly that and where the answer would come from.

## Search order (stop when confidently answered)
1. `brain/hot.md` — if the question is about current state and the pulse is
   fresh (< 1 day). If stale, run the pulse skill first or say it is stale.
2. CLAUDE.md locked facts — for anything settled (never re-derive these).
3. `brain/DECISIONS.md` and `brain/LESSONS.md` — for "why is it like this"
   and "have we tried this before".
4. The relevant `brain/domains/` page → follow its pointers into `docs/`.
5. `brain/sources/` digests — for anything ingested from outside reading.
6. The live database: table/column comments carry institutional knowledge
   (e.g. `lab_result_values`, `platform_state`, `verification_checks` each
   explain themselves). Query row counts/values directly when the question
   is quantitative — never quote a document for a number a query can give.

## Answer format
- The answer first, in plain English.
- Then the evidence: each fact with its source (file, or table+query).
- Gaps stated honestly: "not recorded, and here is what would make it
  exist" — never a guess dressed as an answer (rules A1–A3).
- If two sources disagree, present both and flag the contradiction — the
  owner arbitrates.
