# Project TG — Twisted Growers

Operations command center for **Twisted Growers**, a licensed, Metrc-regulated cannabis
cultivation + manufacturing company. This project is **fully separate from every other
project** in this Documents folder.

## Founding document

`source/Twisted_Growers_Enterprise_Operations_Planner_2026-2030_v4.xlsx` — a 79-sheet
executive shadow-control workbook (original lives in `~/Downloads`; this is the project copy).

**Operating model:** Executives (Vincent, CFO, CEO, Owners) run this planner in shadow mode
through **Dec 31, 2026** while the team (Jackie — cultivation, Kyle, Bert, Josh — production)
continues on existing spreadsheets that sync **one-way** into the planner. **Jan 1, 2027**
is the planned readiness date for platform transition — not an automatic cutover.

The workbook contains its own conversion contract: sheet **"Platform Code & Build
Blueprint"** (12 modules, CODE-001…CODE-012) specifying the future operating-system app,
and **"Monday Integration Map"** (MON-001…MON-006) specifying a Monday.com pilot.

## Workspace layout

| Path | What it is |
|---|---|
| `source/` | The planner workbook (project copy of record) |
| `workbook_extract/` | All 79 sheets extracted to text — values **and** formulas (`NN_Sheet_Name.txt`, `_INVENTORY.txt`) |
| `docs/` | Project documentation: workbook map, current-state assessment, platform blueprint, enhancement roadmap |

## Key facts (from the workbook, as of v4)

- 4 active grow rooms; biweekly harvest plan runs through 2030
- ~500-SKU portfolio target across departments (Flower/Infused Pre-Rolls, Cheap Pre-Rolls, Extraction, Trimming, Packaging, Shipping/Support, Quality/Compliance, Cultivation)
- Staffing model: 23 required operating seats vs 7 active FTE → 10 recommended hires; fully-staffed payroll ≈ $28.3K/week (≈ $1.47M/yr)
- Model Checks status: **ATTENTION REQUIRED** — unrestricted cash not entered, testing + production-schedule owners unassigned, 495 harvest mass-balance exceptions, 6 open P0 implementation questions
- Governance: no public sharing of the Google Sheet; team adoption not forced before Jan 1, 2027; daily Excel backups + version history required

## Working agreements

- Never mix this project with other projects' context, specs, or infrastructure.
- The workbook is the spec and system of record until a platform replaces it — treat its
  governance rules (one-way sync, approval gates, audit trail) as requirements, not suggestions.
