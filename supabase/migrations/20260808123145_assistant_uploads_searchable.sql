/* FILES HANDED TO THE ASSISTANT IN CHAT. Owner, 8 August 2026: "users must be
   able to upload in chat to both the assistant and pet all documents, files, zip
   folders, images, videos", "in the chat area like i do here".

   A row per file, not just a blob in a bucket. The owner's standing requirement
   for every document on this platform is that it be findable later - "must fully
   be searchable on our system so that if vendor disputes bill or we need to pull
   it we have it". A file dropped into a chat and never recorded is a file nobody
   can find in November.

   THIS IS NOT THE PHONE 'files' CAPABILITY, which is refused. That one is the
   app reaching into someone's device and reading what it likes. This is a person
   deliberately handing over one file. Opposite things, and an assistant that
   confuses them will refuse an upload while citing a privacy rule that does not
   apply. */
create table if not exists assistant_uploads (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  user_id       uuid not null default auth.uid(),
  surface       text not null,
  file_name     text not null,
  content_type  text,
  size_bytes    bigint,
  storage_path  text not null,
  url           text,
  question      text,
  parsed_as     text,
  parse_note    text
);

comment on column assistant_uploads.surface is
  'pet or assistant. Recorded because the two used to behave differently and that difference was the bug - if these ever diverge again this column shows it.';
comment on column assistant_uploads.parsed_as is
  'coa | manifest | image | video | archive | document | null when nothing has read it yet. Set by whatever reads the file, never guessed from the extension alone.';

create index if not exists assistant_uploads_mine on assistant_uploads (user_id, at desc);
create index if not exists assistant_uploads_name on assistant_uploads (lower(file_name));

alter table assistant_uploads enable row level security;
drop policy if exists au_own on assistant_uploads;
create policy au_own on assistant_uploads for all
  using (user_id = (select auth.uid())
         or exists (select 1 from app_users u
                    where u.user_id = (select auth.uid()) and u.role in ('owner','executive')))
  with check (user_id = (select auth.uid()));;
