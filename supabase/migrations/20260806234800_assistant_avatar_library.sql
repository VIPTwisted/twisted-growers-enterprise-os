/* A library of saved assistant faces.
   Replacing the picture used to leave the old one unreachable - the file stayed
   in storage but nothing pointed at it. Each face is kept here so it can be
   switched back to. avatar_url null means the drawn-in bot, which is always
   available and cannot be deleted. */
create table if not exists assistant_avatars (
  id          bigserial primary key,
  label       text not null,
  avatar_url  text,
  is_builtin  boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid()
);

/* Only one built-in row, and no duplicate faces. */
create unique index if not exists assistant_avatars_builtin_one
  on assistant_avatars ((true)) where is_builtin;
create unique index if not exists assistant_avatars_url_once
  on assistant_avatars (avatar_url) where avatar_url is not null;

alter table assistant_avatars enable row level security;

drop policy if exists aa_read on assistant_avatars;
create policy aa_read on assistant_avatars for select to authenticated using (true);

drop policy if exists aa_write on assistant_avatars;
create policy aa_write on assistant_avatars for all to authenticated
  using (exists (select 1 from app_users u
                 where u.user_id = auth.uid()
                   and u.role = any (array['owner'::app_role, 'executive'::app_role])))
  with check (exists (select 1 from app_users u
                      where u.user_id = auth.uid()
                        and u.role = any (array['owner'::app_role, 'executive'::app_role])));

grant select on assistant_avatars to authenticated;
grant insert, update, delete on assistant_avatars to authenticated;
grant usage, select on sequence assistant_avatars_id_seq to authenticated;

/* The drawn-in bot, always present. */
insert into assistant_avatars (label, avatar_url, is_builtin)
select 'Budz the bot (built in)', null, true
where not exists (select 1 from assistant_avatars where is_builtin);

/* Keep whatever face is in use today, so nothing is lost the first time the
   owner replaces it. */
insert into assistant_avatars (label, avatar_url)
select 'Saved on 6 August 2026', p.avatar_url
from assistant_profile p
where p.id = 1 and p.avatar_url is not null
on conflict do nothing;;
