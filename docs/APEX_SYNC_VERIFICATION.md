# Apex sync verification

Applied migrations: `20260911134123_gpt_apex_sync_source_verification.sql` and
`20260911140502_gpt_apex_verification_paging_overlap.sql`.
Worker: `apex-sync` version 7, with JWT verification enabled. The entrypoint and
`verified-pull.ts` were retrieved after deployment and matched the tested files.

A successful run now retains the decoded API response text and its SHA-256 for
every page, the exact request parameters and captured endpoint policy, and a
manifest linking each returned identity to the stored raw row and payload hash.
PostgreSQL parses the original response text, avoiding JavaScript rounding of
large IDs and decimal values. Cursor advancement, the run log and verification
completion commit in one database transaction.

This proves API-to-storage agreement for the requested interval and returned
fields. It does **not** establish an independent full-population certificate,
vendor-side snapshot isolation, completeness of fields the API omits, or the
correctness of dashboard calculations. Missing pagination metadata is handled
using the endpoint's short-page convention; it is not a vendor population count.
An empty delta does not certify all previously stored records. Independent
population reconciliation and screen/version binding remain required.

Delta requests overlap the previous cursor by the entity's configured
`verification_overlap_seconds` (initially 60). This protects against timestamp
precision differences and allows a bounded amount of late source visibility;
longer vendor delays still require reconciliation. The first-history seed is
unchanged. Repeated payloads are deduplicated; returned overlap rows can still
consume vendor credits. Once the source declares `last_page`, subsequent pages
must retain that declaration even if `total` is absent.

Interrupted or contradictory pages hold the cursor and retain earlier completed
pages. Duplicate identities across pages, changed policies, altered stored rows,
conflicting cursors and expired runs cannot earn `api_verified`. A first empty
delta with no stored history remains incomplete. Per-entity leases exclude
overlapping workers. A terminal receipt cannot be revised or deleted by the
worker; browser roles cannot read or call the new evidence objects. The backend
role has no truncate permission on those tables.

The existing GET-only source access, executive authentication, refresh policy,
monthly credit guard and schedule remain in place. Verification reuses the
responses already fetched; it adds database storage and computation, not another
vendor request for each record. No frontend files change in this batch.

## Verification and recovery

`tools/tests/apex-verification.integration.mjs` runs against an explicitly named,
disposable loopback PostgreSQL service. CI uses PostgreSQL 17 and two sessions
for the reservation race. The worker test covers lost replies, database errors,
source refusal, rate limits, pagination ceilings and exact response text.

Recovery is operational; it does not delete the migration or restore a database
backup:

1. Record the current cron job 84 configuration and worker version. Stop if they
   differ from the batch's captured versions; do not overwrite another repair.
2. Pause the dispatcher and confirm its recent requests have completed by joining
   `apex_scan_log.request_id` to `net._http_response`. Also inspect any verification
   rows still running. Do not infer worker completion from the cron call returning.
3. Restore the exact version 6 source from the private recovery package, with JWT
   verification enabled. Retrieve the deployed source and compare its SHA-256.
4. Retain all raw rows, watermarks, page bodies, manifests and completed receipts.
   A running verification is closed as incomplete only after its worker has
   stopped. Do not rewind a cursor over legitimate subsequent activity.
5. Restore the dispatcher's captured active state and schedule. Check the next
   response and its linked run; record that new runs use the previous mechanism.
6. File the actual restored deployment version and hashes in the repository so
   the deployment drift gate reports the truth.

The local fixture proves additive migration replay preserves later business rows
and all evidence. Production rollback was not deliberately performed. The schema
baseline is a catalogue snapshot, not proof that a complete database restore has
been rehearsed. The exact old worker and source evidence are kept privately;
operational records and API payloads must not be committed to this public repo.
