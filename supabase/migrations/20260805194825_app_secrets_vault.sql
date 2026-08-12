create table if not exists app_secrets (
  key text primary key,
  value text not null,
  label text,
  help text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
-- Owners may write. NOBODY may read the value from the browser - only the server can.
drop policy if exists sec_write on app_secrets;
create policy sec_write on app_secrets for all to authenticated
  using (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role='owner'))
  with check (exists (select 1 from app_users u where u.user_id=auth.uid() and u.role='owner'));

-- Safe view: shows whether a key is set, never the key itself.
drop view if exists v_secret_status cascade;
create view v_secret_status as
select s.key, s.label, s.help,
  case when coalesce(s.value,'') = '' then 'NOT SET' else 'SET' end as status,
  case when coalesce(s.value,'') = '' then null
       else left(s.value,7)||'…'||right(s.value,4) end as masked,
  s.updated_at
from app_secrets s;

insert into app_secrets (key, value, label, help) values
 ('ANTHROPIC_API_KEY','','Artificial intelligence key',
  'Paste the key from console.anthropic.com. This is separate from your Claude subscription - a subscription does not cover this. Once pasted, the assistant can hold conversations. It is stored server side and can never be read back into a browser.')
on conflict (key) do nothing;

-- The server reads it. Nothing else can.
create or replace function tg_read_secret(p_key text)
returns text language sql security definer set search_path=public as $$
  select value from app_secrets where key = p_key;
$$;
revoke all on function tg_read_secret(text) from public, anon, authenticated;

create or replace function tg_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from app_users u where u.user_id=auth.uid() and u.role='owner') then
    raise exception 'Only an owner can set a key.';
  end if;
  insert into app_secrets (key, value, updated_by, updated_at)
  values (p_key, p_value, auth.uid(), now())
  on conflict (key) do update set value=excluded.value, updated_by=auth.uid(), updated_at=now();
end $$;

grant select on v_secret_status to authenticated;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Settings', (select category_order from nav_registry where view_key='settings'),
 'Keys & Connections', 24, 'key', 'app_secrets', 'v_secret_status',
 'Paste service keys here. Values are stored server side and can never be read back into a browser - this page only shows whether a key is set.', true, true, false
where not exists (select 1 from nav_registry where view_key='app_secrets');
insert into nav_role_visibility (view_key, role, visible)
select 'app_secrets','owner',true on conflict (view_key, role) do update set visible = true;;
