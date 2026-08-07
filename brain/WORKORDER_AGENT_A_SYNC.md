# Work order → Agent A (Metrc & Document Importer)

**Raised by Agent D, 7 August 2026, at the owner's direction. Read-only
diagnosis; nothing was changed.** Evidence: `metrc_sync_runs`, last 48 hours,
grouped by endpoint / licence / status. Re-measure before acting — these move.

## Headline: the credentials are fine. Every 401 is a wrong-licence call.

| Licence | Endpoint | 48h runs | Result |
|---|---|---|---|
| MC281714 | harvests · packages · plants · plantbatches · transfers · items · strains · locations | 106–122 each | **all ok** |
| MP281909 | packages · transfers · items · strains · locations | 106–122 each | **all ok** |
| **MP281909** | **harvests** | 118 | **401 — manufacturing holds no harvests** |
| **MP281909** | **plantbatches** | 113 | **401 — holds no plant batches** |
| **MP281909** | **plants** | 106 | **401 — holds no plants** |
| **both** | **sales** | 104 each | **401 — neither licence is retail** |

**No credential can make those succeed.** The question is invalid, not
unauthorised — confirmed by the owner 7 Aug: MC281714 is cultivation,
MP281909 is manufacturing.

---

## A-1 · CRITICAL — the lab results sync is still broken, and it blocks the potency decision
`lab results`, licence **both**, **12 runs in 48 hours, every one an error**:

> `there is no unique or exclusion constraint matching the ON CONFLICT
> specification`

**This is the identical failure diagnosed on 6 August**, recorded in
[LESSONS.md](LESSONS.md) as fixed by adding the index the code asks for. **It
did not hold, or a second constraint mismatch exists.** It fails *on the way
in*, after Metrc has already answered, so the function looks alive.

**Why it is first:** this is the pipeline behind defect D5 — the potency data.
Contradiction #3 in [CONTRADICTIONS.md](CONTRADICTIONS.md) asks the owner to
pick the canonical potency home; **whichever he picks, this sync must work.**
Named failing tag in the log: `1A40A030000E5B1000006113`.

**Do:** compare the `onConflict` column list in the deployed `metrc-lab-sync`
(now recovered at `app/supabase/functions/metrc-lab-sync/index.ts`) against
the actual unique index on the target table. Do not redeploy from the
recovered copy without diffing — its `ADMIN_KEY` literal is redacted.

## A-2 · ~600 guaranteed-to-fail Metrc calls a day, still running
Counted from the 48-hour log, multiplying each run by its sub-endpoints:
MP281909 harvests 118 × 3 · plantbatches 113 × 2 · plants 106 × 4 · sales
104 × 2 licences ≈ **1,212 impossible calls per 48 hours ≈ 600 per day.**

This was diagnosed on **6 August** (~517/day by that day's count) and a
decision was recorded that **sales endpoints are permanently disabled**.
**Sales is still being called 208 times per 48 hours.** The decision was
written down and never implemented.

**Do:** bind every endpoint to the licence *type* that can answer it —
proposed rule **D5** in `METRC_SYNC_2026-08-06.md`, one of nine sync rules
drafted that day and never merged into CLAUDE.md. Then re-measure the call
count and record the saving.

## A-3 · Ten plant syncs stuck in `running`
`plants (delta)`, MC281714, **10 runs in state `running`** — started, never
finished, never errored. Two `clickup_workspace` runs likewise.
**Do:** find whether they are hung or mis-recorded, and add a timeout that
marks a run failed rather than leaving it open forever. A run stuck in
`running` is invisible to every "did it fail?" check.

## A-4 · Sporadic `HTTP 400 on page 1`
One run each: `items` (MC281714), `strains` (MP281909), `locations`
(MP281909). Low volume, but 400 is a malformed request, not a Metrc outage.
**Candidate cause on record:** the reference endpoints cap `pageSize` at 20
and return `HTTP 400 pageSize must be a positive number between 1 and 20`
(6 Aug lesson).

---

## Not Agent A's — routed elsewhere

**`v_agent_health` reports two agents as "NEVER RAN" and at least one of them
is wrong.** `sync:deliveries` shows "Registered but has never produced
anything" — yet `metrc_sync_runs` records `reference sync (deliveries)`
completing **today at 14:00, status ok**, with the note *"0 customer names
filled from 0 examined · 0 manifests still missing a customer."* **It ran and
had nothing to do.** The health view joins on an `evidence_table` the agent
does not write to. Same suspected cause for `maint:dashboards`.

This is the roster name-mismatch already logged as Inspector finding F7 —
joins on free-text names instead of `agent_key`. **Owner: Agent D (fleet);
fix in the view is Agent B's lane.** Until it is fixed, **"NEVER RAN" on that
dashboard cannot be trusted**, and neither can "ok".
