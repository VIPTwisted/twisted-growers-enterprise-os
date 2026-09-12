-- GROK-WHY: Brand locker. Company marketing and brand files. Any type. Not Metrc.
-- Logos, ads, packaging, photos, video, gifs, zips, docs. Signed-in people can read.
-- No size cap on the bucket. Chat attach is separate. Ledger not rewritten.

insert into storage.buckets (id, name, public, file_size_limit)
values ('brand', 'brand', false, null)
on conflict (id) do update set public = false, file_size_limit = null;

create table if not exists public.brand_assets (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  area text not null,
  file_name text not null,
  content_type text,
  size_bytes bigint,
  storage_path text not null,
  url text,
  note text,
  uploaded_by uuid default auth.uid()
);

alter table public.brand_assets enable row level security;

drop policy if exists ba_read on public.brand_assets;
create policy ba_read on public.brand_assets for select to authenticated using (true);

drop policy if exists ba_write on public.brand_assets;
create policy ba_write on public.brand_assets for insert to authenticated with check (auth.uid() is not null);

grant select, insert on public.brand_assets to authenticated;

drop policy if exists brand_obj_select on storage.objects;
create policy brand_obj_select on storage.objects for select to authenticated using (bucket_id = 'brand');

drop policy if exists brand_obj_insert on storage.objects;
create policy brand_obj_insert on storage.objects for insert to authenticated with check (bucket_id = 'brand');

insert into public.nav_registry (
  category, category_order, subcategory, label, item_order, view_key,
  page_kind, enabled, description, range_kind, date_policy,
  module, surface, icon
)
select
  'Command',
  coalesce((select category_order from nav_registry where view_key = 'tower' limit 1), 1),
  'General',
  'Brand locker',
  coalesce((select max(item_order) from nav_registry where category = 'Command'), 0) + 1,
  'brand_locker',
  'custom',
  true,
  'Company logos, ads, packaging, photos, video, gifs, zips, docs. Any type. Not Metrc.',
  'activity',
  'not_applicable',
  'command',
  'side',
  'archive'
where not exists (select 1 from nav_registry where view_key = 'brand_locker');

insert into public.nav_role_visibility (view_key, role, visible)
select 'brand_locker', role, visible
  from public.nav_role_visibility
 where view_key = 'os_staff'
on conflict do nothing;
