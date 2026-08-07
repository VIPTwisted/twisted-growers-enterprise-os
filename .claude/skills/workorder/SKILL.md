---
name: workorder
description: Turn a finding into a paste-ready brief for another agent — Agent A, Agent B, Agent C or the watchdog. Use whenever a finding lands outside this department's lane. Produces a self-contained prompt the recipient can act on without this conversation.
---

# Work order — hand a finding to the lane that owns it

Agent D finds and designs; it does not fix across lanes. A finding without an
owner is a finding that dies. This turns one into work.

## Route it correctly first
| Lane | Owns |
|---|---|
| **Agent A** — Metrc & Document Importer | Metrc sync, report import, document ingestion |
| **Agent B** — enterprise planner | `App.jsx`, `budz.jsx`, views, schema, nav |
| **Agent C** — Code Review BOSS | Reviews B's output before it ships |
| **Watchdog / grants owner** | Grants, RLS, security, DDL guard |
| **Owner** | Business decisions, locked facts, anything only he can rule |

If the lane is unclear, **say so in the work order** rather than guessing.

## Every work order must contain
1. **Who the recipient is, and Rule Zero** — never do anything that can break
   system. Read-only first, verify after every step, stop and report rather
   than improvise.
2. **What NOT to touch** — other lanes, and anything another agent is
   currently working on.
3. **The problem in one paragraph**, with its business consequence.
4. **The verified evidence, with numbers** — enough that the recipient can
   check its own work without re-deriving from scratch. Include table names,
   approximate line numbers, and the arithmetic.
5. **Tasks, ranked by value**, each with a concrete DO and a concrete VERIFY.
6. **The house rules that apply to this task specifically** — e.g. `create or
   replace`, never `drop … cascade` (E1); anchor edits on the function
   signature, never a common line (F1); never `grant … to anon` (E6).
7. **What must NOT be decided by the recipient** — anything needing the owner
   (A5). Say plainly: report it, do not infer it.
8. **The report-back contract**: what changed, what was verified and how, what
   was not touched and why, anything belonging to another lane.

## Format
A single fenced block the owner can copy whole. **Self-contained** — the
recipient starts with no memory of this conversation. Line numbers drift, so
say so and tell them to re-grep.

## After sending
Log it in `brain/` as `WORKORDER_<LANE>_<TOPIC>.md` so the finding survives the
session, and note in [DECISIONS.md](../../../brain/DECISIONS.md) that it was
raised, to whom, and on what date. **A work order nobody can find later was
never really raised.**
