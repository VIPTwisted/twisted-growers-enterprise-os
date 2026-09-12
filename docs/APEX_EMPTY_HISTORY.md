# Apex empty-history initialization

The receiving-order and transporter-order mirrors had no records. Their ordinary
delta runs correctly refused to treat an empty response as proof that the source
population was empty. The transporter registry also named the wrong ability:
the provided Apex specification requires `view:shipping-orders`.

This repair retains that refusal and adds an administrative, database-driven
history probe. It first checks the current credit allowance. Only with known
headroom does it send five GETs: company, abilities, and the default, cancelled,
and non-cancelled order lists. Every order request starts before the evidenced
company creation time and asks for one record. Any nonzero source population is
refused by this empty-only repair and requires a separate complete ingestion.

The private proof preserves exact decoded response bodies, hashes, request
parameters, request and response times, account identity, endpoint contract and
credential fingerprint. A successful proof requires explicit zero totals,
complete pagination, all lifecycle probes, unchanged configuration, and a mirror
that is still empty. Browser roles cannot read it or invoke the administrative
probe. Completed proofs cannot be changed or deleted.

Creating the proof does not move a cursor. The next ordinary sync must overlap
the conservative proof boundary, or follow a successful receipt referencing the
same proof and exactly the preceding cursor. Account, credential or semantic
endpoint changes invalidate the anchor. Cadence-only changes do not.

Both feeds become required with a ten-minute minimum interval. The existing
dispatcher and worker continue to run; no site design or browser code changes.
The API's transport `updated_at_from` parameter is retained even though the
provided specification's parameter metadata does not mark it required.

## Acceptance boundary

This proves an empty **API history population for the captured account, endpoint
and filters at that time**. It is not an independent certification of every
business purchase, shipping activity or OS report. New data versions need new
sync evidence. Missing records, refused access and a failed proof never become
zero-valued certified business totals.

The existing general Apex ingestion writes raw pages before an entire nonempty
run completes. Some views read those raw versions without requiring a completed
receipt. That separate defect remains open; this empty-only bootstrap neither
adds raw records nor claims to repair that path. The ordinary worker's credit
read can also fail open; this probe has its own strict credit preflight.

## Guard design questions (CLAUDE.md K1)

1. A known empty source fixture completes with zero records, proving agreement
   is possible; a nonempty fixture refuses initialization.
2. Default, cancelled and non-cancelled scopes are distinct tested shapes.
   Missing or contradictory metadata and denied access are failures.
3. Coverage starts before company inception and ends conservatively at the
   reservation start. Later deltas must establish continuous cursor coverage.
4. Wrong company, changed key, positive total, missing scope, missing page or a
   cursor gap makes the guard fail. Fixtures exercise these conditions.
5. No probe, an unfinished probe, a refused probe and proven API emptiness are
   different states. Only the last can anchor a verified empty delta.

## Recovery

Pause the existing Apex dispatcher only after checking its captured command and
configuration; drain its running worker and proof requests. Restore the exact
previous completion function and the two captured entity policies, guarded
against changes made since this batch. Retain the added evidence objects,
completed proofs, source records and current cursors. Restore the dispatcher's
previous active state. Subsequent empty runs will return to the old refusal;
that is an explicit limitation, not a reason to erase valid records or receipts.

The exact previous function, policies, source evidence and recovery guards are
kept in the private review package. A full database backup restoration is not
this recovery procedure. Migration versions and live test results are recorded
with the deployed release.
