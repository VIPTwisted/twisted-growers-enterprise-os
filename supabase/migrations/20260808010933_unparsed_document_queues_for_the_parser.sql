-- Work queues for parse-documents, so the function asks for WHAT IS LEFT rather
-- than fetching everything and filtering in memory.
--
-- WHY: the function selected all manifest documents and removed the parsed ones
-- client-side. PostgREST caps a select at 1,000 ROWS, so it only ever saw the first
-- 1,000 and every slice past offset ~889 came back "considered: 0" - it looked like
-- the work was done when 2,574 were untouched. A cap that returns a short list
-- rather than an error is exactly the kind of silent wrong answer this platform
-- keeps paying for.
--
-- UNDO: drop view v_manifest_unparsed; drop view v_coa_unparsed;

create or replace view public.v_manifest_unparsed as
select d.metrc_id, d.storage_path, d.manifest_number
from metrc_documents d
where d.doc_type = 'manifest'
  and d.storage_path is not null
  and not exists (select 1 from manifest_extract m where m.manifest_number = d.manifest_number)
order by d.manifest_number;

comment on view public.v_manifest_unparsed is
  'Manifest documents still to read. The parser selects from here with limit/offset '
  'so it never pages through the whole table and never trips the PostgREST 1,000-row '
  'cap - which silently made 2,574 outstanding documents look like zero.';

create or replace view public.v_coa_unparsed as
select d.metrc_id, d.storage_path, d.package_tag
from metrc_documents d
where d.doc_type = 'coa'
  and d.storage_path is not null
  and not exists (select 1 from coa_extract e
                   where e.document_id = d.metrc_id::text
                     and e.client_parsed_at is not null)
order by d.metrc_id;

comment on view public.v_coa_unparsed is
  'Certificates still to read for the cultivator of record.';;
