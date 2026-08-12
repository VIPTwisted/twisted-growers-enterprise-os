-- NO EXPIRY ANYWHERE ON THIS OS. Owner ruling, 7 Aug 2026.
--
-- Rather than rewrite three views and risk the dashboards, replace what the column
-- CONTAINS. Every view that reads metrc_documents.download_url - v_document_library,
-- v_product_identity, v_customer_manifests - now serves a permanent, tokenless URL
-- with no change to a single view definition and nothing to break.
--
-- Before: .../storage/v1/object/sign/metrc-documents/coa/2267739.pdf?token=eyJ...  (dies 5-6 Sep 2026)
-- After:  .../functions/v1/document?path=coa/2267739.pdf                           (permanent)
--
-- The bucket stays PRIVATE. The document function has verify_jwt on, so the caller
-- must be a signed-in user; it then reads the file with the service role and streams
-- it. Permanence and privacy, not a trade-off.
--
-- url_expires_at is set to null because there is no longer anything to expire.
-- UNDO: nothing is lost - a signed URL can be regenerated from storage_path at any
-- time. The old tokens were going to die in four weeks regardless.

create or replace function public.f_document_url(p_storage_path text, p_download boolean default false)
returns text language sql immutable as $$
  select case when p_storage_path is null then null else
    'https://fxetuqjryttnypgepsru.supabase.co/functions/v1/document?path='
    || p_storage_path || case when p_download then '&download=1' else '' end
  end;
$$;

comment on function public.f_document_url(text, boolean) is
  'Permanent, tokenless URL for a stored document. NEVER EXPIRES - these records are '
  'kept and can be sent years later. Pass download=true to force save-as instead of '
  'opening inline for print. Never use createSignedUrl for platform pages: it '
  'REQUIRES an expiry, which is how 3,666 links came to die on the same day.';

update metrc_documents
   set download_url   = f_document_url(storage_path),
       url_expires_at = null
 where storage_path is not null;

comment on column metrc_documents.download_url is
  'PERMANENT tokenless URL to the document function. Never expires. Was a 30-day '
  'pre-signed storage URL - all 3,666 were signed together and would have died on '
  '5-6 Sep 2026, taking every print and download button with them. Supabase''s '
  'createSignedUrl REQUIRES an expiry, so nobody chose 30 days - the API forced a '
  'number. Rebuild with f_document_url(storage_path).';
comment on column metrc_documents.url_expires_at is
  'ALWAYS NULL. Kept only so existing views do not break. There is no expiry on any '
  'document in this OS - the records are permanent and sendable years later.';;
