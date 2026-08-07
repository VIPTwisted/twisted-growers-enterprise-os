# Decision log

Every settled decision, newest first. One entry each: **date — decision — why —
source.** When a decision is reversed, strike it through and add the reversal
above it; never delete. If a figure or rule gets argued twice, it belongs here.

---

**2026-08-07 — RULE C6 EXTENDED in CLAUDE.md, at the owner's direction.**
First amendment to the hard rules made this session, and the only edit Agent D
has made to the rules file. C6 was *"failed material always splits ours versus
third party."* It now carries three sub-rules:

- **C6a** — third-party failed material is an **INPUT**, bought at a discount
  deliberately, then remediated in-house or sold on. Never presented as a
  quality failure. Its metric is **remediation yield**.
- **C6b** — our own failed material needs a recorded **disposition**, and there
  are **three**: remediate · sell for remediation · destroy. *A failed test is
  not a loss; an undecided package is.*
- **C6c** — **revenue splits ours versus resale, everywhere.** Never blend own
  production with bought-in resale into one price per pound, and never measure
  resale against the production cost basis.

*Source: owner, this date. Prompted by two Agent D errors it now prevents —
reporting bought-in failures as supplier performance, and blending resale into
the realised flower price.*

**2026-08-07 — FAILED MATERIAL HAS THREE VALID DISPOSITIONS, not two.**
Owner: *"If something fails it can be remediated, sold for remediation, or
destroyed."*

1. **Remediated in-house** — reprocessed and retested.
2. **Sold for remediation** — sold on to a licensee who remediates it. **This
   is a revenue path, not a write-off.**
3. **Destroyed** — with the disposition recorded in Metrc.

**Consequences for how the platform reports failure:**
- **A failed test is NOT a loss. It is material awaiting a decision.** Any
  tile or finding that presents failed material as lost money is wrong, and
  trains people to ignore findings. Rule A5 already carried the principle:
  *"Failed material bought at a discount to remediate is a business model, not
  a loss."* This is that rule from the sell side.
- **The measure is whether a disposition was RECORDED**, per rule H1 — issues
  never clear themselves. Not whether material failed.
- **⚠ The platform currently names only two of the three.** Every
  `watchdog_findings.what_to_do` on a failure reads *"decide remediate or
  destroy and record the disposition in Metrc"* — **omitting "sell for
  remediation" entirely.** The agent is steering people away from a legitimate
  revenue path. Fix the finding text.
**BOUGHT-IN FAILED MATERIAL IS AN INPUT, NOT A PROBLEM.** Owner, same date:
*"When it is bought as failed it is remediated and processed by us."* So the
two directions are NOT symmetrical:

| | Path | How the platform must treat it |
|---|---|---|
| **Bought failed** | Purchased at a discount → **remediated and processed in-house** | **Expected input.** Working as intended. Must NOT be flagged as a quality problem. |
| **Our own failed** | Remediate · sell for remediation · destroy | **A decision is owed.** Flag until a disposition is recorded (H1). |

**⚠ Agent D got this wrong earlier and it is corrected here.** On finding that
**93.5 of 211.3 lb of bought-in dried flower on hand had failed testing (44%)
from Gibby's Garden and LC Square**, Agent D reported it as *"supplier
performance, visible right now."* **It is not supplier performance — it is
what was deliberately purchased.** Classic rule A5 breach: a business practice
inferred from data instead of asked about.

**Rule C6 exists for precisely this split** — *"failed material always splits
ours versus third party on the face of the tile, with the supplier named."*
The split is built; the **framing** is what is missing.

**The metric that actually matters for this model is REMEDIATION YIELD** — how
much sellable product comes out per pound of failed material bought. `v_remediation_yield`
exists and **takes 25.6 seconds to return a single row**, so the one view that
would tell the owner whether the remediation business is profitable is
functionally unreachable. Fixing its speed is worth more than any new tile.

*Source: owner, this date. Supersedes the loss framing in
[CRITICAL_BOARD.md](CRITICAL_BOARD.md).*

