# Decision log

Every settled decision, newest first. One entry each: **date — decision — why —
source.** When a decision is reversed, strike it through and add the reversal
above it; never delete. If a figure or rule gets argued twice, it belongs here.

---

**2026-08-09 — ALLOCATION IS AN APPROVAL WORKFLOW, AND IT IS HOW WE STOP THE BLEED.**
Owner, this date: *"Vincent currently allocates all weight; our chief cultivator
must submit approval for what and where they want to allocate, or Vincent can do
it for them. But forensically auditing allocation of all harvests, tracking
finished weights, is a critical function for us to stop the bleed."*

**The rule.**
- **Vincent allocates all weight.** That is the standing position, not a bottleneck
  to design around.
- **The Chief Cultivator SUBMITS A REQUEST** — what material, how much, and
  **where it is going** — and Vincent approves, part-approves or refuses.
- **Vincent may raise and approve a request on their behalf.** The record must
  still show it was raised for the Chief Cultivator, so the audit trail never
  loses who wanted the material.
- **Every harvest's allocation is forensically auditable**, and finished weight is
  tracked against it. This is stated as the mechanism for finding where weight is
  being lost.

**THE TABLE ALREADY IMPLEMENTS THIS EXACTLY. It has never been used.**
`allocation_requests` carries the whole workflow and holds **0 rows**:

| Stage | Columns that already exist |
|---|---|
| Who asked | `requested_by`, `requester_name`, `requester_department` |
| What | `material_name`, `strain`, `quantity`, `uom`, `pounds`, `stream`, `source_kind`, `source_ref` |
| Where and why | `destination`, `purpose`, `needed_by`, `priority` |
| The decision | `decided_by`, `decider_name`, `decided_at`, `decision_reason`, **`approved_quantity`** |
| The close | `status`, `fulfilled_at`, `fulfilled_note` |

`approved_quantity` being separate from `quantity` is the important one: Vincent can
approve **less** than was asked for, and the gap between requested and approved is
itself a measurable signal. `v_allocation_queue` and `v_awaiting_allocation` are
built on it and both return nothing, because nothing has ever been requested.

**Measured 9 Aug 2026: 0 of 380 harvests carry an allocation.** So today there is
no record anywhere of where any harvested weight was sent, or who decided it. That
is precisely the blind spot the owner is describing.

**What this makes the priority.** Not a new build — the first request. The workflow,
the queue views and the audit columns exist; what is missing is the surface that
lets the Chief Cultivator raise a request and Vincent decide it. Until one request
exists, every allocation figure on every page is zero, and zero reads like "nothing
to see" rather than "never recorded" (rule A3).

**2026-08-08 — MOISTURE LOSS IS MEASURED NIGHTLY, NEVER A HARDCODED BAND.**
Owner, asked whether the band should be a fixed number: *"it should always be
accurate not a hardwired number i believe… i could add goal if suggested."*

**Ruled: two figures, not one.**
- **Actual** — computed from Metrc's own Moisture Loss column, recomputed nightly,
  across **only the harvests that actually dried.** Never typed by a human.
- **Goal** — an owner-set target row on Settings → Business Rules, changeable
  without a deploy (rule G1).
- **Both shown together on the tile**, flagging when actual drifts from goal.

**This dissolves contradiction #1 rather than settling it.** CLAUDE.md's 75–80%
(published guidance) and the live 70–77% (owner-set 6 Aug on a measured 73.5%)
stop competing as facts: one becomes *what we measured*, the other *what we aim
for*. **The known trap stays guarded** — the 77 fresh-frozen harvests never dried
and must be excluded, or the figure collapses to the false 62.5% (see
[DATA_TRAPS_REGISTER.md](DATA_TRAPS_REGISTER.md)).

**2026-08-08 — COST PER POUND IS $1,100, PROVISIONAL, AWAITING QUICKBOOKS.**
Owner: *"for now we use 1100 until i upload actual P&L from QB should be noted
that it is waiting for these reports to be uploaded."*

