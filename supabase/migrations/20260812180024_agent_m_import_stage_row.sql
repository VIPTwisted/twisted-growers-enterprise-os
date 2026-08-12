-- Agent: M — the STAGING half of the staging+typed pair.
-- The source row lands here exactly as read, before any typing. The typed row in
-- product_inventory is derived FROM this, by import_field_map, so the platform can
-- re-type a source without going back to Drive - and so a typing bug is always provably
-- a bug in the derivation and never a loss of the original.

create table if not exists import_stage_row (
  source_key  text not null,
  source_row  int  not null,
  run_id      uuid references import_run(id),
  cells       text[] not null,
  read_at     timestamptz not null default now(),
  primary key (source_key, source_row)
);
comment on table import_stage_row is
'Verbatim source rows, one array of cells per spreadsheet row, positionally aligned to import_source.header_verbatim. Nothing is parsed, coerced or dropped here. The typed tables are derived from this table through import_field_map; this is the record of what the source actually said.';
comment on column import_stage_row.cells is
'The row exactly as read, in column order, empty cells included as empty strings. Position N corresponds to import_source.header_verbatim[N].';

alter table import_stage_row enable row level security;
create policy import_stage_row_read  on import_stage_row for select to authenticated using (true);
create policy import_stage_row_write on import_stage_row for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());;
