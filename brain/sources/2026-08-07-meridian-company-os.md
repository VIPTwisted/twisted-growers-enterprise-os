# Ingested 7 Aug 2026 — codejunkie99/meridian-company-os

*Provenance: repo shared by the owner 7 Aug 2026; verified against the GitHub
API and README the same day. Real: 322 stars, 52 forks, MIT, TypeScript,
**created 20 July 2026, last pushed 22 July 2026** — two days of commits, then
silent. No repository description. 1 open issue.*

## What it is
A running React 19 + Vite + Node application: an operational console for a
company made of human employees and AI agents. Views: command cockpit with
metrics and approvals, chat interface, work kanban, goal-alignment trees, org
chart, agent management, skill marketplace, finance/budget, audit log. Backed
by a **simulation engine and seeded multi-company data** (`src/lib/seed.ts`),
wired to a local **Kimi CLI** (Moonshot) with RFC 8628 device-flow OAuth
proxied to `auth.kimi.com`.

## Verdict: do not adopt. It is a mockup of this platform.

Feature-for-feature, Meridian is Twisted Growers with the data removed:

| Meridian view | What we already run, on real data |
|---|---|
| Command cockpit + approvals | Control Tower, CEO Dashboard, `finding_state`, `reason_policy` |
| Work kanban | `tasks`, `task_dependencies` (+ CODE-023 work layer, M4) |
| Goal trees | Goals & scorecards spec (migration 0012, M4) |
| Org chart | `employees`, `departments`, `roles_catalog`, `teams` |
| Agent dashboard | `agent_registry` — 18 real agents, each with a `verified_by` |
| Skill marketplace | `.claude/skills/` |
| Finance/budget | `cost_inputs`, `valuation_rates`, `overhead_items` |
| Audit log | `audit_events` (1,926 rows) + seven immutable forensic tables |

Three disqualifying reasons, in order:

1. **It ships seeded simulation data — the exact thing our Four Laws ban.**
   Law #3: "No fake data — real connected records or an honest empty state.
   Never samples." Doc 07 #30: "**Seed-data ban in production, enforced at CI
   level.**" A simulation-seeded company OS is definitionally forbidden here.
   (No criticism of Meridian: a demo is honest about being a demo. The
   incompatibility is ours.)
2. **It routes the company console through a third-party model provider**
   (Kimi CLI, OAuth tokens to `auth.kimi.com`). Against the standing feeding
   rule: no Metrc, customer, manifest or money data through third-party or
   free-tier model APIs.
3. **Maintenance shape.** Two days of commits in July, nothing since; 322
   stars and 52 forks against 1 open issue and no description — launch-and-
   abandon. Adopting it means owning it alone.

## The idea worth keeping
Its framing is sharp and correct, and worth quoting as a checklist:

> "Agent orchestration is not enough to run a company. A company OS needs to
> know who owns what, which goals matter, what work is blocked, how fast
> tokens and dollars are burning, what approvals are pending, and what
> happened after the operator closed the tab."

**"What happened after the operator closed the tab" is the brain's entire
job.** Measured against the rest of that checklist we hold every item except
one:

**Verified gap — AI spend is untracked.** `ai_usage_log`, `ai_settings` and
`ai_user_access` are all **0 rows**, and the canary records the **AI Spend
page (`v_ai_spend`) as EMPTY** on every run. The platform cannot answer "how
fast are tokens and dollars burning" — the one question on Meridian's list we
have no evidence for. Raised to the owner 7 Aug 2026; not built (it needs the
owner's call on what counts as AI spend and who may see it).
