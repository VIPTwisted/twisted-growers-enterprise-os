-- REGRESSION I INTRODUCED, CAUGHT BY RE-MEASURING. 8 Aug 2026.
--
-- Adding the metrc_lab_results path to v_certificate_resolved raised certificate
-- coverage from 2,088 packages to 2,287. But v_document_package_link still attached
-- the DOCUMENT by joining metrc_documents.package_tag = certificate_on_package.
-- When a certificate is found through the lab-results pairing, that package is not
-- what the document is filed under, so the join failed silently: 2,287 certificates
-- resolved, only 1,152 packages carried a document link, 1,135 lost.
--
-- Visible effect: v_item_documents "COMPLETE - COA and manifest" fell 869 -> 372
-- and it looked like real deterioration. It was not. The certificate was found and
-- the paperwork was not attached to it.
--
-- The same one-to-one-on-many-to-many fault as the original 34% coverage cap and as
-- the 2,690 unattached manifests, now in the link view itself. A certificate covers
-- MANY packages; metrc_lab_results is the laboratory's own per-package pairing and
-- must be followed here too.
-- UNDO: remove branch 2b below.

create or replace view public.v_document_package_link as
-- 1. COA filed directly against the package on the document row
select d.id as document_id, d.metrc_id, d.doc_type, d.package_tag, d.manifest_number,
       d.storage_path, 'DIRECT'::text as link_basis, 0 as link_depth
from metrc_documents d
where d.doc_type = 'coa' and d.package_tag is not null

union all
-- 2a. COA inherited through the lineage, document filed against the ancestor
select d.id, d.metrc_id, d.doc_type, r.package_tag, d.manifest_number, d.storage_path,
       'INHERITED from ' || r.certificate_on_package, r.found_at_depth
from v_certificate_resolved r
join metrc_documents d on d.doc_type = 'coa' and d.package_tag = r.certificate_on_package
where r.found_at_depth > 0

union all
-- 2b. COA reached by the LABORATORY'S OWN PAIRING - metrc_lab_results maps a
--     package_tag to a document_file_id per result row. This is the branch that was
--     missing; without it the certificate resolved and the PDF did not follow.
select d.id, d.metrc_id, d.doc_type, r.package_tag, d.manifest_number, d.storage_path,
       case when r.found_at_depth = 0 then 'LAB PAIRING'::text
            else 'LAB PAIRING via ' || r.certificate_on_package end,
       r.found_at_depth
from v_certificate_resolved r
join metrc_lab_results l on l.package_tag = r.certificate_on_package
                        and l.document_file_id is not null
join metrc_documents d on d.doc_type = 'coa' and d.metrc_id::text = l.document_file_id::text
where not exists (
  select 1 from metrc_documents d2
   where d2.doc_type = 'coa' and d2.package_tag = r.certificate_on_package)

union all
-- 3. MANIFEST -> every package that travelled on it
select d.id, d.metrc_id, d.doc_type, t.package_tag, d.manifest_number, d.storage_path,
       'ON MANIFEST'::text, 0
from metrc_documents d
join metrc_rpt_package_transfers t on t.manifest_number = d.manifest_number
where d.doc_type = 'manifest'

union all
-- 4. MANIFEST -> the package that arrived on it
select d.id, d.metrc_id, d.doc_type, p.tag, d.manifest_number, d.storage_path,
       'INBOUND on package record'::text, 0
from metrc_documents d
join (select distinct on (tag) tag, raw from metrc_packages order by tag, license) p
  on nullif(p.raw->>'ReceivedFromManifestNumber','') = d.manifest_number
where d.doc_type = 'manifest';

comment on view public.v_document_package_link is
  'Every document joined to every package it covers, four ways: filed directly, '
  'inherited through lineage, reached by the laboratory''s own package-to-document '
  'pairing in metrc_lab_results, and by manifest line. NO URL AND NO EXPIRY - '
  'storage_path is the permanent handle. A certificate and a manifest each cover '
  'MANY packages, which is why this is a link and not a column.';;
