-- BRIDGE-DATA — a PRIVATE bucket for the Manifest Bridge source caches.
--
-- WHY: tools/load-manifest-bridge.mjs shipped in #152 reads source/manifest-bridge/data/,
-- which is 44 MB and deliberately NOT in the repository. A clone therefore cannot run the
-- loader - the script in git is a museum label. Grok's ruling, 8 Sep 2026: the data goes to
-- Supabase Storage in a private bucket and the loader reads BRIDGE_DATA_URL. No credential
-- and no 44 MB blob in git.
--
-- PRIVATE, and it must stay private: these caches carry customer names, licence numbers and
-- Apex invoice numbers. public=false means no anonymous URL exists at all; every read needs a
-- signed URL or the service role.
insert into storage.buckets (id, name, public, file_size_limit)
values ('bridge-data', 'bridge-data', false, 52428800)
on conflict (id) do update set public = false;

-- Only the service role writes, and only an admin may list/read through the API.
-- (service_role bypasses RLS entirely; these policies govern authenticated callers.)
drop policy if exists bridge_data_admin_read on storage.objects;
create policy bridge_data_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'bridge-data' and f_caller_is_admin());

drop policy if exists bridge_data_admin_write on storage.objects;
create policy bridge_data_admin_write on storage.objects
  for all to authenticated
  using (bucket_id = 'bridge-data' and f_caller_is_admin())
  with check (bucket_id = 'bridge-data' and f_caller_is_admin());
