-- Navigation Configuration backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Persists the admin Nav Config screen: per-tenant sidebar item overrides
-- (visibility + custom label) and the ordered header quick-links.
-- Self-contained: two new tables + 4 SECURITY DEFINER RPCs. References only
-- confirmed real columns (org_nodes.id/tenant_id). Idempotent — safe to re-run.
-- RLS on; no anon policies (access is via the definer RPCs only).

create extension if not exists pgcrypto;

-- ── Tables ────────────────────────────────────────────────────────────────────
create table if not exists public.hr_nav_config (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  item_path    text not null,                 -- the route ('to') this override targets
  visible      boolean not null default true,
  custom_label text not null default '',
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.hr_quick_links (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  position     int not null default 0,
  emoji        text not null default '📌',
  label        text not null default '',
  path         text not null default '/',
  updated_by   uuid,
  created_at   timestamptz not null default now()
);

alter table public.hr_nav_config  enable row level security;
alter table public.hr_quick_links enable row level security;

create index if not exists hr_nav_config_tenant_idx  on public.hr_nav_config  (tenant_id);
create index if not exists hr_quick_links_tenant_idx on public.hr_quick_links (tenant_id, position);

-- ── Read: current overrides + quick links for the actor's tenant ──────────────
create or replace function public.hr_nav_get(p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_nav jsonb; v_ql jsonb;
begin
  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;

  select coalesce(
           jsonb_object_agg(item_path,
             jsonb_build_object('visible', visible, 'customLabel', custom_label)),
           '{}'::jsonb)
    into v_nav
  from hr_nav_config
  where tenant_id is not distinct from v_tenant;

  select coalesce(
           jsonb_agg(
             jsonb_build_object('id', id, 'emoji', emoji, 'label', label, 'path', path)
             order by position),
           '[]'::jsonb)
    into v_ql
  from hr_quick_links
  where tenant_id is not distinct from v_tenant;

  return jsonb_build_object('ok', true, 'nav', v_nav, 'quick_links', v_ql);
end; $$;

-- ── Write: replace the full nav-override map for the tenant ────────────────────
create or replace function public.hr_nav_save(p_node_ids uuid[], p_config jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_key text; v_val jsonb; v_count int := 0;
begin
  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'missing_config');
  end if;

  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;

  delete from hr_nav_config where tenant_id is not distinct from v_tenant;

  for v_key, v_val in select * from jsonb_each(p_config) loop
    insert into hr_nav_config (tenant_id, item_path, visible, custom_label, updated_by, updated_at)
    values (v_tenant, v_key,
            coalesce((v_val->>'visible')::boolean, true),
            coalesce(v_val->>'customLabel', ''),
            p_actor, now());
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('ok', true, 'saved', v_count);
end; $$;

-- ── Write: replace the full ordered quick-links list for the tenant ───────────
create or replace function public.hr_quick_links_save(p_node_ids uuid[], p_links jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_el jsonb; v_pos int := 0;
begin
  if p_links is null or jsonb_typeof(p_links) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'missing_links');
  end if;

  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;

  delete from hr_quick_links where tenant_id is not distinct from v_tenant;

  for v_el in select * from jsonb_array_elements(p_links) loop
    insert into hr_quick_links (tenant_id, position, emoji, label, path, updated_by)
    values (v_tenant, v_pos,
            coalesce(nullif(v_el->>'emoji', ''), '📌'),
            coalesce(v_el->>'label', ''),
            coalesce(nullif(v_el->>'path', ''), '/'),
            p_actor);
    v_pos := v_pos + 1;
  end loop;

  return jsonb_build_object('ok', true, 'saved', v_pos);
end; $$;

-- ── Write: reset (clear all nav overrides → app falls back to defaults) ────────
create or replace function public.hr_nav_reset(p_node_ids uuid[], p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;
  delete from hr_nav_config where tenant_id is not distinct from v_tenant;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.hr_nav_get(uuid[]) from public;
revoke all on function public.hr_nav_save(uuid[], jsonb, uuid) from public;
revoke all on function public.hr_quick_links_save(uuid[], jsonb, uuid) from public;
revoke all on function public.hr_nav_reset(uuid[], uuid) from public;
grant execute on function public.hr_nav_get(uuid[]) to anon, authenticated;
grant execute on function public.hr_nav_save(uuid[], jsonb, uuid) to anon, authenticated;
grant execute on function public.hr_quick_links_save(uuid[], jsonb, uuid) to anon, authenticated;
grant execute on function public.hr_nav_reset(uuid[], uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in
--   ('hr_nav_get','hr_nav_save','hr_quick_links_save','hr_nav_reset');
