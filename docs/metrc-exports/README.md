# Metrc exports — the audit evidence base

Captured 10 August 2026. These are the files the 2024 forensic audit was decided
from. **Duplicates were deliberately not kept** — 56 files sat in Downloads,
mostly repeat pulls of the same report; only the canonical copy of each is here.

The register is `source_export` in Supabase, which carries the SHA-256, the row
count, the period the file **actually** covers, and what each one proved. Query
it rather than guessing from a filename.

```sql
select file_name, period_actual, rows_in_file, used_in_audit, what_it_proved
from source_export order by used_in_audit desc, report;
```

---

## A filename does not state a report's period. The title block does.

This bit twice in one session, so it is the first thing written here.

| File | Filename suggests | It **actually** covers |
|---|---|---|
| `LabResultsReport.xls` | all lab results | **From 1/1/2025** — no 2024 at all |
| `InventoryPointInTimeReport (4).xls` | a point in time | **31 Dec 2025**, not 2024 |
| `HarvestsReport (1).xls` | from 6 Jan 2024 | earliest actual harvest **15 May 2024** |

Always read the title block (rows 1–11) before trusting a date range. Header row
is **12** on these exports — **13** on Packages Adjustments — because Metrc puts
a title and filter block above it. Read with `header=0` and every column comes
back `Unnamed: N` with values shifted.

`.xls` here are genuine OLE2/BIFF, so `xlrd` reads them; the `.xlsx` need
`openpyxl`.

---

## What these proved

**`HarvestsReport (1).xls` — closed an open request.**
Metrc was asked for everything from 6 Jan 2024 and returned **nothing before
15 May 2024**, 380 records — exactly what `metrc_harvests` holds. The harvest
sync is **complete**, not 42 or 77 harvests behind. That request is withdrawn;
the 77 unmatched names in package `SourceHarvestNames` are something other than
missing harvests.

**`PlantsDestroyedReport.xls` — corrected a figure already reported.**
The audit said *"zero plants destroyed in 2024"*. That came from `destroyed_on`,
which is **NULL on all 3,773 rows because the Metrc report has no such column**.
The true figure is in `phase_date`: **3,025 plants destroyed in 2024** — 2,530
vegetative, 495 flowering, all "harvested 0 times". They never reached harvest,
so they carry no pounds and the mass balance is unaffected. The reported *count*
was wrong.

**`TestBatchesRelationshipsReport (8).xls` — the most valuable file here.**
Runs from 1/1/2023 and carries **337 rows of 2024 test dates** with pass/fail and
harvest batch. Partially closes the 2024 testing gap that Lab Results cannot.

**`LabResultsReport.xls` — confirmed the 2024 COA gap is real.**
Starts 1 Jan 2025. Not a sync fault; the export itself excludes 2024.

**`Metrc-Massachusetts-MC281714-Packages-Transferred (1).xlsx`** — fills a known
hole: the **cultivation** licence transfer export, previously absent entirely.

---

## Still to pull

| Report | Date range | Closes |
|---|---|---|
| Lab Results | **1 Jan 2024 – 9 Jan 2025** | 133 sample tags with no COA |
| Inventory Point in Time | **31 Dec 2024** | Turns the year-end position from a reconstruction into a measurement |
| Packages Active + Inactive, MP281909 | current | Manufacturing side of the point-in-time rebuild |

The 31 Dec 2024 snapshot matters most: today's year-end figure is on a
created-quantity basis for 265 of 287 tags, and only 29.0 lb comes from tags
untouched since period end.

---

## Field capture

`field_gap` records every field these reports carry that the OS does not, and
every column the OS has that Metrc never exports. **22 gaps across 8 reports** as
at 10 Aug 2026 — 13 fields dropped entirely, 6 phantom columns, 3 columns present
in the export but never imported.

```sql
select report, field, gap_kind, consequence from field_gap where fixed_at is null;
select * from f_field_coverage('metrc_rpt_%') where verdict like 'ALWAYS NULL%';
```

A phantom column is the dangerous one. It does not error — it answers **zero**,
and that is exactly how "zero plants destroyed in 2024" reached the owner.
