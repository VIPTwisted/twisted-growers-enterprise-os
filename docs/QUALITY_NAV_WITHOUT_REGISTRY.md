# Quality nav entries with no `report_registry` row

Measured against production 28 August 2026. **Nothing was inserted.** This is a
survey so the owner can decide which rows get a contract; every figure below is
read from `nav_registry`, `report_registry` and `pg_attribute`.

## First, a correction to the count

The number **56** came from my own earlier query and it is wrong. That query
matched any nav label containing `coa|certificat|test|lab`, which swept in eight
Human Resources rows on the letters *lab* inside **lab**our and avai**lab**ility
— `harvest_labor`, `labor_budgets`, `labour_forecast`, `dept_labour`,
`my_availability`, `employee_availability`, `safety`, `harvest-labor-inputs` —
none of which is a Quality page. A ninth, `ui_labels` ("**Lab**els & Wording"),
is the same mistake.

The real populations are:

| population | rows | with a registry row | **without** |
|---|---:|---:|---:|
| `category = 'Quality'` or `module = 'quality'` | 21 (19 enabled) | 2 | **19** |
| COA / certificate / laboratory / testing pages in OTHER categories | 27 | 0 | **27**, of which 26 are genuine |
| **Total genuinely quality-related and uncontracted** | | | **45** |

The two Quality rows that DO have a contract are `certificate-gap` →
`quality.certificate_gap` and `never-tested-proof` → `inventory.never_tested`.

## Why this matters, in one line

A page with no `report_registry` row renders through `ReportScreen` from
`nav_registry.table_ref` alone: **no declared row grain, no measure contract**.
`ReportScreen` is already on `lib/range-search.js`, so the date bus and the
search both work — what is missing is the statement of what one row *is* and
which columns may be summed. That is what stops a line report multiplying an
invoice total.

---

## A · `category = 'Quality'` — 19 rows without a contract

`date columns` is read from `pg_attribute`, so it covers tables, views and
materialized views alike. A relation with none cannot be ranged at all.

### A1 · Points at nothing (`table_ref` is null) — 2 rows, both already disabled

| view_key | label | enabled |
|---|---|---|
| `capa` | Deviations & CAPA | **false** |
| `sop_training` | SOP & Training | **false** |

These are placeholders. They need a relation before they need a contract.

### A2 · No date column on the relation — 4 rows

A range cannot narrow these. They should either declare themselves undated or
gain a date in the view.

| view_key | table_ref | kind | enabled |
|---|---|---|---|
| `v-flow-failed-split` | `v_flow_failed_split` | view | true |
| `certificate-disagreement` | `v_certificate_disagreement` | view | true |
| `ownership-verdict` | `v_ownership_verdict` | view | true |
| `testing_sla` | `v_testing_sla_matrix` | view | true |

### A3 · Dated, so a contract is straightforward — 13 rows

| view_key | table_ref | kind | date columns | enabled |
|---|---|---|---|---|
| `issue_failed_testing` | `v_issue_failed_testing` | view | `packaged_on` | true |
| `v-never-tested-reconciliation` | `v_never_tested_reconciliation` | view | `packaged_on` | true |
| `v-remediation-owed` | `v_remediation_owed` | view | `decided_on` | true |
| `dept_dash_quality` | `mv_department_dashboard` | view | `computed_at` | true |
| `lab_turnaround_report` | `v_lab_turnaround_report` | view | `month` | true |
| `testing-slas` | `testing_slas` | table | `created_at, updated_at` | true |
| `licenses` | `licenses` | table | `issued_on, expires_on` | true |
| `coa_register` | `v_coa_register` | view | `packaged_on, tested_on` | true |
| `failed-material-disposition` | `failed_material_disposition` | table | `decided_at, superseded_at, completed_at` | true |
| `safety` | `hr_incidents` | table | `occurred_at, reported_at, closed_at, created_at` | true |
| `failed_by_maker` | `v_failed_by_maker` | view | 5 date columns | true |
| `testing` | `test_requests` | table | 6 date columns | true |
| `failed_provenance` | `v_failed_provenance` | view | 7 date columns | true |

Three of these need a ruling before a contract can be written rather than
guessed:

- **`dept_dash_quality`** is the department dashboard, not a report. Its only
  date is `computed_at` — when the snapshot was built, not when anything
  happened. Contracting it as a dated report would invite ranging a dashboard by
  its own refresh time.
