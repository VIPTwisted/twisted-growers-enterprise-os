/* Staging for the 2025 close import. Temporary by intent: the final migration
   asserts against it and drops it in the same transaction that writes the real
   rows, so metrc_rpt_point_in_time is touched exactly once and atomically.
   The payload is 1.17 MB and cannot travel in one call; this is how it arrives
   without giving up the all-or-nothing guarantee. */
create table if not exists public.tmp_pit_2025_close (r jsonb not null);
alter table public.tmp_pit_2025_close enable row level security;
comment on table public.tmp_pit_2025_close is
'Transient staging for the 2025-12-31 Inventory Point in Time import, 29 Aug 2026. Dropped by the migration that consumes it. If this table still exists, that import did not complete and nothing was written to metrc_rpt_point_in_time.';