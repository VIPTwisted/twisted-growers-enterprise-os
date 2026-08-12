-- NO EXPIRY. Owner, 7 Aug 2026: "These records are kept and can be sent years later."
--
-- A COA or manifest is a permanent business and compliance record. The FILE never
-- expires - it sits in the metrc-documents bucket for good. Only a signed URL is
-- temporary, and a signed URL is not a record, it is a key you cut on demand.
--
-- So this function no longer returns url_hint or url_expires AT ALL. They were an
-- expiring artefact leaking into a permanent contract, and every stored URL happens
-- to expire 5-6 Sep 2026 - which would have broken every print and download button
-- in the platform on the same day, years of records made unreachable by a dead token.
--
-- The page calls:
--    supabase.storage.from('metrc-documents').createSignedUrl(storage_path, ttl)
-- at the moment the user clicks print, download or email. Always fresh, never
-- expired, works identically in 2030.
--
-- Manifests are deduplicated by manifest_number: the same manifest reaches a package
-- by more than one route (on the manifest line AND on the package's inbound record)
-- and must appear ONCE to the user.
-- UNDO: the previous definition is in the preceding migration.

create or replace function public.f_item_documents(p_tag text)
returns jsonb
language sql stable as $$
select jsonb_build_object(
  'package_tag', p_tag,
  'bucket',      'metrc-documents',
  'how_to_link', 'supabase.storage.from(bucket).createSignedUrl(storage_path, ttl) at click time. The FILE is permanent - these records are kept and can be sent years later. Never store or cache a URL.',
  'coa', coalesce((
     select jsonb_agg(jsonb_build_object(
              'document_id',    x.metrc_id,
              'storage_path',   x.storage_path,
              'file_name',      'COA ' || p_tag || '.pdf',
              'inherited',      x.link_depth > 0,
              'certificate_on', x.certificate_on,
              'lab',            x.lab,
              'cultivator',     x.client_name,
              'cultivator_license', x.client_license,
              'report_id',      x.lab_report_id)
            order by x.link_depth, x.metrc_id)
     from (
       select distinct on (d.metrc_id)
              d.metrc_id, d.storage_path, l.link_depth,
              nullif(split_part(l.link_basis, 'INHERITED from ', 2), '') as certificate_on,
              e.client_name, e.client_license, e.lab_report_id,
              (select max(r.lab_facility) from metrc_lab_results r
                where r.package_tag = d.package_tag) as lab
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
              -- NULL on every outgoing record. Metrc returns the recipient on
              -- /transfers/v2/{id}/deliveries; the sync has only ever pulled the
              -- header. The manifest PDF prints it and 2,683 are on disk.
              t.raw->>'RecipientFacilityName'   as recipient,
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
  'THE document accessor for a line item, callable from any page. Returns the '
  'certificate (direct or inherited, with the cultivator of record) and every '
  'manifest the item travelled on, deduplicated, ready to print, download or email. '
  'Returns storage_path only - NEVER a URL. These records are permanent and can be '
  'sent years later; a signed URL is not a record, it is cut at click time. The '
  'platform serves documents, it does not send them - shipping and receiving email '
  'them.';;
