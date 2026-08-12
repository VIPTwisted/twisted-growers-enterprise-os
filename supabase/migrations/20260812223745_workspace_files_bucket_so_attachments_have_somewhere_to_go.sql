-- Agent I, 12 Aug 2026. DBI-083.
--
-- task_attachment records WHAT is attached; the bytes need somewhere to live. The project had
-- four buckets - assistant, avatars, metrc-documents, seeds - and none for workspace files, so
-- Attach had nowhere to write. Agent B disabled the control and said why rather than shipping a
-- button that fails on click, which was right.
--
-- PRIVATE, NOT PUBLIC. A public bucket serves every object to anyone with the URL, no sign-in.
-- Task attachments are internal company documents; public would be a leak with extra steps, and
-- tonight already produced four clear-text credential routes without help.
--
-- 25 MB CAP. Big enough for a photo of a damaged pallet or a signed PDF, small enough that nobody
-- uses task attachments as a video archive.
--
-- WHAT MUST NEVER GO IN HERE: a key, a token, a credential, or an export carrying one. Keys &
-- Connections is the only place a credential belongs, and it never hands one back.
--
-- UNDO: delete from storage.buckets where id = 'workspace-files' (only after emptying it);
--       drop the four policies below.

insert into storage.buckets (id, name, public, file_size_limit)
values ('workspace-files', 'workspace-files', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Any signed-in employee may read and attach. The workspace is shared by design: an attachment
-- only its uploader can see is a note to self, not a shared record. Deleting is narrower -
-- your own file, or an admin - because a document that can vanish without trace is not evidence.
drop policy if exists wsfiles_read   on storage.objects;
drop policy if exists wsfiles_write  on storage.objects;
drop policy if exists wsfiles_update on storage.objects;
drop policy if exists wsfiles_delete on storage.objects;

create policy wsfiles_read on storage.objects for select to authenticated
  using (bucket_id = 'workspace-files');

create policy wsfiles_write on storage.objects for insert to authenticated
  with check (bucket_id = 'workspace-files' and owner = auth.uid());

create policy wsfiles_update on storage.objects for update to authenticated
  using (bucket_id = 'workspace-files' and owner = auth.uid())
  with check (bucket_id = 'workspace-files' and owner = auth.uid());

create policy wsfiles_delete on storage.objects for delete to authenticated
  using (bucket_id = 'workspace-files' and (owner = auth.uid() or f_caller_is_admin()));

-- task_attachment.storage_path never recorded WHICH bucket, so a second bucket later would make
-- every existing path ambiguous. Naming it now costs nothing; discovering it later costs a
-- migration over live rows.
alter table task_attachment add column if not exists bucket text not null default 'workspace-files';

comment on column task_attachment.bucket is
 'Which storage bucket holds the bytes. Recorded explicitly because storage_path alone is '
 'ambiguous the moment a second bucket exists, and by then every existing row is already wrong.';;
