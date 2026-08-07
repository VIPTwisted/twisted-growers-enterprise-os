# The Shadow Log — design spec

**Approved by the owner 7 August 2026.** The evidence engine behind
[AI_BRAINS_2027.md](AI_BRAINS_2027.md): the AI commits to a decision *before*
the human makes it, sealed, and both are scored against what actually
happened. This is how AI earns authority per decision class.

**Status: designed, not applied.** Creating the table triggers the DDL guard
(RLS required at creation — see [LESSONS.md](LESSONS.md), 7 Aug) and RLS
policy work belongs to the watchdog/grants lane. Agent D owns the design, the
scoring method and the reviews; the watchdog applies it.

---

## The integrity property that makes it worth anything

**The AI's choice must be provably recorded before the human's choice
exists.** Without that, scoring is a story we tell afterwards. Two mechanisms,
both required:

1. `ai_decided_at` is written in the same transaction as `ai_choice`, and the
   table is **append-only** (same discipline as the seven forensic tables,
   rule H2 — and monitor its row count, because H2 was breached once by a
   migration, not by a delete).
2. `sealed_hash` — SHA-256 of `(decision_class, context, ai_choice)` computed
   at write time. Any later edit to the AI's stated choice fails its own hash.
   The AI cannot quietly improve its answer after seeing the outcome.

`human_choice` and `actual_outcome` are the only fields written later, each
with its own timestamp and its own actor.

## Table shape (proposal)

```
decision_shadow                      -- append-only, RLS on at creation
  id
  decision_class      text           -- 'lab_submission' | 'room_pull' | ...
  subject_ref         text           -- the package tag / room / order it concerns
  context             jsonb          -- the inputs as they stood, verbatim
  ai_choice           text
  ai_reasoning        text           -- plain English, the way findings read
  ai_predicted        jsonb          -- what the AI expects to happen, measurable
  ai_confidence       text           -- high | medium | low, stated not scored
  ai_decided_at       timestamptz    -- sealed
  sealed_hash         text           -- sha256(class, context, choice)
  agent_key           text           -- WHICH agent decided (see attribution gap)
  human_choice        text           -- written later, never back-dated
  human_decided_at    timestamptz
  human_actor         text
  actual_outcome      jsonb          -- written later, from measurement not opinion
  outcome_measured_at timestamptz
  outcome_source      text           -- the query or table that proves it
```

Notes: `agent_key` joins `agent_registry` — this log is one of the reasons
attribution must be fixed. `outcome_source` exists so no score ever rests on
an unprovable outcome (rules A1, A2).

## Scoring

Per **decision class**, never in aggregate — the AI may be excellent at
laboratory queues and poor at allocation, and the owner must be able to see
which. Report as:

> *"Laboratory submission, 47 decisions: AI matched or beat the human 41
> times, was worse 4 times, tied 2. All 4 misses shared one cause: it did not
> know a room was down."*

Three numbers only: **matched or beat · worse · could not be scored.** The
third is honest and mandatory — an outcome nobody measured is not a win.

**The Inspector scores it, never Agent D.** Never compare a source to itself.

## Graduation ladder

| Rung | What the AI may do | Bar to climb |
|---|---|---|
| **Advises** | Recommends; human decides | where every class starts |
| **Acts on approval** | Decides; human approves on the tile | owner-set, per class |
| **Acts within bounds** | Acts up to a ceiling in dollars/pounds/units; above it escalates | owner-set, per class |

Demotion is automatic on a bad run and needs no meeting. **Graduation is a
loan, not a title.** No class ever graduates to writing Metrc — that line does
not move.

## First decision class: laboratory submission order

Chosen because it scores fastest and risks least:
- **High volume of pending decisions** — 358 packages never submitted, 54 out
  with no result.
- **Fast feedback** — average turnaround is about a day, so a shadow entry
  resolves in days, not a growing season.
- **Measurable outcome already recorded** — `lab_turnaround_log` (3,541 rows)
  gives days-out, days-back, pass/fail without new instrumentation.
- **Failure is money, not compliance** — a wrong queue order costs working
  capital; it does not endanger the licence.

Classes to follow, in order: allocation → trim routing → room pull order →
crew scheduling. Crew scheduling last: it decides people's days and deserves
the longest shadow.

## Before the first shadow entry
1. The table applied with RLS at creation and a row-count monitor (watchdog).
2. `agent_key` populated on every write — the attribution fix.
3. One owner ruling: **the graduation bar for laboratory submission.** What
   score, over how many decisions, would make him comfortable letting it act
   on approval? Until that number exists, the class can shadow but can never
   climb.
