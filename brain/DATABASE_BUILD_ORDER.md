# THE DATABASE BUILD ORDER — execute in this sequence

**Owner, 11 August 2026: "you are to build database fully today and every agent will
use that as source of data."**

Every number here was MEASURED on 11 Aug 2026, not estimated. Do not re-discover
them; verify them and move.

---

## THE RULE THIS ALL SERVES

**Supabase is the source. No agent reads a spreadsheet, a Downloads folder or a PDF
to answer a question.** If the answer is not in the database, the job is to put it
there — not to open the file and read it out.

`v_data_inventory` answers "what do we hold." Charter rule 13 makes querying it
mandatory before asking a person for anything.

---

## 1. FIX THE PARSERS THAT ARE DROPPING FIELDS — COMPLIANCE FIRST

Measured: 14 columns exist across 5 tables and are **never populated**. Not row
limits. The fields are defined, the source documents contain them, nothing writes them.

**`manifest_extract` (764 rows) — THE COMPLIANCE ONE.**
`origin_name`, `destination_name`, `transporter_name` are **all empty on all 764**.
764 manifests parsed and not one records who sent it, who received it, or who carried
it. The owner's ruling of 11 Aug requires every tag to name its cultivator,
manufacturer and packager — **this is where those names come from and they are being
dropped.**
⚠ `pdftotext -layout` offsets labels and values by one line. Anchor on LICENCE
PATTERNS — `MX` transporter, `IL` lab, otherwise destination — never on the adjacent
label. 2,683 manifest PDFs are on disk and do print the parties.

**`coa_extract` (983 rows) — THE SAFETY ONE.**
`pathogens` and `water_activity` empty on all 983. Those are safety results. A COA
parser that skips pathogens has not captured the certificate. Also empty: `pages`,
`client_address`.

**Lower priority, same class:** `metrc_rpt_point_in_time` (`expiration_date`,
`sell_by_date`, `use_by_date`), `metrc_rpt_wholesale` (`shipped`, `received`),
`metrc_rpt_package_transfers` (`gross_weight`).

**Clean, do not touch:** lab results 25/25, transfer manifests 27/27, adjustments,
packages, plants, product_inventory.

---

## 2. ONE IMPORT PATH FOR EVERY SPREADSHEET

Owner: *"every single spreadsheet and report I have shared must be built with an
import button so all future mapping is uniform."* And: *"agents can't keep running
around wild cowboy uploading data and interpreting it 100 different ways."*

**103 report files sit in Downloads. In Supabase: only the Finished-Goods workbook**
(`product_inventory`, `third_party_material`).

**NOT loaded, and each needs a home:**
Cultivation_Inventory_Sheet · Manufacturing Product Inventory · manufacturing
Production worksheet · Operations Planner v2/v3/v4 · Manufacturing Sales Inventory
Cash Planner · TG 2026 Harvest Calendar Analysis · flower_3.5g schedule ·
preroll_REGULAR / preroll_INFUSED / preroll_production schedules · vapes schedule ·
Product Configuration Template · Dutchie Brand Portal Template · Testing SLA Matrix

**Build ONE importer, not fifteen:**
- `import_source` — one row per file kind: name, target table, header row, sheet tab
- `import_field_map` — source column → target column, **as DATA**
- `import_run` — every import: file, rows read, rows written, rows rejected AND WHY
- A preview step: show the mapping and the first rows BEFORE writing
- **Never silently drop a row.** A rejected row is recorded with its reason. "Row
  issues" as an excuse ends when rejections are counted and visible.

---

## 3. FINISH THE SEED-TO-SALE LEDGER

`tag_event` holds **32,619 events** from 5 of 12 Metrc report tables.

**Still unread — all carry tags and dates:**
`metrc_rpt_wholesale` 12,282 · `metrc_rpt_adjustments` 4,414 · `metrc_rpt_plants_destroyed`
3,773 · `metrc_rpt_test_batches` 739 · `metrc_rpt_packages_inventory` 508 ·
`metrc_rpt_harvests` 380 · `metrc_rpt_harvest_moisture` 350

Adjustments and destructions change QUANTITY and are currently invisible to the
ledger — a tag can lose weight with no event explaining it.

**⚠ NEVER import from `TagOrders-History`.** Owner ruling: those are blank labels
purchased, not events on product. Importing them corrupts every dwell calculation.

---

## 4. THE EMPTY DOMAINS

Measured by table count and rows:

| Domain | Tables | Rows |
|---|---|---|
| Inventory & seed-to-sale | 54 | ~525,000 |
| Sales | 14 | 4,034 |
| Agents & guards | 10 | 1,933 |
| **Policies** | **15** | **37** |
| **Human Resources** | **33** | **22** |

**48 tables holding 59 rows between them.** Either load them or delete the
scaffolding — an empty table reads as "built" on every audit and is worse than a
missing one.

---

## 5. VERIFY, DO NOT ASSUME

**`product_inventory` shows 107 rows. It held 246 earlier the same day.** Something
reduced it — possibly a single-tab sheet sync running against the scoped delete added
on 11 Aug. **Check this before trusting any finished-goods figure.**

---

## HOW EVERY CHANGE HERE GETS APPROVED

`db_domain_owner` names the owner and three reviewers per domain. `db_change_review`
records each review with a verdict and a reason; `v_db_change_status` shows
APPROVED only at **three approvals from non-proposers**. One rejection stops it —
three approvals do not outvote a rejection.

`db_policy` holds the eight hard rules, each carrying the failure that earned it.

---

## WHAT NOT TO DO

- Do not ask the owner for a report. Query `v_data_inventory` and name what returns
  zero rows.
- Do not write a bespoke parser for one file. Use the shared import path.
- Do not widen a key, raise a baseline or relax a guard to make a check pass.
- Do not sweep another agent's uncommitted work into your commit.
- Do not report a figure derived a new way as confirmation. It is a NEW figure and
  must be reconciled against the existing one first.
