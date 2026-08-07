# Ingested 7 Aug 2026 — full line-by-line read of HANDOFF.md + docs/handoff/

*Provenance: a dedicated read agent read HANDOFF.md and all 7 handoff
markdown files completely on 7 Aug 2026 (transcripts skipped). Contradictions
found here are queued in [../CONTRADICTIONS.md](../CONTRADICTIONS.md) for the
owner. Companion: [2026-08-07-docs-forensic-digest.md](2026-08-07-docs-forensic-digest.md).*

## The nine defects (HANDOFF §4) — status as read

| ID | What | Status |
|---|---|---|
| D1 | Moisture band wrong → mass ledger impossible (4,157 lb dry available vs 5,199 lb packaged) | **Contested**: HANDOFF says OPEN and blocking all Metrc corrections; METRC_SYNC says **CLOSED** — owner set band 70–77% in `issue_decisions`. See CONTRADICTIONS. |
| D2 | `tg_sweep_unknowns()` re-raises answered questions every morning | OPEN — needs `not exists` guards |
| D3 | No date-range filtering | Mostly done: 183/235 pages have a date filter; 52 deliberately excluded (config/reference pages), 0 fixable-unfixed |
| D4 | Front end not deployed | **CLOSED 7 Aug** — live bundle verified byte-identical; Command Center fix, useNav session fix, stray `)}` all confirmed in deployed JS |
| D5 | Lab results | **Changed**: 39,531 rows STAGED + 101,608 API rows in `metrc_lab_results`; blocked on ONE owner decision — the single canonical potency home (now a THREE-way choice, see CONTRADICTIONS) |
| D6 | 2025 tax return not fileable | OPEN — and HANDOFF's prescribed fix (point-in-time export) **cannot work: the export has no quantity column**. `inventory_snapshot` covers every date from 6 Aug 2026 forward. |
| D7 | Malformed harvest room suffixes (`7f3`, `aF3`) misfile | OPEN |
| D8 | Overhead one lump ($285k incl wages), nothing attributable | OPEN — needs QuickBooks or P&L upload |
| D9 | Pre-rolls/edibles unvalued | OPEN |

## Beyond D1–D9, found open
- **Front-end sync buttons bypass every guard** — `runSync()` (App.jsx:5271)
  calls Edge Functions directly: no throttle, no admin check, no attribution;
  one press ≈ 42 calls. Must rewire through `tg_metrc_scan_now()`.
- 11 dashboard nav entries carry a dropped `table_ref` (stale metadata).
- **Email is unsendable** — no provider configured; 127 of 127 customers have
  no email address and none can be derived (A1). P0 on golive.
- Data gaps: manifest PDFs stored 28 of 2,690; packages 3,548 of 4,092 (544
  short); 53 facilities never registered (163 manifests).
- 161 `security_definer_view` advisories — views bypass caller RLS; "needs
  assessment, not a rush."
- Owner accounts still on build-phase passwords.

## Ways this project breaks (HANDOFF §5 — "each happened during the build")
The five drift risks. Two were NOT yet in the brain and are now in LESSONS:
a **fabricated benchmark** (130 g/plant presented as fact), and **counting
aggregate views with `count(*)`** (returns group count, not packages — E4).

## Unrecoverable from the repo (§13 — do not try to reconstruct)
1. Full pg_dump (Supabase dashboard → Backups, one click, no agent).
2. Signed-in screenshots — Vinny must set his own password first.
3. Metrc Reports Control Panel exports (Inventory Point-in-Time 31 Dec 2025;
   Lab Results) — the API exposes neither; "the only route to THC, TAC,
   terpenes, certificates and a fileable 2025 return."
4. QuickBooks P&L / payroll exports.
Plus: Metrc API credentials are not in the repo by design; the bridge Chrome
profile is machine-local and must never be committed; **the bridge +
sheet-sync have never been tested end to end**.

## Decisions absorbed (highlights — full detail in the handoff files)
- **Every report is pulled or imported by the OS itself — no manual
  export-and-paste** (owner, 6 Aug). Rules out the one route that worked.
- **There is no Metrc reports API** (probed live) — build against source
  endpoints; the desktop bridge is NOT needed for reports.
- **Every manifest/COA carries a working link sitewide** — fetched into the
  private `metrc-documents` bucket (sequential manifest numbers make a public
  bucket walkable), SHA-256 recorded, 30-day signed links refreshed daily.
- **Sales endpoints permanently disabled** — neither licence is retail; "a
  wholesaler's sales are its manifests." ~517 impossible calls/day removed.
- Scan schedule = owner-editable rows (`metrc_scan_schedule`, local
  wall-clock); manual scans admin-only, 15-min gap, attributed; daytime calls
  cut 96%.
- **CFO access via `is_finance_reader()`, not by widening `is_executive()`**
  — widening would have granted write to the Metrc mirror as a side effect.
