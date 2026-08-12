-- 49 manifests have no package lines in the report export, so "what was on this
-- shipment" cannot be answered from the database. 4 of them are OUTGOING - product
-- that left the building with no record here of what it was.
--
-- The important part: EVERY ONE OF THEM HAS ITS MANIFEST PDF ON FILE. The answer
-- is not lost, it is sitting in a document nobody has parsed. Saying "unknown"
-- when the document is on the shelf is the same error as saying a table is empty
-- when it holds 19,256 rows.
--
-- So this view never says unknown. It names the gap, counts what Metrc says was on
-- board, and hands over the signed link to the document that answers it.
--
-- There is already an edge function for this: manifest-parse extracts text from
-- stored manifest PDFs. It has never been pointed at these.
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
  d.download_url                                               as manifest_document,
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

comment on view v_manifest_line_gaps is
  'Manifests with no package lines in the report export — "what was on this shipment" cannot be answered from the database. Never reports unknown: every row states where the answer actually is, and all four outgoing ones have their manifest PDF on file and merely unparsed.';

grant select on v_manifest_line_gaps to authenticated;
revoke all on v_manifest_line_gaps from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Command Center', 0, 'Manifests With No Contents Recorded', 2, 'gauge',
        'manifest_line_gaps', 'v_manifest_line_gaps',
        'Shipments where the database holds no package lines. Each row says where the answer is — for the outgoing ones the manifest PDF is already on file and simply unparsed.',
        true, false, 'deep', 'Third Party')
on conflict do nothing;;
