# Work order — the COA link. 965 packages gain a certificate, zero Metrc calls.

**Raised by Agent D, 7 August 2026.** Owner requirement C3a: every item row in
every drill-down carries its certificate and its manifest. Investigating the
"finish the document backfill" instruction found **the backfill is already
complete** — the gap is a one-to-one link where the data is many-to-many.

## Verified state — nothing left to fetch

| | |
|---|---|
| Lab results walk | **3,099 of 3,099 packages queried. Zero remaining.** Last run 6 Aug 23:24. |
| Document fetch | **3,666 of 3,673 files stored (99.8%).** 16 errors: 15 × HTTP 401, 1 × HTTP 500. **Zero never attempted.** |

**The walk that was "deliberately paused pending a pacing decision" on 6 Aug
did in fact complete.** No Metrc traffic is required for any of the below.

## The actual defect: one COA covers many packages, the link holds one

`metrc_lab_backfill.document_file_ids` records which certificate belongs to
which package. Unnested:

- **2,163 package ↔ document pairs**
- **1,962 distinct packages** carry at least one document ID
- **1,045 distinct document IDs**, of which **983 exist in `metrc_documents`**
- **480 certificates are shared by more than one package.** The most shared
  covers **24 packages** (doc `2459504`); others cover 21, 16, 15, 13.

**`metrc_documents.package_tag` is a single column.** When one certificate
covers 24 packages, **one package gets the link and 23 do not** — and
`f_package_documents(tag)` joins on that column, so those 23 find nothing and
the row shows no certificate.

## TASK 1 — Build the many-to-many link. No API calls. (Agent B or A)

Create a link table (or view) from `metrc_lab_backfill`:
`package_tag` × `document_file_id`, joined to `metrc_documents.metrc_id`.
Then **repoint `f_package_documents(p_tag)` to read the link** rather than
`metrc_documents.package_tag` directly.

**Measured effect: 965 packages gain a certificate immediately.** Coverage of
tested packages goes from ~955 to ~1,920 of 2,858 — **34% to roughly 67%,
from data already on disk.**

Rules: `create or replace` only, never `drop … cascade` (E1). RLS enabled at
creation if it is a table. Verify by re-counting tested packages with a
reachable certificate before and after.

## TASK 2 — Fetch the 62 missing documents. Small, bounded. (Agent A)

**62 document IDs are referenced by the lab walk but do not exist in
`metrc_documents`** (1,045 referenced, 983 present). One call each via
`/labtests/v2/labtestdocument/{id}`. Bounded, cheap, and it closes the
remainder of what Metrc actually holds.

## TASK 3 — Resolve the 16 fetch errors. (Agent A)

15 × HTTP 401 and 1 × HTTP 500. **The 401s are likely third-party documents**
— a certificate belonging to a package received on a manifest, where neither
of our licences owns the record, so the API will never serve it. That is a
known, documented case. **Each must carry an honest reason on the row, not a
blank** (A3): *"certificate held by the originating licence — read it from the
manifest."*

## After all three, the honest picture on every row

- **~1,920 of 2,858 tested packages** show a real certificate.
- The remaining **~938 have no certificate document in Metrc at all** — that is
  a true absence, and the row must say so rather than imply one is coming.
- **Manifests are already at 99.7%** and need nothing.

**None of this is a backfill. It is one join, 62 fetches, and honest labels.**
