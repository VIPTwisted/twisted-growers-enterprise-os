-- Agent: M — the single learning import path. Standing task #4.
-- Extends the existing import_* family (import_check, import_reconciliation, import_review,
-- import_skipped) with the four objects that were genuinely missing. Nothing is replaced.

-- ---------------------------------------------------------------- import_source
create table if not exists import_source (
  source_key        text primary key,
  sheet_key         text,
  report_key        text,
  file_id           text,
  tab_name          text,
  tab_name_basis    text not null default 'inferred'
                      check (tab_name_basis in ('drive_heading','prior_load','summary_tab_reference','catalog','inferred')),
  header_fingerprint text not null,
  header_canon      text not null,
  column_count      int  not null,
  target_table      text,
  direction         text not null default 'read-only' check (direction in ('read-only')),
  status            text not null default 'proposed' check (status in ('proposed','confirmed','rejected')),
  confirmed_by      text,
  confirmed_at      timestamptz,
  what_it_holds     text,
  parse_notes       text,
  registered_by     text not null default 'Agent M',
  registered_at     timestamptz not null default now()
);
comment on table import_source is
'One row per FINGERPRINTED STREAM we read - a workbook tab, or one layout of a Metrc report. The identity is the ORDERED HEADER ROW, never the filename: LabResultsReport (2).xls and LabResultsReport.csv are the same report. direction is read-only and constrained to read-only, because the owner ruling spreadsheets_are_view_only_forever forbids this platform from ever writing a cell back. tab_name_basis records HOW we know the tab is called what we call it - a tab name we inferred is marked inferred and never presented as read.';
comment on column import_source.header_fingerprint is
'sha256 of the header row: cells lowercased, inner whitespace collapsed, trailing empties dropped, joined with |. The join key to import_field_map. Two tabs with an identical layout legitimately share a fingerprint and therefore share one learned mapping - which is the point.';
comment on column import_source.tab_name_basis is
'drive_heading = the source itself named it. prior_load = an earlier load recorded the name. summary_tab_reference = a summary tab inside the workbook names it. inferred = WE guessed from data shape; treat as unconfirmed.';

alter table import_source enable row level security;
create policy import_source_read  on import_source for select to authenticated using (true);
create policy import_source_write on import_source for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());

-- ------------------------------------------------------------- import_field_map
create table if not exists import_field_map (
  header_fingerprint text not null,
  source_position    int  not null,
  source_column      text not null,
  target_table       text,
  target_column      text,
  value_type         text not null
                       check (value_type in ('text','number','percent','money','us_date','metrc_tag','flag','url','unknown')),
  unit               text,
  disposition        text not null default 'proposed'
                       check (disposition in ('proposed','mapped','reported_unmapped','ignored')),
  proposed_from      text check (proposed_from in ('header_name','data_shape','prior_load','person')),
  why                text,
  confirmed_by       text,
  confirmed_at       timestamptz,
  created_at         timestamptz not null default now(),
  primary key (header_fingerprint, source_position)
);
comment on table import_field_map is
'The LEARNED mapping, stored against the header fingerprint so it is never asked for twice. A known fingerprint maps and imports with no questions; an unknown one is PROPOSED from column names and data shape and shown to a person before a single row is written. disposition = reported_unmapped is the state that matters most: a column we do not carry is REPORTED, never dropped, because weeks were lost finding fields that existed in a source and nowhere in the database.';
comment on column import_field_map.unit is
'The unit the number is stored in - percent, USD, g, lb, units, cases, days. Stored beside the number because "94.08%" must never be kept as a string.';
comment on column import_field_map.disposition is
'proposed = awaiting a person. mapped = written to target_column. reported_unmapped = the source has this column, we deliberately do not store it, and that fact is visible. ignored = confirmed as noise (spreadsheet fill-down artefacts).';

alter table import_field_map enable row level security;
create policy import_field_map_read  on import_field_map for select to authenticated using (true);
create policy import_field_map_write on import_field_map for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());

-- ------------------------------------------------------------------ import_run
create table if not exists import_run (
  id                 uuid primary key default gen_random_uuid(),
  source_key         text not null,
  header_fingerprint text,
  fingerprint_known  boolean not null default false,
  needed_a_person    boolean not null default true,
  file_id            text,
  file_modified_at   timestamptz,
  as_of              date,
  renderer           text,
  rows_read          int not null default 0,
  rows_accepted      int not null default 0,
  rows_rejected      int not null default 0,
  fields_quarantined int not null default 0,
  columns_unmapped   int not null default 0,
  outcome            text not null
                       check (outcome in ('ok','ok_empty_verified','no_rows_returned','failed','blocked')),
  note               text,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  ran_by             text not null default 'Agent M'
);
comment on table import_run is
'One execution. Reports rows read, rows written and ROWS REJECTED - never a bare success. outcome exists because SILENCE MUST BE DISTINGUISHABLE FROM SUCCESS: point_in_time_mp pulled 0 rows on 10 Aug 2026 and still read active=true while its sibling pulled 2,103 the same day.';
comment on column import_run.outcome is
'ok = rows written. ok_empty_verified = the source really is empty and we proved it. no_rows_returned = we got nothing and CANNOT prove the source is empty - this is a fault, not a pass. failed = the parse broke. blocked = the source could not be reached at all.';
comment on column import_run.needed_a_person is
'The owner test: feed the same report kind twice, the first needs a person, THE SECOND MUST NEED NOBODY. This column is how that is measured.';

alter table import_run enable row level security;
create policy import_run_read  on import_run for select to authenticated using (true);
create policy import_run_write on import_run for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());

-- -------------------------------------------------------------- import_rejects
create table if not exists import_rejects (
  id            bigserial primary key,
  run_id        uuid not null references import_run(id),
  source_key    text not null,
  source_row    int,
  scope         text not null check (scope in ('row','field','column')),
  source_column text,
  target_column text,
  reason_code   text not null,
  reason        text not null,
  raw_value     text,
  raw_row       jsonb,
  created_at    timestamptz not null default now()
);
comment on table import_rejects is
'Every rejected row, quarantined field and unmapped column, with its reason and the raw value that caused it. "Row issues" stops being an excuse the moment rejections are counted and visible. scope=row is a row we could not map and did not write; scope=field is a row we DID write with one value quarantined rather than silently coerced; scope=column is a source column we carry nowhere.';

create index if not exists import_rejects_run_idx    on import_rejects(run_id);
create index if not exists import_rejects_reason_idx on import_rejects(reason_code);

alter table import_rejects enable row level security;
create policy import_rejects_read  on import_rejects for select to authenticated using (true);
create policy import_rejects_write on import_rejects for all    to authenticated using (f_caller_is_admin()) with check (f_caller_is_admin());;
