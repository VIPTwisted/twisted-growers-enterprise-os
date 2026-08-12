-- Phase 2a: make the 983 certificates re-readable.
--
-- THE DIAGNOSIS, corrected 10 Aug 2026 by measurement rather than assumption.
-- I previously wrote that metrc_batch_id / metrc_sample_id / metrc_source_id are
-- null on all 983 because the parser's regexes assume layout-preserved text.
-- THAT WAS WRONG. Tested against the real extracted text of certificate 2267739:
--
--   metrc_sample_id -> "1A40A0300011815000000016"   correct
--   metrc_source_id -> "1A40A0300011815000000021"   correct
--   metrc_batch_id  -> 617 characters running to the end of the document
--
-- Two of the three regexes work perfectly. So the columns are not null because
-- parsing failed -- they are null because PARSE-DOCUMENTS HAS NEVER PROCESSED
-- THESE CERTIFICATES. Something else set client_parsed_at first (parser_version
-- reads 'v1 2026-08-06' and 'coa_totals-1', never the function's own
-- '2026-08-08.3'), and v_coa_unparsed excludes anything with that timestamp set.
-- The queue was emptied before the function ever looked at it.
--
-- unpdf returns the whole 4-page certificate as ONE line of 8,591 characters with
-- no newlines and no column runs, so `$` under /m means end-of-document. That is
-- why the batch id over-captures: it is anchored to a terminator that only occurs
-- once, at the very end.

------------------------------------------------- tell "never tried" from "absent"
-- Rule K1 question 5: silence must be distinguishable from success. A null
-- metrc_batch_id currently means BOTH "we looked and the certificate does not
-- print one" and "nothing has ever looked". Those need different answers.
alter table public.coa_extract
  add column if not exists identity_parser_version text;

comment on column public.coa_extract.identity_parser_version is
  'Which identity parser last read this certificate for batch/sample/source/'
  'manifest/report-date. NULL means NOTHING HAS EVER TRIED -- which is not the '
  'same as the certificate not carrying the field. Drives v_coa_unparsed, so '
  'raising the parser version re-queues every certificate for a re-read.';

--------------------------------------------------------------- the re-read queue
-- Was: every COA whose client_parsed_at is null. That emptied permanently the
-- moment a different backfill stamped the timestamp, and both cron jobs have
-- reported success on zero work ever since -- a green light over an empty pipe.
-- Now: every COA the CURRENT identity parser has not read.
create or replace view public.v_coa_unparsed as
select d.metrc_id,
       d.storage_path,
       d.package_tag,
       e.identity_parser_version as last_read_by,
       case
         when e.document_id is null                then 'no coa_extract row yet'
         when e.identity_parser_version is null    then 'never read by an identity parser'
         else 'read by ' || e.identity_parser_version || ', which is not the current parser'
       end as why_queued
from metrc_documents d
left join coa_extract e on e.document_id = d.metrc_id
where d.doc_type = 'coa'
  and d.storage_path is not null
  and coalesce(e.identity_parser_version, '') <> '2026-08-10.identity-1'
order by d.metrc_id;

comment on view public.v_coa_unparsed is
  'Certificates the CURRENT identity parser has not read. Keyed on '
  'identity_parser_version, not on client_parsed_at -- the old definition '
  'emptied permanently when a different backfill stamped that timestamp, and '
  'parse-documents then reported success on zero work every night. Raising the '
  'version string re-queues everything, which is what makes a parser fix '
  'deployable at all.';

revoke all on public.v_coa_unparsed from public, anon;
grant select on public.v_coa_unparsed to authenticated;
;
