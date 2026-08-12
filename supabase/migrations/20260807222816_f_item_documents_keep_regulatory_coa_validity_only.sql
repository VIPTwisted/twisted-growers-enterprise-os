-- TWO DIFFERENT EXPIRIES. One is junk, one is law. Do not confuse them again.
--
-- 1. SIGNED-URL EXPIRY - REMOVED, and it should never have reached a record.
--    Nobody decided it. Supabase signed URLs simply carry a TTL by default, and
--    whoever generated ours took the default. It is a property of a temporary
--    ACCESS KEY, not of the document. All 3,666 happened to be signed together and
--    all expire 5-6 Sep 2026 - one day on which every print and download button in
--    the platform would have gone dead, with years of kept records unreachable
--    behind a stale token. The FILE never expires. Mint the key at click time.
--
-- 2. LAB RESULT VALIDITY - KEPT, because it is real. A Massachusetts certificate is
--    valid for one year from the test. Metrc carries it as ExpirationDateTime;
--    99,260 of 101,608 lab rows have one, running 2024-09-14 to 2027-08-06.
--    736 packages are already past it. Product cannot be sold on an expired
--    certificate, so this MUST be shown to whoever is about to ship.
--
-- coa_valid_until is therefore a compliance fact on the certificate. It has nothing
-- to do with whether the PDF can be opened - that works for ever.
-- UNDO: previous definition is in the preceding migration.

create or replace function public.f_item_documents(p_tag text)
returns jsonb
language sql stable as $$
select jsonb_build_object(
  'package_tag', p_tag,
  'bucket',      'metrc-documents',
  'how_to_link', 'supabase.storage.from(bucket).createSignedUrl(storage_path, ttl) at click time. The FILE is permanent - these records are kept and can be sent years later. Never store or cache a URL.',
  'coa', coalesce((
     select jsonb_agg(jsonb_build_object(
              'document_id',        x.metrc_id,
              'storage_path',       x.storage_path,
              'file_name',          'COA ' || p_tag || '.pdf',
              'inherited',          x.link_depth > 0,
              'certificate_on',     x.certificate_on,
              'lab',                x.lab,
              'cultivator',         x.client_name,
              'cultivator_license', x.client_license,
              'report_id',          x.lab_report_id,
              -- REGULATORY validity of the test result, not of the link
              'coa_valid_until',    x.valid_until,
              'coa_expired',        (x.valid_until is not null and x.valid_until < current_date))
            order by x.link_depth, x.metrc_id)
     from (
       select distinct on (d.metrc_id)
              d.metrc_id, d.storage_path, l.link_depth,
              nullif(split_part(l.link_basis, 'INHERITED from ', 2), '') as certificate_on,
              e.client_name, e.client_license, e.lab_report_id,
              (select max(r.lab_facility) from metrc_lab_results r
                where r.package_tag = d.package_tag) as lab,
              (select max((r.raw->>'ExpirationDateTime')::date) from metrc_lab_results r
                where r.package_tag = d.package_tag) as valid_until
       from v_document_package_link l
       join metrc_documents d on d.id = l.document_id
       left join coa_extract e on e.document_id = d.metrc_id::text
       where l.package_tag = p_tag and l.doc_type = 'coa'
       order by d.metrc_id, l.link_depth
     ) x), '[]'::jsonb),
  'manifests', coalesce((
     select jsonb_agg(jsonb_build_object(
              'manifest_number', y.manifest_number,
              'storage_path',    y.storage_path,
              'file_name',       'Manifest ' || y.manifest_number || '.pdf',
              'direction',       y.direction,
              'shipper',         y.shipper,
              'recipient',       y.recipient,
              'created',         y.created)
            order by y.created desc nulls last, y.manifest_number)
     from (
       select distinct on (d.manifest_number)
              d.manifest_number, d.storage_path, t.direction,
              t.raw->>'ShipperFacilityName'     as shipper,
              t.raw->>'RecipientFacilityName'   as recipient,   -- null on all outgoing
              (t.raw->>'CreatedDateTime')::date as created
       from v_document_package_link l
       join metrc_documents d on d.id = l.document_id
       left join metrc_transfers t on t.manifest_number = d.manifest_number
       where l.package_tag = p_tag and l.doc_type = 'manifest'
       order by d.manifest_number
     ) y), '[]'::jsonb)
);
$$;

comment on function public.f_item_documents(text) is
  'THE document accessor for a line item, callable from any page. Certificate '
  '(direct or inherited, with the cultivator of record) plus every manifest the item '
  'travelled on, deduplicated, ready to print, download or email. Returns '
  'storage_path only - NEVER a URL; records are permanent and sendable years later, '
  'a signed URL is cut at click time. coa_valid_until is the REGULATORY one-year '
  'validity of the lab result and has nothing to do with opening the file - product '
  'cannot be sold on an expired certificate. The platform serves documents, it does '
  'not send them.';;
