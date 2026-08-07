---
name: muster
description: Fleet review — every agent in both worlds (the 18 in the database and the AI lanes), whether each is alive, verified, in-lane, and what it found. Use to manage the agent fleet, before delegating significant work, or when the owner asks how the agents are doing.
---

# Muster — call the fleet and check every agent

The roster is `brain/AGENT_ROSTER.md`. Measure, never assume; a registry row
is a claim like any other.

## Roll call

1. **Is each agent alive?** For every `agent_registry` row, compare its
   `expected_every_mins` against the newest row in its `evidence_table`.
   Anything past its heartbeat is late — say by how much. An agent with a
   null `evidence_table` cannot be proven alive; say that rather than
   assuming it ran.
2. **Is each agent honest?** Read `verified_by` on each row and state whether
   that verification has actually been run — not whether it exists. An
   unrun proof method is not a proof.
3. **Is each agent legitimate?** Flag any row enabled for work that cannot
   succeed (see contradiction #10, `sync:sales`), any description whose
   numbers no longer match the evidence table, any agent nothing reads.
4. **What did they find?** Open findings by agent — `watchdog_findings`,
   `agent_findings`, `inventory_alerts`, `custody_alert_log` — criticals
   first, with dollars and the arithmetic.
5. **Are the checkers checked?** Digest `verification_runs` (disagreement is
   the finding) and `canary_runs` (missing / empty / slow / errored). Flag
   unresolved `ddl_guard_log` rows — each one is live security debt.
6. **The AI lanes** — any work done outside its lane, any brain claim now
   contradicted, any skill or agent definition that has drifted from what it
   actually does.

## Report
One table: agent · alive? · verified? · in lane? · what it found. Then the
exceptions in prose, ranked by consequence, in plain English with the
arithmetic spelled out. End with what needs the owner, and what Agent D will
drive without him.

## After
Update `brain/AGENT_ROSTER.md` if the fleet changed; log anything settled to
`DECISIONS.md`, anything learned to `LESSONS.md`, any new disagreement to
`CONTRADICTIONS.md`.

**Delegate the judging to the `inspector` agent when the muster spans more
than one agent's work** — the fleet's CEO does not grade its own fleet.
