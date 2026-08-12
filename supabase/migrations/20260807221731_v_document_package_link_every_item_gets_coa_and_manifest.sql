-- EVERY ITEM TESTED OR SOLD CARRIES ITS COA *AND* ITS MANIFEST.
-- Owner, 7 Aug 2026: both go to the customer before the order ships, and both are
-- the defence in a vendor billing dispute. So both must be ON the item, searchable.
--
-- WHAT WAS WRONG. All 2,690 manifest documents had package_tag = null. Manifests
-- were filed by manifest number and never joined to anything. The inbound side
-- worked only because a package carries ReceivedFromManifestNumber - a SOLD package
-- carries nothing pointing at its outbound manifest.
--
-- WHY IT WAS NEVER FIXED BY BACKFILL: metrc_documents.package_tag is ONE column and
-- a manifest covers MANY packages (19,256 lines across 2,643 manifests). Writing a
-- single tag onto the document row is the same one-to-one-on-many-to-many error that
-- already capped COA coverage at 34%. It needs a LINK, not a column.
--
-- THE LINK ALREADY EXISTED. metrc_rpt_package_transfers holds 19,256 rows pairing
-- manifest_number with package_tag - 15,496 distinct packages, every tag a full 24
-- characters. Nothing had ever joined it to metrc_documents.
--
-- Derived, never stored, so it cannot go stale.
-- UNDO: drop view v_item_documents; drop view v_document_package_link;

create or replace view public.v_document_package_link as
-- 1. COA attached directly to the package the lab sampled
select d.id                       as document_id,
       d.doc_type,
       d.package_tag,
       d.manifest_number,
       d.storage_path,
       d.download_url,
       d.url_expires_at,
       'DIRECT'::text             as link_basis,
       0                          as link_depth
from metrc_documents d
where d.doc_type = 'coa' and d.package_tag is not null

union all
-- 2. COA inherited through the lineage - the certificate belongs to the package the
--    lab sampled, and everything made from it carries the same certified facts
select d.id, d.doc_type, r.package_tag, d.manifest_number, d.storage_path,
       d.download_url, d.url_expires_at,
       'INHERITED from ' || r.certificate_on_package, r.found_at_depth
from v_certificate_resolved r
join metrc_documents d
  on d.doc_type = 'coa' and d.package_tag = r.certificate_on_package
where r.found_at_depth > 0

union all
-- 3. MANIFEST -> every package that travelled on it. THIS IS THE ONE THAT WAS MISSING.
select d.id, d.doc_type, t.package_tag, d.manifest_number, d.storage_path,
       d.download_url, d.url_expires_at,
       'ON MANIFEST'::text, 0
from metrc_documents d
join metrc_rpt_package_transfers t on t.manifest_number = d.manifest_number
where d.doc_type = 'manifest'

union all
-- 4. MANIFEST -> the package that arrived on it, for inbound where the report row
--    is absent. Deduplicated against branch 3 by the outer distinct in v_item_documents.
select d.id, d.doc_type, p.tag, d.manifest_number, d.storage_path,
       d.download_url, d.url_expires_at,
       'INBOUND on package record'::text, 0
from metrc_documents d
join (select distinct on (tag) tag, raw from metrc_packages order by tag, license) p
  on nullif(p.raw->>'ReceivedFromManifestNumber','') = d.manifest_number
where d.doc_type = 'manifest';

comment on view public.v_document_package_link is
  'Every document joined to every package it covers. A manifest covers MANY packages '
  '- this is a link, not a column, because metrc_documents.package_tag can only hold '
  'one and that is why all 2,690 manifests read as unattached. Derived from '
  'metrc_rpt_package_transfers (19,256 rows) and the certificate lineage, so it never '
  'goes stale.';

create or replace view public.v_item_documents as
select p.tag                                                   as package_tag,
       left(p.item_name, 55)                                   as item_name,
       p.source_state,
       p.lab_testing_state,
       case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity, p.uom), 2) end as pounds,
       count(*) filter (where l.doc_type = 'coa')              as coa_count,
       count(*) filter (where l.doc_type = 'manifest')         as manifest_count,
       min(l.link_depth) filter (where l.doc_type = 'coa')     as coa_depth,
       bool_or(l.doc_type = 'coa'      and l.link_depth = 0)   as coa_is_direct,
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
  'Document position of every package: how many certificates, how many manifests, '
  'whether the certificate is direct or inherited, and whether it was tested or '
  'shipped. An item that was tested or sold and is not COMPLETE cannot be sent to a '
  'customer - both documents go out before the order ships.';;
