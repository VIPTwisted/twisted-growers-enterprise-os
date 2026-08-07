# The Agent Roster — one org chart for every agent

**Built 7 August 2026 by Agent D at the owner's direction: one place to manage
every agent, one role responsible for cross-referencing and review, one CEO
over all of it.**

## Two populations, two lifecycles — do not confuse them

*Corrected 7 Aug 2026 on the owner's instruction: "these are for building only
the OS platform, not within it."*

| | **BUILD layer** | **RUN layer** |
|---|---|---|
| Who | Agents A, B, C, D (Claude Code) + D's sub-agents | The 18 in `agent_registry` |
| Where | The repo and the IDE | Inside the product, on 25 cron jobs |
| Lifespan | **Temporary** — they finish, or move to maintenance | **Permanent** — they run for the company, forever |
| Job | **Construct the platform** | **Operate the business** |
| Answers to | The owner, through lanes | The platform, and the owner through findings |

**The construction crew is not the operating brain.** A, B, C and D build the
factory; they do not run it.

**Why this matters more than it sounds:** the 2027 goal — *the brains become
AI* — lives **entirely in the RUN layer.** Nothing A/B/C/D do is the brain;
what they do is *build the brain.* Every hour spent in the build layer should
be judged by one question: **did it advance the run-time thinking layer?**

That is the standard this department now applies to its own work.

---

Until now the two layers had **no shared roster and no shared review**. This
page is the roster.

---

## The chain of command

```
              OWNER (Vincent)
              decides. nothing else decides.
                     │
              AGENT D — CEO of the fleet
              owns the roster, the lanes, the loops.
              builds nothing it also reviews.
                     │
         ┌───────────┴───────────┐
         │                       │
   THE INSPECTOR            THE WORKING AGENTS
   reviews everything,      A · B · watchdog · librarian ·
   including Agent D.       auditor · + the 18 in the database
   builds nothing, ever.
```

**The one structural rule, taken from `verification_checks`: never compare a
source to itself.** The CEO does not review its own fleet; the Inspector does,
and the Inspector reports to the owner as well as to the CEO. An agent that
grades its own homework ships its own faults — that is why the Watchdog
already exists, and the Inspector is the same idea applied to the whole fleet.

---

## Layer 1 · The AI agents (repo lanes)

**Corrected 7 Aug 2026 from the owner's own screenshot of his running agents.
The four live lanes are A, B, C and D** — not the A/B/Watchdog split written
in `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md`.

| Agent | Owner's name for it | Lane | Verified by |
|---|---|---|---|
| **Agent A** | Metrc & Document Importer | Metrc report import and document ingestion | Row counts against Metrc's own exports; `import_reconciliation` |
| **Agent B** | Twisted Growers enterprise planner | The platform build — `App.jsx`, `budz.jsx`, views, schema | CI gates; canary; Agent C's review |
| **Agent C** | **Code Review BOSS** | Reviews code before it ships. The quality gate on B's output. | The Inspector; CI; the audit |
| **Agent D** | Brains Loop & Agents | Brains, loops, agents, knowledge recovery. **CEO of the fleet.** | The Inspector. Never itself. |

> **⚠ OPEN — needs the owner (rule A5, never assume):** the work-division
> document assigns a **Watchdog** the jobs of oversight, 14 standing checks,
> and ownership of **grants and RLS**. Agent C is "Code Review BOSS", which is
> narrower. So: **is Agent C the Watchdog under a new name, or is the Watchdog
> a separate thing — and if separate, who owns grants and RLS today?**
> This is not academic: every security finding raised today (the anon TRUNCATE
> grants, the two PUBLIC-executable functions, the missing TRUNCATE triggers)
> is currently addressed to a lane that may have no occupant.

### Boundary between Agent C and the Inspector — so they are not redundant
- **Agent C reviews the code** — the diff, before it ships. Altitude: a change.
- **The Inspector reviews the agents** — including C and D: are they alive, in
  lane, and do their outputs agree with each other? Altitude: the fleet.

Neither reviews its own work; that is the whole design.
| **Librarian** *(D)* | Ingestion, brain maintenance, contradiction hunting | The Inspector; provenance on every claim |
| **Auditor** *(D)* | Read-only forensics on **figures** — two-way derivation | Its own method is the check: two sources or it does not report |
| **Inspector** *(D)* | Review and cross-reference of **agents**. Builds nothing. | Reports to owner directly; its findings are re-derivable by anyone |

Binding lane rules live in `docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md` — 13
non-negotiables where breaking one is a stop-work event, plus the collision
map for shared surfaces.

## Layer 2 · The 18 database agents (`agent_registry`)