**2026-08-07 — EAGLE EYES IS STORAGE, NOT A CUSTOMER. $901,430 must come out
of revenue.** Owner: *"I assume this is sold though we no longer store
material with them… you will have to correct this in our OS."*

**Evidence (verified 7 Aug, both directions):**
- **26 manifests OUT** to Eagle Eyes Transport Solutions (MT281320),
  **890.5 lb, $1,113,052 booked** across all categories — Aug 2024 to Feb 2025.
- **20 manifests BACK IN** from Eagle Eyes to Twisted Growers, Oct 2024 to
  Feb 2025. **A round trip is storage, not a sale.**
- **The prices prove they are valuations, not sales:** manifest 0002431657
  books **2.1 lb of concentrate/vape/pre-rolls at $142,736**; manifest
  0002432065 books 41.8 lb of Buds at **$2,593/lb** while 0002691820 books
  326.3 lb at **$668/lb** eleven weeks later. No buyer pays those prices on
  the same product.
- Eagle Eyes appears as `TransporterFacilityName` on **zero** transfers — it
  is only ever a destination facility.

**Impact on Buds alone (external, priced ≥$1):**
| | lb | dollars | $/lb |
|---|---|---|---|
| Eagle Eyes (storage) | 869.8 | **$901,430** | $1,036 |
| Real customers | 3,203.9 | $2,743,367 | $856 |

**THE FIX — rule-based, not a hardcoded exclusion (G1):** `licence_type_prefix`
already defines **`MT` = "Marijuana Transporter"**, and `f_operation(licence)`
resolves it. **A destination whose licence type is Transporter is not a
customer sale.** Apply in `v_manifest_ledger` and every revenue view via
`create or replace` — never `drop … cascade` (E1). Blast radius is small:
only **two** MT destinations exist in the whole record — Eagle Eyes (869.8 lb)
and MMM Transport (2.9 lb).

**Open for the owner:** were the Eagle Eyes movements storage only, or were
some genuine sales? And does anything else in the record represent storage
booked as revenue? *Source: owner + verified round-trip evidence, this date.*

**2026-08-07 — COST BASIS RULED: $1,100/lb, working figure until the annual
P&L.** Owner: *"Let's use the 1100 for now and we will adjust later with
actual P&L."*

- **$1,100/lb is a COST, not a sale price** — recorded in `valuation_rates`
  as "Owner-set cost for bulk flower". It is the **accountant-determined
  actual full cost per pound for 2025**.
- **2024 was $1,250/lb.** Cost per pound fell **12% year over year** — a real
  improvement, and the first two points of a cost time series.
- **Practice:** the annual figure is set by the accountants at year end and
  used as the working cost factor in meetings through the following year.
- **`$591.39` is SUPERSEDED.** It fails reconciliation: at $285,000/month it
  implies 5,783 lb/year of saleable output, against the ~3,109 lb implied by
  $1,100 — and measured 2025 dry flower was **2,709 lb** plus other streams.
  **The accountants' figure reconciles with Metrc; the platform's does not.**
  Correct the locked fact; retain $591.39 marked superseded, never delete.
- **Forward warning:** the annual cost per pound is output-dependent. If 2026
  output falls below 2025, **2026 will land ABOVE $1,100, not at it.**

*Source: owner, this date. Supersedes contradiction #13.*

**2026-08-07 — HARVEST TARGETS set by the owner: 380k per month, 180k per
pull.** Explicitly **subject to change by the team**, so per rule G1 it must
live as an owner-editable config row (`kpi_targets` / `conversion_factors`),
never in code.

**UNIT CONFIRMED BY OWNER: POUNDS — these are yields, not money.**
Read as **380 lb per month · 180 lb per room pull.** *(Agent D first
reconciled them as dollars and was wrong — see [LESSONS.md](LESSONS.md), same
date. The dollars fit was coincidence.)*

**The pounds reading closes tightly against the locked facts:**
1,140 plants × **70.6 g target** = 80,484 g = **177.4 lb ≈ 180 lb per pull** ·
26 pulls ÷ 12 months = 2.17 × 180 lb = **385 lb ≈ 380 lb per month.**
The target is therefore the **70.6 g/plant standard expressed in pounds per
pull** — internally consistent, and the actual 82.3 g/plant (≈207 lb/pull)
puts the operation **~15% ahead of it**, matching the locked "17% ahead of
plan".

