# Ingested 7 Aug 2026 — block/buzz, and what it exposed about our own agents

*Provenance: repo shared by the owner 7 Aug 2026; verified against the GitHub
API and README the same day. Real: `block/buzz`, from Block (the company
behind Goose), 24,725 stars, Apache-2.0, Rust, created 6 Mar 2026, pushed
7 Aug 2026. Self-hosted workspace on a Nostr relay where humans and AI agents
are both first-class members — each agent holds its own keypair, channel
membership and audit trail. Its own README: "Not finished. We will tell you
what works and what doesn't."*

## Verdict: do not adopt. Steal one idea.

Not adopted because:
1. **It is a second infrastructure stack** — Rust relay + Postgres + Redis +
   S3/MinIO + Docker — running alongside Supabase. Two backends to operate.
2. **It is unfinished by its own admission**, with major features marked
   "strong opinions, pending code".
3. **It competes with our own roadmap.** `teams`, `channels`, `messages`,
   `spaces` already exist in schema (all 0 rows); the collaboration layer is
   CODE-023 / M4, Agent B's lane.
4. **Cryptographic agent identity solves a problem we do not have.** Nostr
   keypairs give non-repudiation across untrusting parties. We have four
   agents in one repo under one owner.
5. The bottleneck is 179 open go-live items and three owner decisions — not
   how agents talk to each other.

## What it did expose — verified live, 7 Aug 2026

Buzz's premise is "an agent is a member with an identity and an audit trail."
Measured against that bar, **we are most of the way there and then stop at
the last step.**

**What we already have (better than most):** `agent_registry` holds 18 agents
— 6 sync, 10 watchers, 2 maintenance — each with an `agent_key` identity, what
it watches, why it matters, an `evidence_table`, an `expected_every_mins`
heartbeat, and — the part almost nobody builds — a **`verified_by` column
stating how we prove that agent is right.** Proof by evidence, not by
self-report. That is the house philosophy in a schema.

**What is missing: attribution.** Verified by query:
- **`ddl_guard_log.actor` is `"postgres"` for every row.** When a table ships
  without RLS or a function ships callable by anon, the log records the
  database role — not which agent did it. The lane system (Agent A / B /
  watchdog / D) exists on paper and in the hooks; **the database cannot tell
  the lanes apart.**
- **`audit_events.actor` was null across all 200 rows sampled** (of 1,926;
  arbitrary sample, so treat as strong indication, not proof).

**Why it matters concretely:** the 7 Aug audit found `watchdog_findings` went
from 100 rows to 43 in a single day via a migration that breached rule H2
(forensic tables are immutable). **There is no way to know which agent did
it.** Attribution is exactly the control that would have named it.

**The cheap bridge already half-exists.** `tools/hooks/guard-protected-files.mjs`
already reads a `TG_AGENT` environment variable to block out-of-lane writes.
Nothing carries that identity into the database. If agent sessions set
`TG_AGENT` and DDL/audit writes stamped it, `ddl_guard_log` would read
`agent-b` instead of `postgres`, and H2 breaches would be attributable.

**Proposal (not executed — schema change, and the DDL guard belongs to the
watchdog/grants lane):** carry `TG_AGENT` into `ddl_guard_log.actor` and
`audit_events.actor`. Owner's call, watchdog's hands.

## Sibling repo: block/goose — the agent framework itself

Verified 7 Aug 2026: **`block/goose`, 52,511 stars, Apache-2.0, Rust, created
23 Aug 2024, pushed 7 Aug 2026, 306 open issues.** Governed under the
**Agentic AI Foundation at the Linux Foundation** — the most credible
open-source agent framework in the field. Desktop app, CLI and API; 15+ LLM
providers (Anthropic, OpenAI, Google, **Ollama**, Bedrock, Azure); 70+
extensions over MCP.

**Verdict: not adopted, for a specific and verifiable reason.** Goose is a
*replacement* for Claude Code, not an addition — and this project's only
enforcement that has been proven to fire is implemented as Claude Code hooks:
`guard-sql.mjs` (blocks `drop view … cascade` E1, `grant … to anon` E6,
deletes on the seven append-only forensic tables H2), `guard-protected-files.mjs`
(theme lock, agent-lane lock), `session-start.mjs` (injects the rules and the
corrections into every session). Migrating frameworks means rebuilding all of
that or shipping without it. The 7 Aug audit's closing line applies directly:
"What is missing is not intelligence — it is enforcement."

Second reason: Goose's headline feature is provider-swapping, which is
precisely the surface where the house feeding rule ("no business data into
third-party or free-tier model APIs") gets broken by accident.

**The one case where Goose would be the right answer, recorded for later:**
if an agent ever needs to touch Metrc, customer or money data with **zero
data egress**, Goose driving a **local Ollama model** is the architecture
that achieves it. Nothing today requires that. If it ever does, this is the
route — not a cloud provider with a promise.

## Also found while measuring: a registry contradiction
`agent_registry` row `sync:sales` is `enabled: true` with a 1,440-minute
heartbeat, while its own `why_it_matters` text reads "Currently disabled and
has never succeeded — 237 consecutive authorisation failures" — and the
6 Aug decision **permanently disabled Metrc sales endpoints** because neither
licence is retail ("a wholesaler's sales are its manifests"). Queued in
[../CONTRADICTIONS.md](../CONTRADICTIONS.md).

Also worth re-measuring: `watch:custody` describes "63 open flags that no page
currently reads" while `custody_alert_log` holds 31 rows. May count different
things; per house rule, re-measure rather than adopt either figure.
