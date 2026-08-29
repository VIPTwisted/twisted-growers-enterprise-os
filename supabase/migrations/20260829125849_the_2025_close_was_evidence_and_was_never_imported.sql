/* THE 2025 CLOSE, IMPORTED FROM THE FILE THAT WAS ALREADY EVIDENCE.
   Owner instruction, 29 August 2026: APPLY job 1 only.

   WHAT WAS WRONG. InventoryPointInTime-MC281714-2025-12-31.xls has sat in
   docs/metrc-exports since 10 Aug, hashed, registered in source_export and
   marked used_in_audit = true, while metrc_rpt_point_in_time held ZERO rows for
   2025-12-31. The register treated the file as evidence and the database had
   nothing from it. Loading a table is not delivering the data, and registering
   a file is not loading it either.

   3,364, AGREED FOUR WAYS BEFORE THIS RAN. The file's title block says "Total
   Records: 3,364"; the sheet parses to 3,364 data rows below its header; all
   3,364 Tag Numbers are distinct; and the staged copy's md5, computed from the
   file BEFORE it was sent and re-derived from the database after, is the same
   string. The content was streamed as a bound parameter, never retyped.

   NO QUANTITY IS WRITTEN BECAUSE THE REPORT HAS NONE. The Metrc Inventory Point
   in Time export has no weight, count or unit-of-measure column - verified
   against this file's 13 columns and against every source_row already stored.
   This records WHICH TAGS were held on 31 December 2025 and nothing about how
   much. Any pound figure for that close remains a reconstruction from other
   sources and must keep saying so.

   ALL OR NOTHING. Every assertion below is checked inside this one transaction.
   If any fails, metrc_rpt_point_in_time is untouched and tmp_pit_2025_close
   survives as the evidence that the import did not complete.

   THE PRIMARY KEY IS NOT CHANGED HERE. metrc_rpt_point_in_time is keyed
   (as_of_date, tag) with no licence, which has already produced five hybrid
   rows at 2026-08-06. 2025-12-31 is unaffected - only the MC281714 file exists
   for that date - and fixing the key is a separate reviewed change, not
   something to smuggle in behind an import.

   TO REVERSE: delete from metrc_rpt_point_in_time
               where import_id = '4c1d9f6a-2e30-4b77-9c85-7f0a1d3e2b41';
*/

do $$
declare
  k_import  constant uuid    := '4c1d9f6a-2e30-4b77-9c85-7f0a1d3e2b41';
  k_as_of   constant date    := date '2025-12-31';
  k_licence constant text    := 'MC281714';
  k_expect  constant integer := 3364;
  k_md5     constant text    := 'a2602300b737f9b321b99eff17806f72';
  v_staged  integer;
  v_md5     text;
  v_before  integer;
  v_after   integer;
  v_tags    integer;
begin
  select count(*), md5(string_agg(line, E'\n' order by line collate "C"))
    into v_staged, v_md5 from public.tmp_pit_2025_close;

  if v_staged <> k_expect then
    raise exception 'Staging holds % lines and the file states %. Rolling back.', v_staged, k_expect;
  end if;
  if v_md5 is distinct from k_md5 then
    raise exception 'Staged content does not match the file it came from (md5 % vs %). Rolling back rather than importing something the file does not say.', v_md5, k_md5;
  end if;

  select count(*) into v_before from metrc_rpt_point_in_time where as_of_date = k_as_of;
  if v_before <> 0 then
    raise exception 'metrc_rpt_point_in_time already holds % row(s) at %. This import refuses to upsert: overwriting a point-in-time row is what produced the 2026-08-06 hybrids.', v_before, k_as_of;
  end if;

  insert into metrc_rpt_point_in_time (
    as_of_date, tag, record_type, name, category, strain, location, sublocation,
    status_current, expiration_date, sell_by_date, use_by_date, licence,
    source_row, import_id, imported_at)
  select
    k_as_of,
    btrim(split_part(line, E'\t', 2)),
    nullif(split_part(line, E'\t', 1), ''),
    split_part(line, E'\t', 3),
    split_part(line, E'\t', 4),
    split_part(line, E'\t', 5),
    split_part(line, E'\t', 6),
    split_part(line, E'\t', 7),
    split_part(line, E'\t', 11),
    nullif(split_part(line, E'\t',  8), '')::date,
    nullif(split_part(line, E'\t',  9), '')::date,
    nullif(split_part(line, E'\t', 10), '')::date,
    k_licence,
    jsonb_build_object(
      'Type',                   split_part(line, E'\t', 1),
      'Tag Number',             split_part(line, E'\t', 2),
      'Name',                   split_part(line, E'\t', 3),
      'Category',               split_part(line, E'\t', 4),
      'Strain',                 split_part(line, E'\t', 5),
      'Location',               split_part(line, E'\t', 6),
      'Sublocation',            split_part(line, E'\t', 7),
      'Expiration Date',        split_part(line, E'\t', 8),
      'Sell By Date',           split_part(line, E'\t', 9),
      'Use By Date',            split_part(line, E'\t', 10),
      'Status Current',         split_part(line, E'\t', 11),
      'Plant Location On Date', split_part(line, E'\t', 12),
      'Plant Current Location', split_part(line, E'\t', 13)),
    k_import,
    now()
  from public.tmp_pit_2025_close;

  /* Re-derived from the target table, not trusted from the insert. A count
     taken from the thing that did the writing proves only that the writer
     agrees with itself. */
  select count(*), count(distinct tag) into v_after, v_tags
    from metrc_rpt_point_in_time where as_of_date = k_as_of;

  if v_after <> k_expect then
    raise exception 'The 2025 close loaded % rows and the file states %. Rolling back: a partial position is not a close.', v_after, k_expect;
  end if;
  if v_tags <> k_expect then
    raise exception 'The 2025 close loaded % rows but only % distinct tags. Rolling back.', v_after, v_tags;
  end if;

  drop table public.tmp_pit_2025_close;

  raise notice 'The 2025 close is in: % rows, % distinct tags, licence %, as of %.',
    v_after, v_tags, k_licence, k_as_of;
end $$;