# The examiner map — controls tied to external authority, not to our own rules

**Owner, 11 August 2026:** *"Every control we have is measured against our own
rules. Nothing is mapped to an external examining authority. An IRS examiner
doesn't care about db_policy rule 7 — they ask whether COGS is substantiated
under §471. A CCC examiner asks whether seed-to-sale reconciles."*

That is the exact gap. Agent D owns this file; it is the layer that makes the
[fleet audit standard](FLEET_AUDIT_STANDARD.md) defensible to someone who did not
write our rules.

**The organising principle: an examiner arrives with their own program.** Our
controls must answer *their* questions, in *their* language, with evidence they
accept. A control that satisfies `db_policy` and answers no examination question
is internal hygiene, not audit readiness.

---

## ⚠ CITATION DISCIPLINE — read before quoting anything below

This document cites external law. **Applying the audit standard to itself:**

- **Federal tax citations below are stated with confidence** — §280E, §471,
  §6001, Reg §1.471-3, §1.471-11, §263A, and the three governing cases.
- **Massachusetts CCC citations are given by SUBJECT, not by subsection number.**
  935 CMR 500.000 governs adult use and 501.000 medical, but **exact subsection
  numbers must be verified against the current regulation text before use in any
  document that leaves this building.** A wrong CMR cite in an audit-readiness
  file is itself an audit failure, and inventing one would be the exact trap this
  standard exists to prevent.
- **Nothing here is legal or tax advice.** It is a control map. The positions
  below need the company's CPA and counsel to adopt them.

---

## PART ONE — THE IRS

### The determination that matters most, and it is favourable

**Twisted Growers is a PRODUCER, not a reseller** — it holds a cultivation
licence (MC281714) and a manufacturing licence (MP281909), both verified in
`company_licenses`.

That distinction is worth more than any other line in this document:

| | Authority | What may enter COGS |
|---|---|---|
| Reseller | Reg **§1.471-3(b)** | invoice price, less discounts, plus transport to acquire. Little else |
| **Producer** | Reg **§1.471-11** (full absorption) | direct materials, **direct production labour**, and **indirect production costs** — utilities, rent and depreciation on production space, production supervision, quality control |

Under **§280E** a cannabis business may deduct **nothing except cost of goods
sold**. So for a producer, everything legitimately absorbed into inventory under
§1.471-11 is the only tax relief available. **The producer position is the whole
game**, and *Patients Mutual Assistance Collective Corp. v. Commissioner*,
151 T.C. 176 (2018), is the case that turned on exactly this — it also held that
**§263A cannot be used to capitalise costs §280E already disallows.**

### What an examiner asks, and what answers it today

| # | The examination question | Authority | Our control | Status measured 11 Aug 2026 |
|---|---|---|---|---|
| **T1** | Producer or reseller? | §1.471-11 vs §1.471-3 | `company_licenses` | ✅ **2 licences, both production. Position defensible** |
| **T2** | What is COGS and what is disallowed operating expense? | §280E | `cost_classes`, `v_payroll_journal` — *"already split by 280E class, deductible COGS labour separated from disallowed selling and administrative labour"* | ⚠ **Framework built. 4 cost classes exist** |
| **T3** | Substantiate direct **labour** in COGS | §6001, §1.471-11 | `time_entries` | 🔴 **0 rows. Cannot be substantiated** |
| **T4** | Substantiate direct **materials** | §6001, §1.471-3 | `material_purchases` | 🔴 **0 rows** |
| **T5** | Substantiate **indirect production costs** | §1.471-11 | `overhead_items` | 🔴 **1 row** |
| **T6** | Is inventory valuation consistent and documented? | §471(a) | `inventory_cost_rate` (13), `valuation_rates` (7), `cost_model` (1) | ⚠ Mechanism strong — scope precedence with an overlap constraint. Thinly populated |
| **T7** | Allocation between separate trades or businesses | *CHAMP*, 128 T.C. 173 (2007) | none | 🔴 **No control. Cultivation and manufacturing are two licensed activities and nothing allocates between them** |
| **T8** | Did you use §263A to capitalise disallowed costs? | *Patients Mutual* | none | ⚠ Must be answered "no" and evidenced |
| **T9** | Are records contemporaneous? | §6001 | `audit_journal` | ⚠ Exists and is the right shape. Reconstruction is weaker evidence than contemporaneous record |

### The finding

**The 280E classification is built and unfed.** `v_payroll_journal` splits
deductible COGS labour from disallowed administrative labour — and `time_entries`
holds **zero rows**, so there is nothing to split. `material_purchases` is empty.
`overhead_items` has one row.

For an ordinary business an unsubstantiated deduction is a disallowed deduction.
**For a §280E business, COGS is the ONLY deduction available** — so a failure to
substantiate it is not a partial adjustment. It moves the tax base toward gross
revenue.

