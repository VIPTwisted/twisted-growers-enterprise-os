# Certified closes — what is counted, and what is only reconstructed

The register of Metrc **Inventory Point in Time** positions held in
`metrc_rpt_point_in_time`, and of the gaps between them.

## The one thing to know before using any of it

**The Inventory Point in Time report carries no quantity.** No weight, no count,
no unit of measure. Verified twice: against the 13 columns of every file in
`docs/metrc-exports`, and against every `source_row` stored in the table.

So a PIT file certifies **which tags were held** at an instant. It cannot
certify **how much**. Any pound or dollar figure attached to a close is a
reconstruction from other sources and must say so on the face of the number.
`docs/FORENSIC_INVENTORY_AUDIT.md` reached the same conclusion for 2024 and it
holds for every year.

## What is in the table

| As of | Licence | Rows | Distinct tags | Imported |
|---|---|---|---|---|
| 2025-01-01 *(the 2024 close, see convention below)* | MC281714 | 2,103 | 2,103 | 7 Aug 2026 |
| **2025-12-31** | **MC281714** | **3,364** | **3,364** | **29 Aug 2026** |
| 2026-08-06 *(not a close)* | MC281714 | 4,520 | 4,520 | 7 Aug 2026 |
| 2026-08-06 *(not a close)* | MP281909 | 643 | 643 | 7 Aug 2026 — **5 short, see below** |

## How the 2025 close was imported, 29 August 2026

The file had been evidence since 10 Aug — hashed, registered in `source_export`,
`used_in_audit = true` — while the table held **zero** rows for that date.

**3,364, agreed four ways before anything was written:**

1. the file's own title block — `Total Records: 3,364`
2. data rows parsed below the header — 3,364
3. distinct Tag Numbers — 3,364
4. md5 of the content computed **before** it was sent and re-derived **from the
   database** after — `a2602300b737f9b321b99eff17806f72`, identical

The content was streamed from `InventoryPointInTime-MC281714-2025-12-31.xls` as
a bound query parameter into a transient staging table. It was never retyped,
which is why the md5 could be checked at both ends. The import migration
asserted the staged count, the staged md5, and that the target held no rows for
that date; wrote the rows; re-derived the count and the distinct tag count from
the target table; and dropped the staging table — all in one transaction. Any
assertion failing would have left the target untouched.

Migrations, in order:
`20260829124740` (staging) · `20260829125148` (a narrow insert grant on the
staging table only, dropped with it) · `20260829125849` (the import).

Reverse with `delete from metrc_rpt_point_in_time where import_id =
'4c1d9f6a-2e30-4b77-9c85-7f0a1d3e2b41'`.

**Composition:** 3,316 Plant, 48 Package. One row's stored JSON matches a
quantity word-search: the strain *TG Humboldt Pound Cake*. Zero **keys** are a
quantity.

## Two open defects

### The primary key cannot hold two licences

`metrc_rpt_point_in_time` is keyed `(as_of_date, tag)` with **no licence**. Five
tags appear in both 2026-08-06 files:

`1A40A030000E5B1000005907` · `5908` · `5909` · `5910` · `5911`

| | MC281714 file | MP281909 file | what the table holds |
|---|---|---|---|
| Status | **Transferred** | **Active** | **Active** |
| Licence | MC281714 | MP281909 | **MC281714** |

The MP import upserted onto the MC rows and updated every column *except*
`licence`, producing five rows that exist in neither file. MP is understated by
5 tags; MC is overstated by 5 it had shipped. Both errors point the same way.

This recurs at **every** as-of where both licences are pulled and anything is in
transit between them — so it will bite on the first MP file for any close.

### The 1 January versus 31 December convention

2024 was captured as `1/1/2025`; 2025 was captured as `12/31/2025`.
`docs/handoff/METRC_REPORT_SOURCES.md` records the house rule as
"Yearly (1 January)". Both cannot be the close of their year — one is off by a
day. There is no Metrc manual in `docs/vendor` to settle it. **Unresolved, and
not guessed at.**

## The gap, by date and licence

| Date | MC281714 | MP281909 |
|---|---|---|
| 2023-10-09 *(first package)* | missing | missing |
| 2023-12-31 | missing | file exists (as 1/1/2024), **0 records** — nothing held yet |
| 2024-12-31 | file, imported | **missing — one licence only** |
| 2025-12-31 | **file, imported** | **missing — one licence only** |
| 2026 month-ends | none exist | none exist |
| today | live mirror only — a position, not a close | live mirror only |

Inventory Point in Time is **not an API endpoint** — it is not in
`metrc_endpoint_capability`. Every file here was downloaded by hand from the
Metrc web UI, so filling any gap above needs a person signed in to Metrc.
Whether Metrc still offers those dates has not been tested and no count for them
is estimated here.

## One documentation error found

`docs/handoff/METRC_REPORT_SOURCES.md` states "2,103 rows MC281714 · 648
MP281909, as at 1/1/2025". There is no MP281909 file at 1/1/2025 — the MP file
at 1/1/2024 holds 0 records, and the 648 belongs to the **6 August 2026** file.
The 2,103 is correct.