**Every figure derived from it must say so on its face** (rule A2 — provenance;
rule A3 — absence explained). Not "$1,100/lb" but "$1,100/lb — provisional,
pending the QuickBooks profit-and-loss upload." **Settles contradiction #13**
($591.39 locked vs $1,100 accountant-verified): $1,100 is the working figure, and
$591.39 — derived as $285,000 × 6 ÷ 2,891.5 lb — is superseded until real
accounts arrive.

**2026-08-08 — PHANTOM WEIGHT MUST BE TRACEABLE IN METRC. IF IT IS NOT, THAT IS
URGENT.** Owner: *"Cant be phantom weight its all documented in Metrc seed to
sale if not that is urgent to find it in Metrc may need additional reports."*

So the 6,796 lb is **not** accepted as evaporation-not-recorded. It is either
findable in the seed-to-sale record or it is a genuine gap in our copy of that
record, and the second is a compliance matter, not a reporting one. **The next
step is a Metrc report we do not yet import**, not a calculation. Supersedes the
framing in HANDOFF §3 that treats it as settled moisture loss.

**2026-08-08 — OWNER'S EXPECTED YIELD: 380 lb DRIED FLOWER PER PULL.**
Recorded as **the owner's stated target**, and deliberately **NOT** added to the
locked facts, because it cannot be verified today and the arithmetic disagrees
with what is on file.

**Measured 8 Aug 2026, and why it could not be confirmed:**
- 380 lb across ~1,140 plants implies **151 g per plant.** The locked target is
  **70.6 g/plant** and the previously measured actual **82.3 g/plant**.
- Dried material on file runs **46–113 g/plant** (Cure Vault, Fulfillment Vault,
  Pre Trim Storage). Nothing genuinely dried reaches 151.
- **Freezer/Biomass Storage shows 277–417 g/plant — that is FRESH FROZEN,
  packaged WET.** Rule B3: wet and dry are never mixed. Averaging across storage
  locations is meaningless, and is the shape of the error that once produced a
  finding wrong by a factor of six.

**⛔ THE BLOCKER, and it is the same blocker as phantom weight:**
1. **`mv_harvest_yields.planned_pull` is NULL on every packaged harvest.** Nothing
   links a harvest to any of the 26 planned pulls, so the platform cannot answer
   *"what did pull 9 actually yield?"* at all.
2. **A Metrc harvest averages 132 plants, not 1,140.** One pull is 8–10 harvest
   records and nothing groups them.
3. **`mv_harvest_yields.room` is a STORAGE room** — Cure Vault, Fulfillment
   Vault, Freezer/Biomass — **not Flower Room 1–4.** Any grouping by it mixes
   pulls and mixes wet with dry.

**Until harvests are linked to pulls, 380 lb is unfalsifiable — and rule C0b
says a claim that cannot fail proves nothing.** No agent may treat it as a
target to measure against, and none may declare it wrong either.

*Source: owner, this date, in session. Verification by direct measurement of
mv_harvest_yields and mv_harvest_pkg_rollup the same hour.*

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

**2026-08-07 — APEX IS THE SALES SOURCE OF RECORD, NOT METRC.** Owner: *"We
will pull reports from Apex for sales, not Metrc — that will be the source for
what units were sold for."* **Access not yet obtained.**

**What this reframes, and it is a lot:**
- **A Metrc manifest price is a COMPLIANCE DECLARATION, not a commercial
  record.** It states what was declared on the transfer. The invoice, the
  discount, the terms and the true unit price live in Apex.
- **Every price figure Agent D produced on 7 Aug came from Metrc manifests.**
  The $807.50/lb bulk flower, the $1,430/lb packaged, the per-strain and
  per-customer tables — **all of it must be labelled "declared wholesale
  transfer price", never "realised sale".** The "selling below cost"
  conclusion inherits that caveat and must not be quoted as revenue truth.
