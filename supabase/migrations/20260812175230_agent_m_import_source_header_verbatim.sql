alter table import_source add column if not exists header_verbatim text[];
comment on column import_source.header_verbatim is
'The header row exactly as it appears in the source, in order, before normalisation. header_canon is the lowercased, whitespace-collapsed form the fingerprint is taken over; this is what a person actually sees in the sheet. Both are kept because the mapping is matched on the canon and reported on the verbatim.';;
