# The fleet audit standard — assertions, materiality, sampling, working papers

**Owner instruction, 11 August 2026:** *"Pinion/KCoe-grade cannabis audit
practice, with Ivy-level analytical rigor… Elite firms don't just check things —
they work to the assertions framework, with declared materiality, defensible
sampling, and working papers where every conclusion ties to evidence."*

Agent D owns this. It binds **every agent and every guard**.

---

## WHY THIS EXISTS — the platform already audits better than its agents do

Measured 11 August 2026 from `v_auditor_verdict`, the row built for the owner to
read, which no agent had ever opened:

> **900 subjects. 896 never checked. Coverage 0.4%. 47 checkers dark. 42
> unproven. 24 policies on memory only. Open findings NULL — uncounted, not
> zero.**

And `checker_registry` by tier: **prevent 6 · gate 24 · detect 22 · prove 3.**

The framework is good. The **prove** tier — one fact, two independent
derivations — is the only tier that yields assurance, and it is three rows deep
against nine hundred subjects. Everything else is control, not evidence.

**A control you documented and never tested is the finding that qualifies an
opinion.** Forty-seven dark checkers inflate coverage while proving nothing.

This document is the methodology that closes that gap. It does not replace
`verification_checks`, `checker_registry` or `audit_journal` — it tells every
agent how to use them like an auditor rather than a detective.

---

## 1 · THE ASSERTIONS — every check declares which one it tests

Generic financial assertions do not survive contact with a cannabis operation,
because the inventory loses mass while you hold it and the ledger belongs to the
state. These seven are the adaptation. **Every checker must name one.** A check
that cannot name its assertion is testing a symptom.

| # | Assertion | The question | Where it has failed here |
|---|---|---|---|
| **A1** | **EXISTENCE** | Does it physically exist, in the room the record names? | Massachusetts requires Metrc to hold the current room for every tagged package. J7: every item in our possession has a known room, no exceptions |
| **A2** | **COMPLETENESS** | Is everything that happened recorded? | **The hardest and least tested.** Under-recording is invisible — nothing errors. 1,369 "missing" lab samples were shipped and absent from a mirror that syncs only ACTIVE packages |
| **A3** | **ACCURACY** | Is the quantity and its unit right? | 18,822 units hidden because countable items were NULLed by a weight function. Waste totalling 13,550,773 g reported as 29,874 |
| **A4** | **RIGHTS** | Is it ours? | `ItemFromFacilityLicenseNumber` names who defined the *item*, not who owned the *material*. 191 packages read ours and trace outside |
| **A5** | **CUTOFF** | Is it in the right period? | Maturity censoring: a pull takes ~8 months to package out. Comparing a young period to a mature one manufactured a decline that did not exist |
| **A6** | **VALUATION** | Is the dollar figure defensible? | $1,317,836 of purchases read as revenue. $901,430 of custody movements booked as sales. A $1,692,460 footer row quoted to the owner |
| **A7** | **PRESENTATION** | Does the figure carry its basis, unit, licence and as-of? | A true number stated without its basis becomes a false statement. Wet and dry never mix |

**A7 is not cosmetic.** Every figure in this business is wrong without its
basis, its licence and its as-of date. There are two licences — **MC281714
cultivation, MP281909 manufacturing** — and a number covering one while implying
both is a presentation failure regardless of how correctly it was computed.

**A2 deserves special discipline.** Completeness is the assertion you cannot test
by looking at what is there. It requires a reciprocal population: Metrc's own
export against our mirror, the manifest against the packages on it, the plan
against the actuals. *"A count is a summary of rows you have not read."*

---

## 2 · MATERIALITY — declared BEFORE testing, never after

**Materiality set after seeing the result is not materiality. It is a finding
being made to disappear.** This is the single rule that separates an audit from
an opinion, and it is absolute.

### Quantitative — owner-set rows, never inferred
The precedent exists and is correct: `v_manifest_discrepancy_audit` excludes
differences of **$1.00 or less** by owner ruling of 10 Aug 2026, because those
are rounding and clear by journal entry rather than investigation.