- **`lab_turnaround_report`**'s only date is `month`, a monthly bucket. Same
  shape as `v_dry_time_discipline`: an aggregate, not an event.
- **`safety`** reads `hr_incidents`, which is an HR table sitting under the
  Quality menu. Which lane owns its contract is a question for you, not me.

---

## B · COA / certificate / laboratory / testing pages in other categories — 27 rows

None has a contract. Twenty-six are genuine; `ui_labels` is the *lab* false
positive named above and is listed only so the count reconciles.

### B1 · No date column — 9 rows

| view_key | category | table_ref | kind |
|---|---|---|---|
| `failed_testing_by_origin` | Command Center | `v_failed_testing_by_origin` | view |
| `document-links` | Metrc | `v_item_documents` | view |
| `metrc_rpt_lab` | Metrc | `v_metrc_lab_status` | view |
| `v-certificate-resolved` | Metrc | `v_certificate_resolved` | view |
| `v-coa-unparsed` | Metrc | `v_coa_unparsed` | view |
| `v-ownership-vs-certificate` | Metrc | `v_ownership_vs_certificate` | view |
| `v-potency-vs-coa` | Metrc | `v_potency_vs_coa` | view |
| `tag_certificate` | Reports | `v_tag_certificate_final` | view |
| `tag_coa_lineage` | Reports | `mv_tag_coa_lineage` | **matview** |

`tag_coa_lineage` is worth noting separately: it is a materialized view with no
date at all, reached from a nav row whose `default_range` is `this_year`. The
control offers a year it cannot apply.

### B2 · Dated — 18 rows

| view_key | category | table_ref | kind | date columns |
|---|---|---|---|---|
| `forensic_audit` | Command Center | `v_forensic_audit_latest` | view | `run_at` |
| `lab_fail_rate_by_origin` | Command Center | `v_lab_fail_rate_by_origin` | view | `most_recent_result_on` |
| `watchdog_current` | Command Center | `v_watchdog_current` | view | `observed_at, observed_on, sweep_ran_at` |
| `metrc-lab-backfill` | Metrc | `metrc_lab_backfill` | table | `fetched_at` |
| `v-lab-analytes` | Metrc | `v_lab_analytes` | view | `result_date` |
| `v-missing-lab-results` | Metrc | `v_missing_lab_results` | view | `went_out_on` |
| `coa-extract` | Metrc | `coa_extract` | table | `parsed_at, client_parsed_at` |
| `lab-result-values` | Metrc | `lab_result_values` | table | `tested_on, imported_at` |
| `metrc-lab-results` | Metrc | `metrc_lab_results` | table | `result_date, synced_at` |
| `v-lab-turnaround-breaches` | Metrc | `v_lab_turnaround_breaches` | view | `went_out_on, came_back_on` |
| `v-lab-turnaround-summary` | Metrc | `v_lab_turnaround_summary` | view | `first_sample_on, last_return_on` |
| `coa-documents` | Metrc | `coa_documents` | table | `tested_on, expires_on, uploaded_at` |
| `coas` | Metrc | `coas` | table | `submitted_on, received_on, created_at` |
| `v_document_library` | Metrc | `v_document_library` | view | `manifest_date, tested_on, fetched_at, url_expires_at` |
| `rpt-lab-results` | Metrc | `metrc_rpt_lab_results` | table | 5 date columns |
| `rpt-test-batches` | Metrc | `metrc_rpt_test_batches` | table | 6 date columns |
| `v-lab-turnaround-packages` | Metrc | `v_lab_turnaround_packages` | view | 7 date columns |
| `ui_labels` | Human Resources | `ui_labels` | table | `updated_at` — **false positive, not a quality page** |

---

## What I did not do

No `INSERT` into `report_registry`, and no guess at a `date_column`,
`row_grain`, `grain_keys` or `measure_contracts` for any of the 45. Several of
these relations carry five to seven dates, and **which one a report means is a
business decision, not a schema fact** — `v_lab_turnaround_packages` alone
offers cut, closed, packaged, went-out, performed, came-back and expiry. Picking
one to make the table look finished is how a report ends up ranging on the wrong
event and nobody notices.

Tell me which rows get a contract and which date each one means, and I will
write them.
