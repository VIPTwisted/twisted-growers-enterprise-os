# Package quantity precision rehearsal

Status: isolated rehearsal only. The production quantity column and six known
source/mirror discrepancies are not changed by this PR.

The existing `numeric(14,3)` column rounds valid source decimals. A direct type
change is blocked by dependent reports. The captured dependency closure contains
186 ordinary views, 18 materialized views, and one function returning a view's
composite type. Four relations form a cycle through `mv_tag_documents`.

The fixture reconstructs all 491 captured public table contracts, 553 real view
definitions, 30 materialized views and 409 function definitions in a disposable
database. Authentication, scheduling and HTTP service schemas are mocked; all
business tables start empty. Six synthetic rows exercise decimal loss. The
fixture contains schema definitions and permissions, not production records or
credentials. Its decoded content was checked for credential patterns.

The candidate transaction copies the previous document snapshot into a private
surrogate, temporarily redirects one cycle edge, and rebuilds the affected
relations with explicit `RESTRICT` drops. It retains the base table, widens only
its quantity column, restores exact source decimals, restores the original
definitions and access metadata, and removes the surrogate before commit.
`security_invoker` is explicitly retained when replacing the cycle view.

Checks cover an active reader, an uncaptured dependent, injected failure after
the rebuild, successful widening, preserved RLS/policies, definitions, column
contracts, relation privileges and comments, populated materialized views, and
refusal to narrow values back to three decimals. CI requires native PostgreSQL
17. The optional local PGlite run has one session and cannot establish native
concurrency behavior. A loopback-only guard prevents the fixture from connecting
to a remote database, and it creates and drops its own disposable database.

## What remains before a production migration

This fixture is a schema and synthetic-data rehearsal, not a timed production
population rehearsal. Production execution still needs fresh schema/security
fingerprints, exact function and index metadata verification, source-version
guards, coordinated sync/refresh draining, bounded locking and execution,
materialized report checks using representative data, and current API reads.
Raw payload agreement does not by itself certify freshness or full population
coverage. No successful test can turn those unperformed checks into a pass.

The catalog preflight also found that an internal TOAST object identifier changes
when a materialized view refreshes. That is physical storage churn, not proof of
a report-definition change. A production preflight must distinguish it from
actual dependency, privilege and definition changes while retaining all those
checks.

## Five guard questions

1. Can it agree? Six synthetic exact decimals agree after a successful repair.
2. Which shapes? Views, materialized views, a composite-return function, a cycle,
   primary-key-dependent queries, collations and domain types are represented.
3. What period? The fixture proves transaction behavior only; it makes no
   claim about source freshness or elapsed production rebuild time.
4. Can it fail? A held reader, new dependent, injected error or lost permission
   setting causes a failure. They are not reported as successful repairs.
5. Empty versus unchecked? Fixture business data is explicitly synthetic;
   missing production-population evidence remains unverified.

Run with `PRECISION_TEST_PGURL` pointing at an isolated PostgreSQL 17 service:
`node tools/tests/package-precision.integration.mjs`.