Every domain needs its own threshold, held in `conversion_factors` with
`set_by` and `where_it_came_from`, proposed by Agent D and **ruled by the
owner**:

| Domain | Threshold | Rationale to be set by the owner |
|---|---|---|
| Manifest / sales variance | **$1.00** — already ruled | rounding clears by journal |
| Weight variance | to be ruled | scale tolerance, not judgement |
| Plant count variance | to be ruled | a floor is a minimum, so any shortfall may be material |
| Cash / cost | to be ruled | |
| Days late | to be ruled | must respect the in-flight rule |

**Never infer a threshold from the data.** Inferring `settles_within` from late
rows makes lateness normal — rule A5, already learned here.

### Qualitative — material at ANY magnitude
Some things are material irrespective of size, because they change what a
regulator or a court would conclude. **These have no threshold and are never
netted, aggregated or waived:**

- Anything touching a **licence number**. There are exactly two and 157557 is a
  user ID, not a licence.
- Anything **reportable to the CCC**, or any entry in Metrc, the legal record.
- Anything affecting whether product **reaches a customer untested or on an
  expired certificate**.
- Any **deletion or edit of a forensic record**, or a row count falling on an
  append-only table.
- Any finding that would **change the owner's decision** about a person or a
  contract.

A $50 error in a licence field is material. A $5,000 rounding difference may not
be. Magnitude is not the test.

---

## 3 · SAMPLING — state the population, or state nothing

Every figure reported must declare **population, method, and what the result
supports.** Three methods only:

**M1 · Full population.** The default, and usually free — this is a database, not
a warehouse of paper. *"26 harvests are open past the 28-day limit"* is a
population statement and must say so. **Prefer 100% and say 100%.**

**M2 · Targeted / judgemental.** Chosen because a stratum is high-risk. The
selection criteria must be stated. **A judgemental sample NEVER supports a
conclusion about the population** — it can prove a problem exists, never that one
does not.

**M3 · Statistical.** Random selection with the **seed recorded**, so a second
agent re-performs it exactly. Only M3 supports extrapolation, and the confidence
must be stated with it.

**Sample sizes are reported every time.** The 12.9-day turnaround mean rests on
**8 measured turns** and anyone quoting it must quote that too.

**Absence is not evidence.** A zero row count may mean *not permitted*, or *not
synced*, or *a column we invented that is NULL on every row*. Before reporting
that anything is empty, prove you can see it — `metrc_rpt_plants_destroyed.
destroyed_on` reported zero destructions in 2024 when there were 3,025.

---

## 4 · WORKING PAPERS — every conclusion ties to evidence

A conclusion that cannot be re-performed by a different agent, without the
conversation that produced it, **is not audit work.** `audit_journal` already
exists for this — *every adjustment, correction and withdrawn finding, with WHY
and WHAT PROVES IT, raised as proposed, approved by a named person.* It is the
required destination.

Every reported figure carries these eight, or it does not ship:

```
1. THE FIGURE            value, unit, and basis (wet/dry, countable/weight)
2. THE ASSERTION         which of A1-A7 this tests
3. THE QUERY             the exact SQL or path - re-performable verbatim
4. THE POPULATION        full population, or method + sample size
5. AS-OF                 the timestamp, and which licence(s) it covers
6. THE ARITHMETIC        in words: "5 packages x 75.4 lb x $1,100 = $82,940"
7. MEASURED OR DERIVED   derived carries its assumptions, always
8. WHAT WAS NOT TESTED   scope limitation, stated not omitted
```

**Item 7 is where the largest number in this platform currently fails.**
`v_real_loss_summary` reports *"Yield underperformance — 5,407.8 lb,
$5,948,580."* That is a modelled counterfactual: pounds an average conversion
would have predicted. Unlabelled, it will be read as money that went missing.

**Item 8 is not optional.** A summary mentioning only what was tested is a lie of
omission, and it is the most common kind an agent tells.

---

