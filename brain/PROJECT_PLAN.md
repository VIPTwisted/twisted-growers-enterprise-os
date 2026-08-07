# The project plan — five phases, in order, with exit criteria

**Owner, 7 August 2026: work at a project level.** Today ran as twenty parallel
investigations. That is why it feels unstructured — **we have been doing Phase 3
analysis on a platform whose Phase 0 and Phase 2 do not exist.**

Each phase has an **exit test**. A phase is not "mostly done".

---

## PHASE 0 — Make it safe to change · **NOT STARTED** · blocks everything
*Owner: Agent B + whoever owns grants*

Nothing else should move first. Right now every change goes straight into the
live database of a licensed operation, and nothing can fail a build.

| Item | State |
|---|---|
| A staging environment | **does not exist** |
| Wire the guards already written (`routing.mjs`, `error-boundaries.mjs`, `report_fixtures.py`) | written, invoked by nothing |
| `--max-warnings 0` on lint | missing — lint cannot fail |
| Make `reconcile_tiles.sql` real | **27 lines of comments, no SQL** |
| Attribution — which agent did what | `ddl_guard_log.actor` = "postgres" on every row |

**EXIT TEST:** a change can be made, tested, and traced to an agent **without
touching production first.**

## PHASE 1 — Make it honest · **~80% done** · Agent D
| Item | State |
|---|---|
| The brain, decisions, lessons, contradictions | ✅ |
| [DATA_TRAPS_REGISTER.md](DATA_TRAPS_REGISTER.md) — every way the platform has been lied to | ✅ |
| [RULE_LEDGER.md](RULE_LEDGER.md) — 4 of 42 rules enforced | ✅ catalogued |
| Skills and agents, incl. the Challenger | ✅ |
| Critical Board as a live page | computed, **not built** |
| OS Watchdog + shadow log | specced, **needs schema** |

**EXIT TEST:** no agent repeats a known mistake, and every finding has a named
owner.

## PHASE 2 — Make it writable · **NOT STARTED** · the real unlock
*Owner: Agent B*

**The platform is 100% read-only. Not one order, weight, approval or punch can
be created.** This single fact blocks: work · plan · set goals · budgets ·
forecasts · saved reports · assigning a task · recording a disposition ·
answering an open question in the OS.

| Item | State |
|---|---|
| Create / edit / approve UI | not built |
| Permission model | `permission_catalog`, `app_roles`, `role_permissions` **all empty** |

**The gate ships WITH the first write, never after.**

**EXIT TEST:** a permitted person records a real decision in the OS and it
sticks.

## PHASE 3 — Make it complete · data, mostly typing · Owner + Agent A
| Item | Effort |
|---|---|
| 4 storage limits (`max_lb`) — *"awaiting Vincent"* | 1 minute |
| `bought_as` on 30 suppliers | 30 dropdowns |
| `ownership` field + populate on-hand material | 1 hour |
| `material_purchases` — record purchases forward, do NOT backfill | ongoing |
| The COA link (965 packages, zero API calls) | [WORKORDER_COA_LINK.md](WORKORDER_COA_LINK.md) |
| The 44 open questions | owner |

**EXIT TEST:** every one of the five business lines has a measurable cost and a
measurable revenue.

## PHASE 4 — Make it think · the 2027 goal · Agent D
Shadow log running · decisions scored per class · authority graduated.
**Cannot start before Phase 0** — you cannot let AI decide anything on a
platform where a failed query looks like an empty table.

**EXIT TEST:** one decision class has a scored track record the owner trusts.

---

## Why today felt like college

**We ran Phase 3 analysis — pricing, yield, strains, material classification —
on a platform with no Phase 0 and no Phase 2.** So every finding ends the same
way: *"this needs a decision the platform cannot record, applied by a change
nobody can test."*

**The analysis was not wasted** — it produced the arbitration queue, the traps
register, and the rules. But it will keep feeling unfinished until Phase 0 and
Phase 2 exist.

## The honest sequence
**Phase 0 → Phase 2 → Phase 3 → Phase 4.** Phase 1 runs alongside because it is
mostly done and it is what stops the same mistakes recurring.

**If one thing gets picked up next, it is a staging environment.** Everything
else is faster and safer once it exists.
