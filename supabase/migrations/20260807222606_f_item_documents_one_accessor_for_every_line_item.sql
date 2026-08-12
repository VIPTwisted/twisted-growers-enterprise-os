-- ONE ACCESSOR, CALLED FROM EVERY PAGE, FOR EVERY LINE ITEM.
-- Owner, 7 Aug 2026: "We only need the links attached to items, whenever and
-- wherever every page line item an item is on, so user can print, download and
-- email. That is all - shipping and receiving is responsible for emailing."
--
-- So: the platform ATTACHES and SERVES. It does not send. document_sends stays
-- empty by decision - see the comment on it below.
--
-- ⚠ EXPIRY CLIFF, FOUND BEFORE IT FIRED. All 3,666 stored download_url values are
-- signed for 30 days and expire 5-6 SEPTEMBER 2026 - together. Handing a page a
-- stored URL means every print and download button in the platform breaks on the
-- same day. This function therefore returns storage_path and bucket, and the FRONT
-- END must mint a signed URL at click time with createSignedUrl(). The stored
-- download_url is returned only as url_hint, with its expiry, and must never be
-- rendered directly into a link.
--
-- UNDO: drop function f_item_documents(text);

create or replace function public.f_item_documents(p_tag text)
returns jsonb
language sql stable as $$
select jsonb_build_object(
  'package_tag', p_tag,
  'bucket',      'metrc-documents',
  'note',        'Mint the link at click time: supabase.storage.from(bucket).createSignedUrl(storage_path, 3600). Never render url_hint - all stored URLs expire 5-6 Sep 2026.',
  'coa', coalesce((
     select jsonb_agg(jsonb_build_object(
              'document_id',   x.metrc_id,
              'storage_path',  x.storage_path,
              'file_name',     'COA ' || p_tag || '.pdf',
              'link_basis',    x.link_basis,
              'inherited',     x.link_depth > 0,
              'certificate_on', x.certificate_on,
              'lab',           x.lab,
              'client_name',   x.client_name,
              'client_license',x.client_license,
              'report_id',     x.lab_report_id,
              'report_date',   x.report_date,
              'url_hint',      x.download_url,
              'url_expires',   x.url_expires_at)
            order by x.link_depth, x.metrc_id)
     from (
       select d.metrc_id, d.storage_path, d.download_url, d.url_expires_at,
              l.link_basis, l.link_depth,
              nullif(split_part(l.link_basis, 'INHERITED from ', 2), '') as certificate_on,
              e.client_name, e.client_license, e.lab_report_id, e.report_date,
              (select max(r.lab_facility) from metrc_lab_results r
                where r.package_tag = d.package_tag) as lab
       from v_document_package_link l
       join metrc_documents d on d.id = l.document_id
       left join coa_extract e on e.document_id = d.metrc_id::text
       where l.package_tag = p_tag and l.doc_type = 'coa'
     ) x), '[]'::jsonb),
  'manifests', coalesce((
     select jsonb_agg(distinct jsonb_build_object(
              'manifest_number', y.manifest_number,
              'storage_path',    y.storage_path,
              'file_name',       'Manifest ' || y.manifest_number || '.pdf',
              'direction',       y.direction,
              'shipper',         y.shipper,
              'recipient',       y.recipient,
              'created',         y.created,
              'link_basis',      y.link_basis,
              'url_hint',        y.download_url,
              'url_expires',     y.url_expires_at))
     from (
       select d.manifest_number, d.storage_path, d.download_url, d.url_expires_at,
              l.link_basis, t.direction,
              t.raw->>'ShipperFacilityName'   as shipper,
              -- null on every outgoing record: Metrc returns the recipient on
              -- /transfers/v2/{id}/deliveries and the sync only pulled the header
              t.raw->>'RecipientFacilityName' as recipient,
              (t.raw->>'CreatedDateTime')::date as created
       from v_document_package_link l
       join metrc_documents d on d.id = l.document_id
       left join metrc_transfers t on t.manifest_number = d.manifest_number
       where l.package_tag = p_tag and l.doc_type = 'manifest'
     ) y), '[]'::jsonb)
);
$$;

comment on function public.f_item_documents(text) is
  'THE accessor for documents on a line item, callable from any page. Returns the '
  'certificate (direct or inherited, with the cultivator of record) and every '
  'manifest the item travelled on, ready to print, download or email. Returns '
  'storage_path, NOT a usable URL - mint that at click time, because every stored '
  'signed URL expires 5-6 Sep 2026. The platform serves documents; it does not send '
  'them - shipping and receiving email them.';

comment on table public.document_sends is
  'EMPTY BY DECISION - owner ruling 7 Aug 2026. Shipping and receiving email the '
  'COA and manifest to the customer themselves. The platform attaches and serves the '
  'documents; it does not send them and does not record sends. Do not populate this '
  'table or build a send flow against it without a new owner ruling.';;