## 5 · THE EVIDENCE HIERARCHY — and the rule that makes it bite

| Rank | Evidence | Examples |
|---|---|---|
| **1** | **External, independent** | The laboratory certificate. Metrc's own export |
| 2 | External, obtained by us | Transfer manifests, third-party invoices |
| 3 | Internal, system-generated | The Metrc API mirror, sync logs |
| 4 | Internal, human-entered | Our registers, notes, dispositions |
| 5 | **Derived / modelled** | **Never evidence. Always labelled** |

**An internal field cannot corroborate an internal field.** A check whose second
source is computed from its first proves nothing — that is why
`ownership.confirmed_not_ours` counted rows of the view it was checking and could
only ever pass.

`v_ownership_evidence` is the pattern done right: ownership derived three ways —
platform field, Metrc lineage, laboratory certificate — **only the certificate is
external**, and it reports the disagreement rather than picking a winner.

---

## 6 · THE OPINION — four verdicts, and "correct" is not one of them

An auditor never says a figure is correct. They state the assurance the work
supports and the scope it did not cover.

| Verdict | Means |
|---|---|
| **UNQUALIFIED** | Tested against the assertion, two independent sources agree, full population or a stated statistical sample |
| **QUALIFIED** | Tested, sound, **except** for a named area that could not be verified — and the exception is named on the face of the figure |
| **ADVERSE** | Tested, and it is wrong. Say so plainly |
| **DISCLAIMER** | Sufficient evidence could not be obtained. **Say why.** This is an honest verdict, not a failure |

**Disagreement between two sources is a finding, not an error to resolve.**
Report both numbers and both methods. Never average. Never pick silently.

---

## 7 · WHAT A CCC AND AN IRS EXAMINER ACTUALLY TEST

This is what makes it cannabis audit practice rather than a textbook.

**The Cannabis Control Commission** examines: seed-to-sale reconciliation against
Metrc; waste and destruction logs with reasons; transport manifests matched to
packages; **testing completed before transfer to a customer**; certificate
validity at the point of sale — `coa_valid_until` is a real one-year regulatory
limit and **736 packages are past it, 2 still active**; inventory reconciliation
at defined intervals; and record retention, which is why `db_policy` rule 9 keeps
everything 20+ years.

**The IRS**, under **280E**, examines the boundary between **cost of goods sold**
— which a cannabis business may deduct — and operating expense, which it may not.
That makes cost classification an audit issue, not bookkeeping. It demands
**contemporaneous substantiation**: a figure reconstructed later is weaker
evidence than one recorded at the time, which is the whole argument for the
capture layer and for `audit_journal`.

**Both examiners ask the same first question: what is open, and since when?**
Today the answer is `NULL` — uncounted, not zero — because the remediation
register is empty. **That is the single most urgent gap in this document.**

---

## 8 · HOW THIS BECOMES MACHINERY, NOT PROSE

Prose has been tried here repeatedly and did not hold. **A rule with no guard is
a diary entry.** Five enforcements, all measurable, for Agent I and Agent W:

1. **Coverage is the headline and it ratchets.** `v_auditor_verdict.coverage_pct`
   may rise, never fall — the pattern `rule-ledger.mjs` already uses. Today's
   baseline is **0.4%**.
2. **Every checker declares its assertion.** A `checker_registry` row without one
   of A1–A7 fails registration.
3. **A dark checker gets a deadline or gets deleted.** Forty-seven have never
   reported. Either they report or they stop counting toward coverage — a control
   that inflates coverage while proving nothing is worse than no control.
4. **The prove tier is the growth metric.** Three checkers today. Assurance comes
   from nowhere else, and detection is not evidence.
5. **The remediation register is populated**, so "open findings" stops being NULL
   and the first question an examiner asks has an answer.

---

*Written 11 August 2026 by Agent D — Brains, Loops, Agents & Guards. Every
failure cited is real and most were made on this platform. The 0.4% is the
platform's own verdict on itself, computed by machinery that already existed and
that no agent had read — including, for a full day, its author.*
