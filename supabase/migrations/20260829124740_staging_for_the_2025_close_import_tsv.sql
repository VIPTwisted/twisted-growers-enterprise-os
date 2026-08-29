/* Staging for the 2025 close import, take two: tab-separated lines rather than
   jsonb. The payload is 441 KB of file content that cannot cross a tool call in
   one piece, and TSV carries it in 5 pieces instead of 11.

   THE ALL-OR-NOTHING GUARANTEE IS NOT WEAKENED BY ARRIVING IN PIECES. Nothing
   here touches metrc_rpt_point_in_time. The migration that consumes this table
   asserts the staged row count, writes the real rows, re-derives the count and
   drops this table, all in ONE transaction. If any assertion fails the real
   table is untouched and this staging table survives as the evidence that the
   import did not complete. */
drop table if exists public.tmp_pit_2025_close;
create table public.tmp_pit_2025_close (line text not null);
alter table public.tmp_pit_2025_close enable row level security;
comment on table public.tmp_pit_2025_close is
'Transient staging for the 2025-12-31 Inventory Point in Time import, 29 Aug 2026. Thirteen tab-separated fields per line, in the file column order. Dropped by the migration that consumes it. If this table still exists, that import did not complete and metrc_rpt_point_in_time was not written to.';