- **It also explains the price anomalies rather than leaving them as
  mysteries.** ~319 lines at **$0.01**, two 2026 manifests priced **flat per
  package regardless of weight** ($1,000 and $500 each), the same product at
  $668/lb and $2,593/lb eleven weeks apart, and **$901,430 of Eagle Eyes
  storage carrying prices at all** — these are consistent with the Metrc price
  field being treated as a low-stakes compliance entry **because the real
  number lives in Apex.** Not sloppiness; a different system of record.
- **The correct model is two sources, reconciled:** Metrc = what moved and
  what was declared. Apex = what was sold and for how much. **Disagreement
  between them is a finding**, exactly like every other two-way check here —
  and it may be the most valuable check in the business once access exists.

**Until access:** Metrc declared price is the best available and must carry
that label on every figure. **A prior go-live decision already deferred this**
— *"we will not sync Apex or shipping until the site is live; Metrc must be
done first."*

*Source: owner, this date.*

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

**2026-08-07 — Failed material: three fixes to the disposition guard.** The
owner ruled "anything purchased as failed is remediated then processed or sold
— as is ours", and all 10 failed packages were recorded: 8 bought-in / 93.4 lb
`bought_for_remediation`, 2 ours / 57.0 lb `remediate_in_house`. Three defects
were found in the machinery built to hold that ruling and all three are fixed:

1. **`not_yet_decided` silenced the flag.** `v_item_flags_all` and `v_real_loss`
   clear a package on ANY non-superseded disposition row. `not_yet_decided` was
   a permitted value, so recording "we have not decided" would have made the
   open decision vanish. **Removed from the CHECK constraint** — that state is
   the ABSENCE of a row, which both views already read correctly. Structural,
   so any view built later inherits it. *0 rows and 0 code references at the
   time, so nothing was lost.*
2. **`v_issue_failed_testing` was unit-blind and not disposition-aware.** It
   divided `quantity / 453.592` whatever the unit, and never joined the
   disposition table, so a ruled package would have been flagged for ever. Now
   uses `f_to_pounds`/`f_is_weight` and leaves the view when a ruling is
   recorded. All 10 rows are grams, so **no number moved today** — it was a
   trap for the first failed package recorded in lb or as a countable item.
3. **A disposition that promises work is not the work.** `remediate_in_house`,
   `sell_for_remediation` and `destroy` are commitments; only
   `bought_for_remediation` is a classification (it says the material always was
   discounted feedstock). Added `completed_at` + `completed_evidence` (evidence
   mandatory) and **`v_remediation_owed`**, which holds a promised-but-undone
   disposition until it is carried out. **The 2 own packages sit there now,
   0 days owed, Metrc still reading `TestFailed`.** Empty is the good state.

Also corrected: `v_issue_failed_testing` valued OTHER people's failed material
at OUR cultivation cost per pound. Bought-in material was bought at a discount
and `material_purchases` is empty, so what was paid exists nowhere.
`value_at_cost` is now null for third-party material with `cost_basis` saying
why. *Source: Agent D, verified against the live database.*

**2026-08-07 — The certificate is the cultivator of record. 983 COAs parsed.**
Owner ruling: *"You check ours first. You caught a match — but then you confirm
with the COA, since there is doubt."* The COA calls it **`Client Info`** (also
`CULTIVATOR INFO`, `MANUFACTURER INFO`, `Client`, or a name above `License #:`,
depending on lab).

**What it settled.** Package `1A40A030000E5B2000009058`, 56.84 lb, ruled "ours,
remediate in house". `coa/2267739.pdf` — Green Analytics report `GGDB-00016` —
named the client **Greater Goods, LLC, License MB282344**. Batch
(`Bruce Banner F1 Harvest`), source package (`…011815000000021`) and the Total
Yeast and Mold failure all matched exactly. **The only discrepancy on the
document was ownership, and it was ours.**