- **Customer identity is the state licence number, never the name** — 49
  "spelling variants" were real separate licences; merging would have
  destroyed information. `facility_contacts` holds staff-entered ship-to
  addresses (Metrc has none).
- **Import safety trio, proven live**: preview → add-only/add-and-update →
  automatic backup → one-click undo (tested by corrupting and restoring a
  real harvest byte-for-byte).
- Only **three Metrc report files a month** are required (moisture + two
  wholesale-price exports); detection is by column signature, not filename.
- Yield judged on **rolling 3/6-month averages**, months with <8 harvests
  flagged as not-a-signal (calendar months gave a false "2 of 12 on target").
- Production measured on `CreatedQuantity`; multi-harvest weight split
  evenly; repackaged packages excluded (else 12,279 lb vs true 11,289).
- `inventory_snapshot` records daily from 6 Aug 2026 forward (747 packages,
  immutable — evidence for filed returns).
- **Default privileges hardened 7 Aug**: `ALTER DEFAULT PRIVILEGES … REVOKE
  EXECUTE FROM PUBLIC` set; `grant … to anon` blocked by a PreToolUse hook;
  nightly check remains the backstop (supabase_admin defaults aren't ours).
- **Push to main deploys production** (Netlify ↔ GitHub connected 7 Aug).
- **Proposed, never merged: nine Metrc sync rules (D4–D12)** for CLAUDE.md
  group D — written in METRC_SYNC_2026-08-06.md, still waiting.
- How to work with the owner (README/§10): verify live, show the arithmetic,
  name what's missing and why, recommendation not menu, one clear question
  with consequences — then act.

## Lessons absorbed (highlights — the expensive ones)
- **A summary footer row imported as a transaction added $1,692,460 of
  fabricated revenue — 30% of the total — and was quoted to the owner before
  checking.** The moisture import had been validated against Metrc's own
  scorecard; the revenue import was not: "the discipline was applied to one
  number and not the other." Fixes: `f_is_summary_row()` at the mapper,
  `v_import_outliers` standing check.
- **The delta-window trap**: a sync logging "ok, records: 0" every run was a
  fault, not a quiet day — 60% of harvests, 41% of manifests and every
  reference table missing while cursors never walked history. Also:
  `pageSize` caps at 20.
- **One wrong column name in `onConflict` blocked D5 indefinitely** — the
  function failed on the way IN, after Metrc answered, so it looked alive.
- **The Retest placeholder trap**: Retest rows read 0.0000 on every analyte;
  ordering by date picked the zero → 0.00% THC shown on tested flower.
- **Transfers double-counted + internal moves booked as sales**: 3,723 rows
  but 2,690 manifests (both ends of own-to-own shipments); classification by
  `ShipmentTypeName` gives 1,281 true customer sales (reconciles with
  Metrc's 1,251). Exposed: cultivation sells almost nothing directly.
- **COA parsing traps**: wrong column (LOQ vs result — layout differs per
  lab), pie-chart legends (50× overstatement), Greek letters (α/β/γ cost 3
  of 5 terpenes). Store only what reconciles to the printed total.
- **835 packages had certificates while the platform showed nothing** — "the
  number was printed on the document the whole time." Lab rows 188 → 101,608.
- **The router silently swallowed every off-rail navigation** — 14 of 43
  tiles "existed but silently failed"; fixed with a `routable` list.
- **A wrong "phantom weight" conclusion was drawn, retracted in writing, and
  the first replacement figure (62.5%) was ALSO wrong** (included 77
  never-dried fresh-frozen harvests); true drying loss weighted 73.5%.
  Retraction left on the record deliberately.
- **Unauthenticated RCE on the owner's workstation**: `bridge/server.mjs`
  passed any anon-insertable `ai_bridge_jobs.question` to Claude Code running
  with the owner's environment. Contained by stopping the bridge.
- **Revoking from anon is a no-op while PUBLIC holds the grant — and the
  naive check reports success.** Verify with `has_function_privilege()`.
  "That default is why the surface reopened three times in one day."
- 13 lab records showed results returning BEFORE samples went out (worst
  −22 days), dragging April's average negative; excluded but counted
  visibly in `impossible_records_excluded`.
- Metrc exports only grid-visible columns (`Moisture Loss` hidden by
  default → a one-column file); hand-rolled PDF parsing returned "confident
  nonsense" (the one "phone number" found was the PDF timestamp).
- A full audit missed a page blank since the day it was built
  (`v_lab_turnaround_by_month` never existed); CI now fails on any enabled
  nav entry that doesn't resolve.

## The corrections (9) — queued for arbitration
See [../CONTRADICTIONS.md](../CONTRADICTIONS.md): moisture locked-fact vs
live config; lab turnaround 2d vs 3d; D1 open vs closed; D5 three-way home;
freeze lifted vs three docs still saying frozen; D6's fix can't work; bridge
anon grants vs "0 readable" claim; transcript doesn't contain the view
definitions HANDOFF says it does; counts drift everywhere (23 vs 19 vs 20
cron jobs inside one doc set).
