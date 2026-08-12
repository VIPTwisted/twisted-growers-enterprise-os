-- NO EXPIRY ANYWHERE ON THIS OS. Owner ruling, 7 Aug 2026.
-- A stored signed URL is a dead link with a countdown on it. Removing the columns
-- requires DROP because CREATE OR REPLACE cannot drop columns.
--
-- tg_block_view_drops fired and stopped the first attempt - the guard works. Its
-- conditions are met deliberately, not bypassed:
--   * dependents listed first: v_item_documents is the ONLY one
--   * both views were created TODAY by this agent; nothing older is at risk
--   * both are recreated below in this same migration
--   * measured before: v_document_package_link 22,381 rows, v_item_documents 3,574
--     - both are re-checked immediately after
set local tg.allow_drop = 'yes';

drop view if exists public.v_item_documents;
drop view if exists public.v_document_package_link;

create view public.v_document_package_link as
select d.id as document_id, d.metrc_id, d.doc_type, d.package_tag, d.manifest_number,
       d.storage_path, 'DIRECT'::text as link_basis, 0 as link_depth
from metrc_documents d
where d.doc_type = 'coa' and d.package_tag is not null
union all
select d.id, d.metrc_id, d.doc_type, r.package_tag, d.manifest_number, d.storage_path,
       'INHERITED from ' || r.certificate_on_package, r.found_at_depth
from v_certificate_resolved r
join metrc_documents d on d.doc_type = 'coa' and d.package_tag = r.certificate_on_package
where r.found_at_depth > 0
union all
select d.id, d.metrc_id, d.doc_type, t.package_tag, d.manifest_number, d.storage_path,
       'ON MANIFEST'::text, 0
from metrc_documents d
join metrc_rpt_package_transfers t on t.manifest_number = d.manifest_number
where d.doc_type = 'manifest'
union all
select d.id, d.metrc_id, d.doc_type, p.tag, d.manifest_number, d.storage_path,
       'INBOUND on package record'::text, 0
from metrc_documents d
join (select distinct on (tag) tag, raw from metrc_packages order by tag, license) p
  on nullif(p.raw->>'ReceivedFromManifestNumber','') = d.manifest_number
where d.doc_type = 'manifest';

comment on view public.v_document_package_link is
  'Every document joined to every package it covers. NO URL, NO EXPIRY - '
  'storage_path is the permanent handle. A manifest covers MANY packages, so this is '
  'a link and not a column; that is why metrc_documents.package_tag is null on all '
  '2,690 manifests. Derived, so it never goes stale.';

create view public.v_item_documents as
select p.tag                                                   as package_tag,
       left(p.item_name, 55)                                   as item_name,
       p.source_state,
       p.lab_testing_state,
       case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
       count(*) filter (where l.doc_type = 'coa')              as coa_count,
       count(distinct l.manifest_number)                       as manifest_count,
       min(l.link_depth) filter (where l.doc_type = 'coa')     as coa_depth,
       bool_or(l.doc_type = 'coa' and l.link_depth = 0)        as coa_is_direct,
       string_agg(distinct l.manifest_number, ', ')
         filter (where l.doc_type = 'manifest')                as manifests,
       (p.lab_testing_state in ('TestPassed','TestFailed'))    as was_tested,
       exists (select 1 from metrc_rpt_package_transfers t where t.package_tag = p.tag) as was_shipped,
       case
         when count(*) filter (where l.doc_type='coa') > 0
          and count(*) filter (where l.doc_type='manifest') > 0 then 'COMPLETE - COA and manifest'
         when count(*) filter (where l.doc_type='coa') > 0      then 'COA only'
         when count(*) filter (where l.doc_type='manifest') > 0 then 'MANIFEST only'
         else 'NEITHER'
       end                                                     as document_status
from (select distinct on (tag) tag, item_name, uom, quantity, source_state, lab_testing_state
      from metrc_packages order by tag, license) p
left join v_document_package_link l on l.package_tag = p.tag
group by 1,2,3,4,5,11,12;

comment on view public.v_item_documents is
  'Document position of every package: certificates, manifests, whether the '
  'certificate is direct or inherited, whether the item was tested or shipped. '
  'Tested or sold and not COMPLETE means it cannot go to a customer. No URLs - use '
  'f_item_documents(tag) and produce the link at the moment of use.';

comment on column metrc_documents.download_url is
  'DEPRECATED - DO NOT SERVE THIS TO A USER. A pre-signed URL carrying a TTL. All '
  '3,666 were signed together and expire 5-6 Sep 2026, on which day every print and '
  'download button reading this column dies at once. The DOCUMENT never expires - '
  'these records are kept and sent years later. Use storage_path.';
comment on column metrc_documents.url_expires_at is
  'DEPRECATED - the countdown on download_url. Nothing user-facing may depend on it.';;
