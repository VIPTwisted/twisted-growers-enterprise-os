# Ingested 7 Aug 2026 — "Build Your Company OS First" (four-agent pattern)

*Provenance: article shared by the owner, 7 Aug 2026. Proposes one Claude
Project holding company context ("Company OS") plus four function agents:
Researcher, Writer, Closer, Operator. Assessed by Agent D against what this
project already has, verified live.*

## The core claim, and why it's already true here
"Context is loaded before you type a word; your job is to build better
Projects, not better prompts." Correct — and this project passed that bar
before the article arrived. `CLAUDE.md` (rules + locked facts, auto-loaded),
`HANDOFF.md` (state), `brain/INDEX.md` (knowledge map), and the session-start
hook that injects rules *and* corrections into every session are a stronger
Company OS than any template: they were earned, not filled in.

One structural advantage the article can't offer: claude.ai Projects hold
context in a cloud text box. Ours is **version-controlled markdown in the
repo**, so context travels with the code, survives tool changes, and any
agent in any tool inherits it. No business data leaves the machine.

## The four roles, judged against verified gaps

| Role | Verdict | Why |
|---|---|---|
| **Researcher** | *Mostly redundant* | `auditor` (two-way derivation) + `/recall` already answer internal questions with citations. **One real gap it names:** `industry_benchmarks` is EMPTY while the dashboard rule forbids any benchmark without a real source — so every comparison tile is unbuildable today. A sourced-benchmark task is worth running; see recommendation below. |
| **Writer** | *Real gap → built* | Rule I3 ("plain English beside the professional language — Vinny is not an engineer") has no tooling behind it, and `page_help` + `page_explainers` are both **0 rows**. Built as `/explain`. |
| **Closer** | *Rejected* | Wholesale cannabis under state licence. AI-drafted sales and objection handling to licensed buyers adds compliance exposure and replaces nothing that is slow today. Not built, deliberately. |
| **Operator** | *Partly exists, gap filled* | The platform already runs ops itself (tasks, alerts, findings, watchdog). What was missing is the human-facing weekly operating picture — what needs the owner's decision, what moved, what's overdue, in dollars. Built as `/brief`. `harvest_sop_steps` is also **0 rows**; SOP authoring is a live opportunity. |

## The one technique worth stealing verbatim
**"The agent calibrates from examples, not descriptions."** The article is
right that a voice sample beats a voice adjective. Applied here: the audit
called this platform's honest empty states "consistently excellent" — those
are the house voice, and `/explain` is calibrated on that standard plus the
owner-facing rules (I3, A3, F4: no abbreviations), not on generic tone words.

## Recommendation raised, not executed
Populating `industry_benchmarks` with sourced figures (with citation and
retrieval date per row) would unlock every comparison tile the dashboard
standard currently blocks. It needs the owner's go-ahead because it is
user-facing config on a compliance platform, and each row must survive rule
A2. Flagged, not done.