Every row carries `agent_key`, `what_it_watches`, `why_it_matters`,
`evidence_table`, `verified_by` and `expected_every_mins`. Owner: Vincent.

**Sync (6)** — `sync:transfers` 60 min · `sync:packages` 180 · `sync:cultivation`
480 · `sync:deliveries` 480 · `sync:reference` 1440 · `sync:sales` 1440
*(contradiction #10 — enabled for a permanently disabled endpoint)*

**Watchers (10)** — `watch:watchdog` 720 · `watch:allocation` · `watch:cash` ·
`watch:compliance` · `watch:room` · `watch:schedule` · `watch:loss` ·
`watch:sales` · `watch:custody` · `watch:inventory` — all 1440

**Maintenance (2)** — `maint:dashboards` 10 min · `maint:canary` 20 min

## Layer 3 · The machinery that watches the watchers
`verification_checks` (8, two-way) · `canary_runs` (236 pages / 20 min) ·
`platform_state` (nightly self-check) · `ddl_guard_log` (schema violations) ·
`watchdog_findings` (narrative findings with arithmetic and accountability) ·
`alert_outbox` (append-only nagging until resolved)

---

## Registry cleanup — done and outstanding (7 Aug 2026)

**✅ DONE — `sync:sales` retired.** Was `enabled = true` with a daily heartbeat
for endpoints that return 401 on both licences because neither is retail. The
6 Aug decision to disable it was recorded and never applied to the row. Now
`enabled = false` with the full reason on the record. **Fleet: 17 enabled, 1
deliberately disabled.** Contradiction #10 closed.

**⚠ HANDED TO AGENT B — the false "NEVER RAN" has a one-line cause.**
`v_agent_health` maps sync endpoints to agent keys with a CASE expression
covering `transfers%`, `packages%`, `harvests%`/`plants%`/`plantbatches%`,
`items`/`strains`/`locations`, and `sales%` — **with no branch for
deliveries.** The endpoint written is `reference sync (deliveries)`, matches
nothing, falls to `ELSE NULL`, and the agent reads as never having run. It ran
successfully at 14:00 on 7 Aug. **Fix: add a deliveries branch, using
`create or replace` (E1).** Agent D did not attempt it — the full view
definition was not in hand, and guessing at a view definition is precisely
what Rule Zero forbids.

**✓ NOT A DEFECT — `maint:dashboards`.** Its `evidence_table` is null because
its `verified_by` is *"matview age against now()"* — it is proven by freshness,
not by rows. The health view cannot express that, so it reports UNPROVABLE.
The agent is fine; the view's vocabulary is too narrow.

**⚠ DESIGN QUESTION — two agents write findings with no roster entry.**
`agent_findings` carries **"QA & Independent Verification"** (5) and
**"Metrc & Compliance"** (2), neither in `agent_registry`. Both appeared on
7 Aug during build-agent activity. **Most likely explanation: these are
BUILD-layer agents (A/B/C/D) writing findings into a RUN-layer table.** If so
the table mixes two populations with different lifecycles — see the two-layer
split above. Needs a decision: register build agents separately, or add a
layer column. **Not guessed at.**

**⚠ NAME MISMATCH — band-aid available, real fix is structural.** Registry
says *"Sales, Orders and Fulfilment"*; findings say *"Sales, Orders &
Fulfillment"*. Patching the registry text would fix today's join and leave the
cause. **The real fix is joining on `agent_key`, never on display names.**

## The three gaps this roster exposes

1. **Nobody reads the verification results.** 8 checks are defined and **55
   verification runs are recorded — and no one has ever digested them.** The
   mechanism for "disagreement is the finding" runs, and the findings go
   unread. **This is the Inspector's first job.**
2. **The database cannot tell the agents apart.** `ddl_guard_log.actor` reads
   `"postgres"` on every row; `audit_events.actor` was null across 200 sampled
   rows. The lanes exist on paper and in the hooks, not in the record. Fix
   proposed: carry `TG_AGENT` into both.
3. **`agent_departments` is empty (0 rows)** — the table designed to hold
   exactly this org chart. This page is its markdown half; populating the
   table is the owner's call.

## Standing cadence
- **Every 20 min** — canary. **Twice daily** — watchdog. **Nightly** —
  platform self-check. **Weekly (Mon 06:00)** — forensic audit.
- **Inspector review** — on demand via `/muster`, and before any report to
  the owner that spans more than one agent's work.
- **Fleet re-grade** — Agent D updates this roster whenever an agent is added,
  retired, or changes lane. A roster that lists dead agents stops being
  evidence (see contradiction #10).
