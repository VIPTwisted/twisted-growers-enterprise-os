# Metrc — where each fact lives

*Orientation page for the state track-and-trace system this platform mirrors.*

## The one fact that outranks everything
**Metrc is the legal record. This platform is a READ-ONLY MIRROR** — it holds
no write credentials and has never written back (D1). Anything recorded here
about a Metrc problem is a record of intent, not a correction.

## Corrections protocol
- Problems are never fixed only in this platform — that hides them from the
  state record (D2).
- Corrections live in `metrc_corrections` with step-by-step instructions, and
  cannot close without who, when, and a Metrc reference. The table is
  immutable (H2). Metrc-facing tasks do not clear until fixed at source (D3).

## Licences
- Cultivation **MC281714**, manufacturing **MP281909** — but never hardcode
  them: `company_licenses` via `f_is_ours()` (G2).

## Sync and data flow
- Pipeline: Metrc API → `metrc_*` raw jsonb tables → views → matviews → SPA
  (HANDOFF.md §2).
- Call reduction and scan scheduling:
  `docs/handoff/METRC_SYNC_2026-08-06.md`.
- What Metrc **reports** provide that the API cannot (e.g. lab analyte
  values): `docs/handoff/METRC_REPORT_SOURCES.md`. This is why certificates
  can be absent — and absence must say so (A3).

## Reference
- API access, verified findings and action path: `docs/09_METRC_API_ACCESS.md`.
- Metrc's own manual: `source/Metrc_User_Guide_v7.1.pdf`
  (searchable text: `source/Metrc_User_Guide_v7.1_extracted.txt`).
- Authoritative manuals (ingested 7 Aug 2026):
  `source/Metrc_Manual_PART_1_OF_2.pdf` (100 pages = printed pp. 1–100) and
  `source/Metrc_Manual_PART_2_OF_2.pdf` (4 pages = glossary, pp. 210–213) are
  a **proven partial duplicate** of the v7.1 guide above — not a second
  source. Verified by text comparison, not assumed: Part 1 is 99.18% identical
  to v7.1 pp. 1–100 (the residual is one cover page), Part 2 is
  character-for-character identical to v7.1 pp. 210–213. **Printed pp. 101–209
  — harvest detail, packages, transfers, sales, testing — exist only in the
  complete v7.1 copy, so cite that copy for anything in that span.**
  Two copies of one document never corroborate each other.
- What the manual settles that changes how we read Metrc data — all from the
  omitted span, so all cited to the complete v7.1 copy:
  - **The harvest ledger is wet-basis and its residual is named by Metrc.**
    "There should always be weight left in a harvest batch to account for the
    moisture loss" (p.142); finishing a batch "will take the remaining balance
    to 'moisture loss'" (p.149); each package created "decreased the overall
    wet weight by the amount of the new package" (p.144). Documentary support
    for the wet-basis position — see CONTRADICTIONS #9 and #2. The manual
    gives **no numeric drying band**, so it cannot settle #1.
  - **Ownership vs custody is a real Metrc concept.** Transfer = custody
    changes, ownership does not; Wholesale Transfer = both change (pp. 212–213
    of Part 2), operationalised as a required Transfer Type dropdown —
    Infusion / Transfer / Wholesale (p.181). Bears on CONTRADICTIONS #14.
  - **Reason codes are asymmetric.** Package adjustment requires a
    State-defined reason (p.169); harvest waste (p.147) and plant destruction
    (pp. 86–87 of Part 1) do not. Absent reasons on waste are legitimate, not
    a sync defect.
  - **Metrc validates nothing** — "Metrc does not stop you from exceeding the
    maximum amounts for packages… a reporting tool providing visibility for
    what is actually being done" (p.144). Data being in Metrc is not evidence
    it is compliant.
  - **No reports or exports chapter exists anywhere in the 213 pages**, and
    "API" appears once in the whole document (p.5). The manual cannot answer
    report-column, export or API questions — absence explained, not a gap in
    our reading.
  Full page-cited digest, including open questions:
  `brain/sources/2026-08-07-metrc-manual-digest.md`.
