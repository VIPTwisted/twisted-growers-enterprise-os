# Apex delta freshness configuration repair

The scheduler checked every two hours while eligibility was measured from the latest
completed attempt. A worker finishing seconds after the tick was still just inside its
minimum interval at a later tick. That caused an additional full schedule interval of delay.

This repair sets the five established delta feeds (shipping orders, batches, products,
buyers and buyer leads) to a ten-minute minimum and checks eligibility each minute.
In ordinary successful runs, dispatch should recur within approximately eleven minutes.
That is an ingestion objective, not a measured end-to-end guarantee or source certificate.

## Application and recovery

Capture the five complete policy rows, scheduler definition, active attempts and current
worker/source versions first. Apply `tools/repairs/gpt-apex-freshness-policy.sql` as one
transaction. Its guards refuse changed or missing policy rows and an unexpected schedule.
Verify the stored values and correlate new scan-log request IDs to HTTP responses and
entity run IDs. Observe consecutive successful cycles and their actual source results.

`tools/repairs/gpt-apex-freshness-recovery.sql` restores only the captured interval values
and scheduler cadence. It refuses unexpected current values. It never deletes or rewinds
source payloads, business records, raw history, run evidence or watermarks. Pausing this
specific cron job is the stop mechanism; account for in-flight requests separately.
Recovery works whether the job is active or paused and preserves that state. Resuming a
paused job is a separate operational action after inspection.

This is configuration DML, with no schema migration, function deployment or UI change.
Both scripts must be exercised in a rolled-back transaction before the live application.
Keep exact operational evidence and source records private.

## Acceptance boundaries

- The existing executive/backend authorization, GET-only source calls, delta parameters,
  nesting and 90% monthly-credit stop stay in effect. No `force=1` is added.
- This batch covers only the five named feeds. Other required entities, source exports,
  nested field coverage, initial population gaps and independent certification remain open.
- The account-wide credit counter is authoritative for total account usage. Existing
  per-worker differences overlap when workers run together; do not sum them as exact costs.
- Quiet deltas still incur request overhead. Monitor actual monthly usage as frequency rises;
  increasing the spending cap is a separate owner decision.
- Every sync ultimately needs version-bound record/population verification, complete
  pagination, protected cursor advancement and independently supported certification.
  Faster successful runs alone cannot satisfy that requirement.
- Database report refresh, automatic browser updates and exact tile/drill agreement still
  require their own measured acceptance. Approved design and Phase 2 scope remain binding.