**Root cause.** `ItemFromFacilityLicenseNumber` names whoever defined the ITEM,
not who owned the MATERIAL. A repack under a new item name flips it to us.
**191 active packages / 420.6 lb** read as ours and trace outside. Same cause as
the C6d consigned-material breach. Fixed with `f_material_origin(tag)` and
`v_material_ownership_conflict`.

**The parse.** All 983 stored certificates downloaded and read — 246 MB, zero
errors. **972 now carry `client_license`**; 11 carry no client licence at all
and are reported UNPROVEN, never as agreement. Five lab layouts handled. The
anchor: **a Massachusetts LAB licence is always `IL######`**, so any
MC/MP/MB/MR/MT/RMD licence in the header belongs to the client.
`coa_extract` gained `client_name`, `client_license`, `client_address`,
`lab_report_id`, `metrc_batch_id`, `metrc_sample_id`, `metrc_source_id`,
`manifest_on_coa`.

**Result — `v_ownership_vs_certificate`:** AGREES 943 pkgs / 992.0 lb ·
**CONFLICT 15 pkgs** (1 active, 7.42 lb) · UNPROVEN 11 · NO CERTIFICATE 2,605.

**Known limit of the method, stated plainly.** The COA client is **whoever
submitted the sample**. That equals the cultivator when the cultivator submitted
it — as with the Greater Goods packages, tested on their own tags and shipped to
us afterwards. It does NOT when we re-tested bought-in material: 13 of the 15
conflicts read "platform says them, certificate says Twisted Growers", which is
consistent with us paying for the retest. **Those 13 are not proof we grew it.**
The two going the other way (`…004941` → Trifecta Farms, `…005049` → Greater
Goods) are the ones that contradict our own claim.

**Also corrected:** `coa_extract.document_id` holds the **Metrc document number**
(`2510662`), not the `metrc_documents.id` uuid. An earlier read of "not parsed"
on 983 rows was a join failure, not a parse gap.
*Source: Agent D, verified against the live database and the certificates.*

**2026-08-07 — Testing: seven laboratories, 983 certificates, 29 sample packages.**
Owner: *"it's a hell of a lot more than 29 samples and we have multiple testing
companies."* Correct on both counts.

| laboratory | licence | certificates |
|---|---|---|
| GVA Labs, Holyoke | IL281359 | **709** |
| Analytics Labs, Holyoke | IL281280 | 89 |
| Safetiva Labs, Westfield | IL281354 | 71 |
| Kaycha Labs, Natick | — | 55 |
| Green Analytics MA, Framingham | IL281277 | 46 |
| MCR Labs, Framingham | — | 6 |
| ProVerde Labs | IL281355 | 2 |

**Weight sent out for testing is NOT accounted for anywhere.** 755 certificates
state a sample weight: **6,804 g = 15.00 lb**, mean 9 g, commonest 12 g.
Extrapolated across all 983 tests, **≈19.5 lb** has physically left inventory
into laboratories. The platform holds **29 sample packages totalling 0.57 lb**.
**The lab-sample packages are not syncing** — that is the defect, not the mass.

**Testing batch cap is 15 lb (dry).** Visible in the data as a hard cluster at
exactly 15.0 lb. The 71 packages exceeding it are all **Fresh Frozen — wet
weight** (max 100.4 lb wet ≈ 22 lb dry). Batch-splitting does NOT break the
inherited-certificate logic: of 2,088 packages with a resolved certificate,
**2,076 sit on an ancestor holding exactly one**, 12 sit on ancestors with 2–5
batch certificates **all from the same client** (ownership safe, potency
ambiguous), and **zero** inherit from an ancestor with certificates from
different clients.

> **REJECTED FIGURE — do not repeat it.** A created-minus-remaining-minus-children
> sweep returned **12,117 lb "unaccounted", 52.8% of created weight.** It is NOT
> loss and was never reported as such. It is dominated by (a) weight that left on
> outbound manifests and (b) fresh-frozen **wet** parents producing **dry**
> children. Wrong basis on both counts. Any real shrinkage figure must subtract
> transfers out and convert wet to dry first.
*Source: Agent D, from the 983 certificates and the live database.*

