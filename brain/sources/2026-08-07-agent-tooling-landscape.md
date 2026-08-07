# Ingested 7 Aug 2026 — the agent-tooling landscape (five articles)

*Provenance: five articles shared by the owner on 7 Aug 2026. Every repo claim
below was verified against the GitHub API the same day — none taken on faith.
This digest is why the brain exists and why nothing was installed.*

## What was read, and what survived scrutiny

**1. "Obsidian + Kimi K2.6 = $15k/month research system" (X, @noisyb0y1).**
Income claims and "300 parallel agents" are marketing. What's real: plain
markdown on disk is the best substrate for AI knowledge work, and results
written back into the base make the next run smarter. That loop is now ours —
see [INDEX.md](../INDEX.md).

**2. "Seven fixes for raw Claude Code" listicle.** All seven repos real, star
counts accurate (verified: agentmemory 26.7k, oh-my-claudecode 38.4k, ponytail
98k, caveman 96.6k, agent-skills 83.5k, AgentShield 1k, agentacct 548). The
danger is the ritual it teaches: pasting "install this for me — <repo>" or
"follow the instructions at <raw URL>" gives whatever that URL serves tomorrow
execution rights via the agent. **House rule: never install by pasted prompt;
read the repo, pin versions.** Also: much of what it sells (memory, fresh-eyes
review, plan mode, security review) is native to current Claude Code.

**3. "A graph of loops" (ten repos).** All ten verified real, stars and
licenses accurate — the best-researched of the batch. Genuinely novel pieces:
serena (symbol-level code retrieval, 27.7k), beads (task-graph memory, 26.1k,
Steve Yegge), superpowers (methodology skills, 268k, Jesse Vincent), workshop
(agent evals via trace replay, 960). The orchestration layer it assembles is
already native (Workflow tool, per-agent worktrees). hamelsmu/claude-review-loop
has **no license** — legally unusable. workshop's replay can hit real
databases if pointed at production handlers.

**4. "Claude + Obsidian second brain" (AgriciDaniel/claude-obsidian, 10.5k,
+ kepano/obsidian-skills, 44.3k — kepano is Obsidian's CEO).** Verified real.
Best idea, adopted: one knowledge base with a tiered read path (index → domain
page), referenced from the project's CLAUDE.md. Its MCP-server step is
unnecessary for Claude Code, which reads local files natively. Rejected for
us: `npx -y <package>@latest` with vault access (unpinned auto-updating code),
and git-autocommit inside cloud-synced folders (corruption risk).

**5. "Build AI agents completely free" (LangChain + Groq/Gemini tutorial).**
Accurate beginner content; the stack is real. The line that matters for this
business, from the article itself: **free tiers train on your prompts.**
→ **House rule: no Twisted Growers data — Metrc records, customer, manifest or
money data — ever goes through a free-tier model API.** This is a licensed
cannabis operation; treat every business record as sensitive.

**6. "Connected ecosystem" template repo (shared later, 7 Aug — no name/link
given, unverifiable).** Inventory: CLAUDE.template.md, 12 generic skills, 7
generic agents, rules/, hooks/, settings.json. Verdict: Twisted Growers
already has every layer, bespoke and stronger — CLAUDE.md with locked facts
beats a template; ingest/pulse/recall beat generic playbooks; the hooks
(session-start injecting rules+corrections, SQL guard, theme guard, lane
guard) were verified working in the 7 Aug code map. Nothing to install.

## The decision that resulted
Build our own brain — index, decision log, lessons log, domain pages, sources,
inbox — from plain markdown in this repo. Zero installs, zero new trust
relationships, aligned with the house rules (provenance, single sources of
truth, absence explained). Logged in [DECISIONS.md](../DECISIONS.md), 2026-08-07.
