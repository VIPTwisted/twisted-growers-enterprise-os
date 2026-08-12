-- OWNER RULING, on record in brain/CONTRADICTIONS.md: "I do not want expiry at
-- all on our OS."
--
-- metrc_documents.download_url is a PRE-SIGNED Supabase URL with url_expires_at
-- beside it. Eight pre-existing views were already flagged for serving one, with
-- a dated expiry of 5-6 September 2026. I read that ruling only after building,
-- and I had added THREE more views serving the same expiring URL — and worse,
-- discrepancy_register.document_link STORED one, freezing a countdown into a
-- table where it will certainly be dead by the time anyone opens it.
--
-- The clean pattern already exists in this database and I should have used it:
-- v_document_package_link and f_item_documents carry storage_path ONLY, no URL
-- and no token. That is what these now carry.
--
-- The permanent fix for the whole platform is still unbuilt and is not mine to
-- decide: an edge function at /functions/v1/document/coa/<id>.pdf that checks
-- the session and streams from the private bucket. Permanent, tokenless, and
-- no less private than today. Flagged, not quietly invented.
--
-- E1: CREATE OR REPLACE, new columns appended, none renamed or reordered.

create or replace view v_manifest_line_gaps as
select
  t.manifest_number,
  t.direction,
  t.created_on::date                                          as shipped_on,
  t.shipper,
  t.recipient,
  f_facility_type(
    coalesce(t.raw->>'RecipientFacilityLicenseNumber',
             t.raw->>'ShipperFacilityLicenseNumber'))          as counterparty_type,
  coalesce((t.raw->>'PackageCount')::int, 0)                   as packages_metrc_says,
  0                                                            as package_lines_we_hold,
  -- was d.download_url — a link that dies. The path never does.
  d.storage_path                                               as manifest_document,
  case
    when d.storage_path is not null
      then 'ANSWERABLE — the manifest PDF is on file. Nothing has parsed it. '
        || 'Run manifest-parse against this manifest and the '
        || coalesce((t.raw->>'PackageCount'), '?') || ' package lines can be recovered.'
    when d.fetch_error is not null
      then 'DOCUMENT FAILED TO DOWNLOAD — ' || left(d.fetch_error, 120)
    when d.id is not null
      then 'Document row exists but no file was ever stored.'
    else 'NO DOCUMENT AND NO LINES — this shipment has no record of its contents anywhere.'
  end                                                          as where_the_answer_is,
  case when t.direction = 'outgoing' then 1 else 2 end         as rank
from metrc_transfers t
left join metrc_documents d
       on d.manifest_number = t.manifest_number
      and d.doc_type ilike '%manifest%'
where not exists (
  select 1 from metrc_rpt_package_transfers r where r.manifest_number = t.manifest_number
);

-- The stored copy is the worst case: a countdown frozen into a table. Replace
-- every captured URL with the path, and stop capturing URLs at the sweep.
update discrepancy_register r
   set document_link = d.storage_path
  from metrc_documents d
 where r.document_link is not null
   and r.document_link like 'http%'
   and d.download_url = r.document_link;

update discrepancy_register
   set document_link = null
 where document_link like 'http%';

comment on column discrepancy_register.document_link is
  'STORAGE PATH in the private metrc-documents bucket, never a pre-signed URL. Owner ruling: no expiry anywhere in the OS. A URL stored here would be a countdown frozen into a table.';;