**2026-08-07 — Manifests attached to items. 0 → 2,642 documents.**
Owner: *"How can this be? This must be fixed — 2,690 manifest documents has
package_tag = null."*

**Why it happened.** `metrc_documents.package_tag` is ONE column and a manifest
covers MANY packages — 19,256 lines across 2,643 manifests. Last night's work
attached the COAs (969 packages) and the inbound manifests (via
`ReceivedFromManifestNumber`), but a **sold** package carries nothing pointing at
its outbound manifest, so the outbound half could never be filled. Backfilling
the column would have repeated the one-to-one-on-many-to-many error that already
capped COA coverage at 34%.

**The link already existed and nothing used it.** `metrc_rpt_package_transfers`:
**19,256 rows, 2,643 manifests, 15,496 packages, every tag a full 24 characters.**

**Fix — `v_document_package_link`**, derived not stored, so it cannot go stale:
COA direct · COA inherited through lineage · **manifest → every package that
travelled on it** · inbound manifest from the package record. Plus
**`v_item_documents`**, the per-item document position.

| | links | packages | documents |
|---|---|---|---|
| COA direct | 983 | 969 | 983 |
| COA inherited | 1,123 | 1,119 | 416 |
| **Manifest — on manifest** | **19,248** | **15,488** | **2,642** |
| Manifest — inbound | 1,027 | 1,027 | 211 |

**Where our packages stand:** COMPLETE (COA + manifest) **869** · COA only 1,219
(8 of them shipped) · MANIFEST only 419 · NEITHER 1,067 (569 of which were
tested). **An item that was tested or sold and is not COMPLETE must not go to a
customer** — both documents go out before the order ships.

**STILL OPEN — the outbound blind spot.** All 2,550 outgoing transfer records
have a null recipient; Metrc returns it on `/transfers/v2/{id}/deliveries` and
the sync only pulled the header. So we now know WHICH packages were on a
manifest, but not WHO received it. 2,683 manifest PDFs on disk print it.
*Source: Agent D, verified against the live database.*

**2026-08-07 — Documents: no expiry. Records are kept and sendable years later.**
Owner ruling. **`f_item_documents(tag)` is THE accessor**, callable from any page,
any line item: the certificate (direct or inherited, with the cultivator of
record) and every manifest the item travelled on, deduplicated, ready to print,
download or email.

**TWO EXPIRIES — one was junk, one is law. Never confuse them again.**

1. **Signed-URL expiry — REMOVED.** Nobody chose it; Supabase signed URLs carry a
   TTL by default and whoever generated ours took the default. It is a property of
   a temporary ACCESS KEY, not of a document. **All 3,666 were signed together and
   all expire 5–6 September 2026** — one day on which every print and download
   button in the platform would have died at once, with years of kept records
   stranded behind stale tokens. **Caught before it fired.** The function now
   returns `storage_path` and **never a URL**; the page mints one at click time
   with `createSignedUrl(storage_path, ttl)`. Works identically in 2030.
2. **Lab result validity — KEPT, because it is real.** A Massachusetts certificate
   is valid one year. Metrc carries it as `ExpirationDateTime`; **99,260 of
   101,608** lab rows have one, spanning 2024-09-14 → 2027-08-06. Exposed as
   `coa_valid_until` / `coa_expired`. **736 packages are past it, but only 2 are
   still active** — product cannot be sold on an expired certificate, so this must
   be visible to whoever is shipping.

**The platform serves documents. It does not send them** — shipping and receiving
email them. `document_sends` stays **empty by decision**; do not build a send flow
against it without a new ruling. The table now carries that comment.