**Note on "k":** taken as shorthand, not literal thousands. **380,000 lb per
month is physically impossible** — all 95 harvests in 2026 to date total
14,211 plants ≈ 2,578 lb for the entire year.

**Consequence for the code:** `App.jsx` (~6145) hardcodes "the 380 lb monthly
target" — **the number and unit were right.** It remains a G1 violation
because config belongs in a row; it must be **moved to `kpi_targets`, not
corrected.** *Source: owner, this date.*

**2026-08-07 — LICENCES SETTLED by the owner, with screenshot evidence.**
**MC281714 = cultivation. MP281909 = manufacturing** (processing, all vapes,
concentrates). **157557 is the owner's Metrc USER ID, not a licence.** The
locked facts were correct; `docs/09_METRC_API_ACCESS.md` is wrong and must be
corrected before the integrator application is submitted. Contradiction #4
closed. *Source: owner + Metrc facility switcher screenshot, this date.*

**2026-08-07 — RULE ZERO, owner: "Never do anything that can break system."**
Outranks every other operating instruction, including "move fast". Recorded
in [CHARTER.md](CHARTER.md). **Proposed for CLAUDE.md as a numbered rule
pending the owner's wording** — Agent D does not edit the rule file unasked.
*Source: owner, this date.*

**2026-08-07 — THE GOAL: by 2027 the brains are AI, the hands stay human.**
Owner: *"The brains. All physical work by our teams, but the brains will be
AI. That is your goal."* Agent D owns it. Path, gates and mechanism in
[AI_BRAINS_2027.md](AI_BRAINS_2027.md). Standing recommendation attached and
not to be weakened: **AI never writes to Metrc autonomously — the legal
record stays human-signed.** *Source: owner, this date.*

**2026-08-07 — Fleet governance: one roster, one Inspector, one CEO.**
[AGENT_ROSTER.md](AGENT_ROSTER.md) unifies the two agent worlds (18 in
`agent_registry` + the repo lanes) into one org chart. New `inspector` agent
reviews the agents themselves — including Agent D — and builds nothing;
`/muster` calls the fleet. Structural rule taken from `verification_checks`:
**never compare a source to itself**, so the fleet's CEO never grades its own
fleet. *Source: owner's direction ("one who cross-references and reviews, one
CEO who oversees it all"), this date.*

**2026-08-07 — Four-agent "Company OS" pattern assessed; two of four
adopted, one rejected on compliance grounds.** Built `/brief` (owner's
operating picture — decisions first) and `/explain` (plain English for a
non-technical owner, filling the tooling gap behind rule I3 and the empty
`page_help` / `page_explainers` tables). **Researcher** judged redundant
against `auditor` + `/recall`. **Closer** deliberately NOT built: AI-drafted
sales and objection handling to licensed wholesale buyers adds compliance
exposure and replaces nothing slow. *Why:* adopt what fills a verified gap,
refuse what only adds symmetry. *Source: Agent D assessment, owner-shared
article, this date. Detail: [sources/2026-08-07-company-os-four-agents.md](sources/2026-08-07-company-os-four-agents.md).*

**2026-08-07 — Agent D appointed: Brains, Loops & Agents, CEO of the
department.** Lane: the brain, the loops, the skills/agents, and
knowledge-asset recovery. Boundaries per [CHARTER.md](CHARTER.md) — no
App.jsx (B), no report pipeline (A), no grants execution (watchdog).
*Source: owner, this date.*