**This is the highest-value gap in the platform and it is not a compliance
chore.** Every hour of cultivation labour that cannot be tied to a batch is a
deduction the company is entitled to under §1.471-11 and cannot prove. The
capture layer — punches, weights, batch attribution — is a tax asset, not
paperwork.

---

## PART TWO — THE MASSACHUSETTS CANNABIS CONTROL COMMISSION

*Subjects are stated with confidence; subsection numbers must be verified against
the current text of 935 CMR 500.000 before external use.*

| # | The examination question | Our control | Status measured 11 Aug 2026 |
|---|---|---|---|
| **C1** | Does seed-to-sale reconcile to Metrc, with no orphans? | `tag_event` ledger; the mandate requires a full outer join, zero orphans | ⚠ **32,619 rows but only 3 of the 12 `metrc_rpt_*` tables feed it.** Waste, destruction, adjustments, harvests, manifests and wholesale feed nothing |
| **C2** | Is the current location of every package recorded? | Rule J7; `v_never_tested_proof`; `v_onhand_by_room_stage` — a room with no registered role reads UNMAPPED rather than being guessed | ✅ Control exists and refuses to invent a room |
| **C3** | Was product tested before transfer, with a valid certificate? | `v_item_documents`, `coa_valid_until` | 🔴 **736 packages past certificate validity, 2 still active.** Item status: COMPLETE 869 · COA only 1,219 · MANIFEST only 419 · **NEITHER 1,067** |
| **C4** | Is waste recorded with method and reason? | `metrc_rpt_plant_waste` (4,396 rows, method and reason present); `v_alert_destroyed_unexplained` — *"destruction without an explanation is a serious control failure"* | ✅ Strong. **9 currently unexplained** |
| **C5** | Does every transfer carry a manifest matching its packages? | `metrc_rpt_package_transfers` (19,256), `v_document_package_link` (2,642 manifests attached) | ⚠ **Outgoing transfers carry a NULL recipient** — Metrc returns it on `/transfers/v2/{id}/deliveries`, which the sync has never called |
| **C6** | Are records retained for the required period? | `db_policy` rule 9 — all data kept 20+ years, no purge, no rolling window | ✅ **Best-in-class. Most operators fail here** |
| **C7** | Is licensed activity performed only by licensed agents? | `v_on_the_floor` — flags *"whether their agent licence has lapsed while they stand there"* | ✅ Control exists |
| **C8** | Can you produce the record for a specific tag on demand? | `v_material_forensic_dossier` — 51 columns, reason codes, proof links to Metrc's own screens and the manifest PDFs, and **verbatim adjustment rows as Metrc recorded them** | ✅ **This is the strongest audit artefact in the platform.** In a dispute it is settled by Metrc's own record, not our summary |

### The finding

**C6, C7 and C8 are genuinely strong** — better than most operators would have.
**C1 and C3 are the exposure.** A seed-to-sale ledger that omits waste,
destruction and adjustments cannot reconcile, because those are precisely the
events that explain why the numbers move. And 1,067 items with neither a
certificate nor a manifest is the population an examiner samples from first.

---

## PART THREE — WHAT NOTHING ANSWERS

Questions both examiners ask that no control currently addresses:

1. **"What is open, and since when?"** — `v_auditor_verdict.findings_open` returns
   **NULL**, because the remediation register is empty. Not zero. Uncounted. This
   is the first question in any examination and it currently has no answer.
2. **"Show me the allocation between your two licensed activities."** — nothing
   allocates cost between MC281714 and MP281909 (T7). Two licences, one cost pool.
3. **"Who performed this action?"** — `ddl_guard_log.actor` reads `postgres` on
   every row; 0 of 63 commits declare an agent. Attribution exists on paper.
4. **"Prove this control operated throughout the period."** — 47 checkers are
   dark and 42 unproven. A control that cannot show it ran did not run.

---

## HOW THIS BECOMES MACHINERY

Each row above is a **subject** in `checker_registry` terms, and the map turns
`v_auditor_verdict.coverage_pct` from an internal statistic into an
**examination-readiness score**. Four enforcements, for Agent I and Agent W:

1. **Every checker cites its authority** — a `checker_registry` row carries the
   examination question it answers, or it is internal hygiene and says so.
2. **Coverage is reported per authority**, not only in total. "0.4% overall" is
   less useful than "IRS 2 of 9, CCC 5 of 8."
3. **A red row here is a finding with a named external consequence**, which is
   what gets it prioritised over an internal style rule.
4. **T3 is the top of the register.** It is the only gap on this page that is
   simultaneously a tax exposure, a compliance weakness and a management-control
   failure — the same missing punch data that means nobody can verify the
   45-hour contracts.

---

*Written 11 August 2026 by Agent D — Brains, Loops, Agents & Guards. Every status
above was measured that day and is perishable. Federal tax citations are stated
with confidence; CCC subsection numbers are deliberately absent and must be
verified against the current regulation before this file is shown to anyone
outside the company. The positions require the company's CPA and counsel to
adopt — this is a control map, not advice.*