**Also fixed:** the same manifest reached a package by two routes (its manifest
line and the package's inbound record) and appeared twice. Deduplicated by
`manifest_number` — the user sees it once.

**2026-08-07 — All 191 ownership conflicts judged against the certificate.**
The owner's method — check ours, find doubt, confirm with the COA — applied to
every conflict rather than the one that started it. **`v_ownership_verdict`.**

| verdict | packages | lb |
|---|---|---|
| **CONFIRMED NOT OURS** — the laboratory names another licensee | **52** | **146.0** |
| INCONCLUSIVE — certificate names us, lineage says outside | 115 | 252.1 |
| UNPROVEN — no certificate anywhere in the lineage | 22 | 22.5 |
| NAME ONLY — certificate names a client but prints no licence | 2 | — |

**The 146.0 lb, by certified owner:**

| certified owner | licence | pkgs | lb | platform calls it |
|---|---|---|---|---|
| Greater Goods, LLC | MB282344 | 6 | **65.0** | MP281909 |
| Holyoke Wilds, LLC | MC283571 | 3 | **45.0** | MC281714 |
| Solar Therapeutics | MC281592 | 4 | 30.3 | MC281714, MP281909 |
| Jushi MA, Inc | MP281524 | 4 | 4.5 | MP281909 |
| Solar Therapeutics | MP281464 | 1 | 1.2 | MP281909 |
| Theory Wellness | RMD305-P | 21 | countable | MP281909 |
| *(name not printed)* | MP281588 | 13 | countable | MP281909 |

**Every one is an inherited certificate — depth 1 to 4.** None would have been
found by matching on the package's own tag. This is the payoff from resolving
certificates through lineage.

> **INCONCLUSIVE IS NOT AGREEMENT.** The certificate client is whoever SUBMITTED
> the sample. That equals the cultivator when the cultivator submitted it — as
> with the Greater Goods packages, tested on their own tags before they ever
> reached us. It does NOT when we re-tested material we had bought. **115
> packages / 252.1 lb name us on the certificate while the lineage says the
> material came from outside — exactly what paying for a retest looks like. It
> is not proof we grew it and must never be reported as such.**
*Source: Agent D, verified against the live database and 980 parsed certificates.*

**2026-08-07 (later) — Certificate coverage +199, and a silent pick I made and undid.**

**The fifth link source.** "182 packages need a pure download" was WRONG — all 127
documents behind them were already on disk. They were unreachable because
`metrc_documents.package_tag` holds ONE tag and a certificate covers SEVERAL.
**`metrc_lab_results` pairs `package_tag` with `document_file_id` per result row**
— the laboratory's own statement of which certificate belongs to which package,
many-to-many by nature. Added to `v_certificate_resolved`:

| | before | after |
|---|---|---|
| Certificate coverage | 2,088 | **2,287** |
| Certificate gap | 977 | **779** |
| Gap still active | 22 | **7** |

**Zero API calls, for the third time today.** Every certificate "gap" so far has
been a LINK problem, never a missing document.

> **THE MISTAKE, RECORDED BECAUSE IT MOVED A HEADLINE FIGURE.**
> `v_certificate_resolved` picks the certificate by `row_number() over (order by
> depth)` — the shallowest. Attaching nearer certificates moved **33 packages**
> from CONFIRMED NOT OURS to INCONCLUSIVE and the reported figure went
> **52 pkgs / 146.0 lb → 19 pkgs / 128.5 lb + 1,494 units** with nobody deciding
> it should. **Depth is a tie-break, not a reasoning**, and here it prefers the
> WEAKER evidence: a near certificate says who tested THIS package — often us, on
> material we bought — while a deep one sits closer to who grew it.
>
> **`v_certificate_disagreement` now surfaces it instead of hiding it: 577
> packages carry certificates naming different clients, 164 of them ours-versus-
> outside — 136 where ours is nearer, 28 where the outside one is.** Those need a
> person to read both. Never average, never let the ordering decide.

**Current ownership verdict:** CONFIRMED NOT OURS 19 pkgs / 128.5 lb + 1,494
units · INCONCLUSIVE 149 / 269.6 lb + 12,510 units · UNPROVEN 21 / 22.5 lb ·
NAME ONLY 2 / 1,890 units.

**2026-08-08 — HARD RULE: proof required for "never tested".** Owner: *"All items
you show as untested, no COA or manifest — I need to see what Metrc inventory and
seed-to-sale shows for each tag. That means it's in the facility and Metrc tracks
exactly what room it is in, per law."*

**`v_never_tested_proof`** shows, per tag, Metrc's own record: room, room type,
sublocation, state, quantity, on-hold, packaged date, last modified, source
harvest, source packages, production batch, what it became — plus the four-source
reconciliation. **Nothing in it is inferred by the platform.**

**Result: 111 packages PROVEN, 0 failures, 0 without a room, 5 rooms.**
Hydrocarbon ~60 (crude, badder, distillate, isolate) · Solventless ~16 (bubble
hash, rosin) · Production Room 9 (gummies) · Fulfillment Vault 27 (**24 are
SEEDS** — `NotRequired` because seeds are not lab tested, and that is the entire
2,400-unit NotRequired figure) · Biomass Prep 2. **None in a finished-goods
sales location.** 87 of 111 carry a seed-to-sale chain; the 24 without are the
seeds, which ARE the origin.

**What the owner overturned along the way.** The "324 packages with no custody
record" figure was wrong to present as one gap. 129 of them never left the
facility — work in progress — exactly as he predicted from the trade: *"the only
way this is possible is if it never left the facility."* The remaining 195 were
tested, and testing needs a manifest — his rule again. Traced: **228 outgoing
lab-run manifests exist in Metrc carrying 1,402 sample packages; we hold 29.**
The parent legitimately never moves — the SAMPLE ships. **An import gap, not a
compliance gap.**

**Also corrected: a regression of mine.** Adding the lab-results path to
`v_certificate_resolved` raised coverage 2,088 → 2,287 but broke the document
link, because `v_document_package_link` still joined on
`metrc_documents.package_tag`. **1,135 certificates resolved with no PDF
attached**, and `v_item_documents` COMPLETE fell 869 → 372 looking like real
deterioration. Fixed by following the lab pairing in the link view too. Same
one-to-one-on-many-to-many fault, third location.

**2026-08-08 — OWNER RULING: MMM Transport DELIVERS. Its revenue is real.**

Asked: *does MMM Transport deliver your product to dispensaries, or store it?*
Answer: **delivers.**

**This overturns a rule the brain had been applying.** Trap 8 read *"a
transporter (MT) licence destination is never a sale."* Applied literally it
would have removed **$86,468 of genuine revenue**.

| | Eagle Eyes MT281320 | MMM Transport MT281556 |
|---|---|---|
| ruling | **STORAGE — not a sale** | **DELIVERS — a real sale** |
| moved | bulk material | **branded finished goods** |
| returned | **119 tags · $378,741 declared** | 7 of 50, all inside 3 days |
| period | Aug 2024 – Feb 2025 | Oct 2025 – **27 Jul 2026, live** |
| verdict | **remove $1,113,053** | **keep $86,468** |

**THE DISCRIMINATOR IS THE RETURN LEG, NOT THE LICENCE PREFIX.** Storage sends
material back; delivery does not, because a buyer received it. **42 of the 43
MMM packages with no return are `Twisted |` branded consumer product** — bulk
biomass comes home, finished goods do not. The 7 that did return came back
within three days, which is a failed drop, not storage.

**Corrected revenue adjustment: −$1,113,053** (Eagle Eyes), not the $1,199,521
full MT total and not the $901,430 previously recorded — that older figure was
Eagle Eyes only, Buds only, priced ≥ $1, and missed MMM entirely.

**STILL OPEN, and it follows directly from the ruling.** If MMM delivers, the
43 packages reached actual buyers — and **the platform does not know who.** The
manifest names the transporter as destination, not the final recipient.
$78,333 of delivered product with no identified customer. `document_sends` and
Apex would settle it; neither is available.
