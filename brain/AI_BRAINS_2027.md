# The 2027 Goal — the hands stay human, the brains become AI

**Set by the owner, 7 August 2026:** *"The brains. All physical work by our
teams, but the brains will be AI. That is your goal."*

Agent D owns this. Everything in this file is derived from what was measured
on 7 Aug 2026 — not aspiration.

---

## What the goal actually means

**Humans keep:** cutting, trimming, drying, packaging, driving, selling,
inspecting, and every judgment that requires standing in the room.

**AI takes:** which room to pull and when · what goes to the laboratory and in
what order · what gets allocated to which customer · what to make from the
trim we have · who works where tomorrow · what is about to go wrong and what
it will cost · what the numbers actually mean.

Not "AI runs the company." **AI is the thinking layer; the team is the doing
layer; the owner sets direction and holds the licence.** That distinction is
what makes it defensible to a regulator, and it is why this goal is reachable.

---

## The six things that must become true first (all measured 7 Aug 2026)

| # | Gate | Where it stands today |
|---|---|---|
| 1 | **The platform must be able to write** | **It cannot.** Not one operational record — an order, a weight, an approval, a punch — can be created in the OS. A brain with no hands in its own system cannot run anything. This is the single blocking gate. |
| 2 | **Rules must be machinery, not memory** | **4 of 42 enforced.** If AI is the brain, the guardrails cannot be "someone remembers." See [RULE_LEDGER.md](RULE_LEDGER.md). |
| 3 | **Every decision must have a target** | **36 of 43 tiles carry no target.** An AI cannot choose without a definition of good. Targets are how you tell it what you want. |
| 4 | **Business intent must be recorded, not inferred** | **44 open questions unanswered.** Rule A5 forbids assuming. Every answered question is a decision the AI can then make alone. |
| 5 | **Every action must be attributable** | `ddl_guard_log.actor` is `"postgres"` on every row; `audit_events.actor` null in sampling. You cannot delegate authority to something you cannot identify afterwards. |
| 6 | **Decisions must have measured outcomes** | `issue_decisions` holds 3 rows and **no outcome field.** Authority is earned with a track record; there is no track record. |

---

## The mechanism: Shadow → Score → Graduate

**Nothing is ever switched on.** Authority is earned per decision class, and
every step is reversible.

**1 · Shadow.** For each decision class — room pull order, lab submission
queue, allocation, trim routing, crew scheduling — the AI records what it
*would* decide, with its reasoning and predicted outcome, **before** the
human decides, and sealed until after. Costs nothing, risks nothing, and
starts producing evidence immediately.

**2 · Score.** Compare shadow against actual over N cycles. The output is a
real sentence: *"On laboratory scheduling the AI matched or beat the human
41 of 47 times; all 6 misses shared one cause."* Per decision class, not
in general — the AI may be excellent at lab queues and poor at allocation,
and you should know which.

**3 · Graduate.** A class moves up only on its score:
- **Advises** → AI recommends, human decides (where most classes start)
- **Acts on approval** → AI decides, human approves on the tile
- **Acts within bounds** → AI acts up to a ceiling (dollars, pounds, units);
  anything above escalates. Human audits after.
- **Demote instantly** on a bad run. Graduation is a loan, not a title.

This is how a new manager earns authority, written down. It also produces
exactly what a regulator or an insurer would ask for: *why did you do that?*
Answer: a scored, dated, per-item record.

**The machinery already exists to build this.** `issue_decisions`,
`reason_code_catalog`, `reason_policy` (which already carries "requires a
second approver" per action), `verification_checks` (two-way derivation),
`agent_registry.verified_by`, and the immutable forensic tables. What is
missing is the **outcome** column and the shadow log.

---

## Standing Orders — how the owner delegates in plain English

The owner writes intent in his own words; each becomes a bounded, checkable
order the AI executes within:

> *"Never let a package sit untested past 30 days. Submit it. If it is worth
> more than $5,000, tell me first."*

Scope, bound, escalation. That is delegation to an AI on the same terms you
would delegate to a person — and it fits `reason_policy`'s existing
per-action enforcement toggles. **The owner should never write a rule in
code. He writes the order; the platform compiles it.**

---

## The hard line — recommended, and it should never move

**AI never writes to Metrc autonomously. Ever.**

Rule D1 makes the platform a read-only mirror, and today that is enforced by
architecture — no write credentials exist. When the day comes that something
must write to the state record, the AI prepares the entry and **a named human
commits it.** The legal record stays human-signed.

This is not timidity. It is the boundary that keeps everything else
defensible: an AI can plan the whole operation and still never be the thing
that told the Commonwealth something untrue.

---

## Sequence — what unlocks what

1. **Make the platform writable** (Agent B, gate 1). Nothing else matters
   until a decision can be recorded. Start with the narrowest useful write:
   assign-from-tile with a reason code.
2. **Answer the 44 open questions** (owner). Each one converts a guess into a
   rule the AI can apply. Highest value per minute of the owner's time in the
   entire business.
3. **Set targets on the 36 bare tiles** (owner + Agent B). Definitions of good.
4. **Turn on attribution and the shadow log** (watchdog + Agent D). Cheap,
   invisible, and it starts the evidence clock — every day without it is a
   day of track record not being earned.
5. **Make the rules machinery** (Rule Ledger order: fix the fake C2 check,
   wire the guards that already exist, monitor the forensic row counts).
6. **Score and graduate**, class by class, with the Inspector — never the
   fleet's own CEO — doing the scoring.

## What Agent D drives, and what only the owner can give

**Driven by this department:** the shadow log design, the scoring method, the
roster and lanes, the Inspector's reviews, the rule ledger, the brain.

**Only from the owner:** the 44 answers, the targets, the graduation bar for
each decision class, and the four rulings still open in
[CONTRADICTIONS.md](CONTRADICTIONS.md).

*A company whose brains are AI is built the same way you would trust a new
hire with the keys: give it small decisions, measure it honestly, promote what
earns promotion, and never let it sign the legal documents.*
