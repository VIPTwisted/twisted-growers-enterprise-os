# Metrc operational-feed cadence repair

The three operational groups were scheduled hourly during business hours. That
cannot support a fifteen-minute ingestion objective or overnight updates.

The policy repair changes only `run_times` on the existing `packages`, `manifests`
and `cultivation` schedule rows to every ten minutes throughout each local day.
The existing dispatcher checks every five minutes. Existing licence capability
filters, delta windows, retry limits and worker authorization continue to apply.
No full-history sweep is requested. Each group has 144 scheduled opportunities
per day; source paging and retries determine the actual request volume.

This is configuration DML. It introduces no schema migration, worker deployment
or browser change. Descriptive legacy prose in the schedule is not authoritative;
the `run_times` array is the actual policy. Reference lists, document processing,
delivery enrichment and other Apex feeds keep their separate policies and remain
part of the outstanding whole-system freshness inventory.

## Apply and recover

Capture the complete schedule rows, dispatcher definition and worker versions.
Run `tools/repairs/gpt-metrc-cadence-policy.sql` and its recovery script in a
rolled-back transaction first. Verify all three arrays have 144 unique ten-minute
slots, including midnight and 23:50, and that recovery restores the captured rows
and cron configuration exactly. Repeat with the dispatcher and feed rows paused;
both scripts preserve the current paused state. Unexpected intervals, endpoint
assignments, timezones or dispatcher commands must raise instead of overwriting
someone else's repair. The transaction uses SERIALIZABLE isolation, because the
managed cron table permits ALTER through its supported function but does not grant
direct row-lock privileges. A concurrent cron-row change must abort the transaction;
inspect and restart from current state after a serialization failure.

Apply the policy once, then observe actual completed sync runs for every supported
endpoint and licence. Dispatch logs alone cannot establish delivery or correctness.
Check failures, incomplete runs, backlog, API throttling and propagation separately.

To stop automatic dispatch, pause only `metrc-dispatcher` and account for requests
already in flight. To recover cadence, execute
`tools/repairs/gpt-metrc-cadence-recovery.sql`; it restores only the former arrays
and cron cadence. It deliberately leaves payloads, watermarks, evidence, new valid
records, manual-run history and enabled/paused states intact. Resuming a paused
dispatcher is a separate action after inspection.

## Acceptance boundary

Ten-minute scheduling is not an end-to-end guarantee. API availability, paging,
runtime limits, report refresh and browser updates need measured evidence. The
existing manual `min_gap_minutes` control stays unchanged; the scheduled dispatcher
uses the explicit run times. Scheduler and manual-call concurrency remain governed
by existing code. This repair does not certify today's complete source population,
replace tags, or prove that all OS consumers select the latest data version.

Source `LastModified` and a row's current `synced_at` cannot measure first-arrival
latency by subtraction: a later reread can update the latter. Preserve actual
per-run observations when asserting a latency measurement. An unchanged old source
timestamp is also not evidence that the source was missed.
