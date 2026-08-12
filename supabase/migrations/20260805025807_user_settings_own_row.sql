-- 0009 Per-user settings (theme etc.) — each user reads/writes ONLY their own row.
create table user_settings (
  user_id uuid primary key,
  theme text not null default 'dark' check (theme in ('dark','light')),
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
create policy own_settings on user_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());;