**2026-08-07 — Database password rotation DEFERRED by owner.** The password
in git history (audit critical #3) will not be rotated unless a security
issue arises after live deployment. Recorded as an explicit ignore-with-
condition per rule H1 — the finding stays visible in the audit; this entry
is the decision against it. *Why:* owner's call, pre-launch. *Source: owner,
this date.*

**2026-08-07 — The full doc set was read line-by-line and absorbed.** Every
design doc, gap register and handoff file digested into
[sources/](sources/); ~40 decisions from 4–7 Aug now on record there (report
imports must be OS-pulled, licence-number-is-identity, import safety trio,
CFO via `is_finance_reader()`, three-report monthly cadence, rolling-average
yield judgment, and more). Nine cross-document contradictions — including
two against locked facts — queued in [CONTRADICTIONS.md](../brain/CONTRADICTIONS.md)
for the owner. *Source: read agents, this date.*

**2026-08-07 — The brain gained hands: ingest, pulse, recall, and two agent
roles.** Skills in `.claude/skills/` (ingest / pulse / recall) and agent
definitions in `.claude/agents/` (librarian / auditor) load automatically in
every session opened in this folder. Feeding rule set the same day: no
business data into third-party or free-tier model APIs, ever. *Why:* owner
wants to feed documents and data and have capability compound across
sessions. *Source: owner, this date.*

**2026-08-07 — The brain exists.** `brain/` is the knowledge index and
accumulation layer: index, decision log, lessons log, domain pages, sources.
It never overrides CLAUDE.md (rules) or HANDOFF.md (state). *Why:* owner asked
for everything organized and for knowledge to compound across sessions.
*Source: owner, this date.*

**2026-08-07 — Freeze lifted; two agents plus a watchdog work in parallel,
in lanes.** *Why:* audit complete, security closed. *Source:
`docs/AGENT_WORK_DIVISION_AND_WATCHDOG.md`, HANDOFF.md correction box.*

**2026-08-07 — Anonymous access closed, permanently tripwired.** 30 exposed
relations and 33 internet-callable writer functions were shut; an automated
check (`supabase/checks/anon_exposure.sql`) exists so silent regression is
impossible. *Why:* the exposure contradicted a handoff claim that it was
already closed. *Source: `docs/AUDIT_2026-08-07_SENIOR_REVIEW.md`.*

**2026-08-06 — CLAUDE.md is the single source of truth for rules; HANDOFF.md
for state.** Where they disagree, CLAUDE.md wins on rules, HANDOFF.md on facts.
*Why:* rules had scattered across files and were being re-argued. *Source:
consolidation at the owner's direction, CLAUDE.md header.*

**2026-08-06 — Every tile must prove itself.** Every tile, total or headline
drills to the individual items behind it via `v_stock_proof`. A tile without a
drill-down must not ship. *Why:* a number without evidence is a claim, not a
fact. *Source: owner, CLAUDE.md "Every tile must prove itself".*

**2026-08-06 — The cultivation facts are locked.** 4 tables/room, 287.5
plants/table, 1,150 operating plants/room, 56-day cycle, 14-day pull cadence,
26 pulls in 2026, 28 days harvest-to-availability. 190 and 210 are wrong and
stay wrong. *Why:* re-derived repeatedly, wrongly; settled from the owner's own
harvest calendar. *Source: CLAUDE.md Locked Facts; the Pull Summary tab.*

**2026-08-06 — Yield is measured per PLANT, never per square foot.** Target
70.6 g/plant; the workbook column saying "grams/sqft" is mislabelled. There is
no measured square footage anywhere; `grow_rooms.sqft` stays null until a tape
measure says otherwise. *Source: CLAUDE.md Locked Facts.*

**2026-08-06 — Money figures are owner-set rows, not workbook echoes.** Bulk
flower $1,100/lb (supersedes $741 and $1,200 in workbooks), trim input $250/lb,
total operating cost $285,000/month WAGES INCLUDED. All editable in the
platform, none hardcoded. *Source: CLAUDE.md Money.*

**2026-08-05 — Dashboard standard set in stone.** Live KPI tiles with targets,
sparklines from real snapshots, forensic drills, assign-from-tile, honest empty
states. A list of links is not a dashboard. *Source: owner, CLAUDE.md hard
rules, reference standard vip-ceo-platform.netlify.app.*

**2026-08-05 — Theme locked: neon green.** No colour change without explicit
approval. *Source: owner, CLAUDE.md I1.*
