-- Theme Studio backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Persists the admin Theme Studio screen: one theme record per tenant holding
-- the CSS color-token overrides, typography settings, and the active preset id.
-- Self-contained: one new table + 3 SECURITY DEFINER RPCs. References only the
-- confirmed real columns (org_nodes.id / org_nodes.tenant_id), mirroring the
-- hr_nav_config pattern. Idempotent — safe to re-run.
-- RLS on; no anon policies (access is via the definer RPCs only).

create extension if not exists pgcrypto;

-- ── Table ─────────────────────────────────────────────────────────────────────
create table if not exists public.hr_theme_settings (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid,
  tokens       jsonb  not null default '{}'::jsonb,   -- CSS color-token overrides
  typography   jsonb  not null default '{}'::jsonb,   -- font family / size / spacing
  preset_id    text   not null default 'aurora-midnight',
  updated_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- One theme row per tenant (used by the upsert in hr_theme_save).
create unique index if not exists hr_theme_settings_tenant_uidx
  on public.hr_theme_settings (tenant_id);

alter table public.hr_theme_settings enable row level security;

-- ── Read: current theme for the actor's tenant ────────────────────────────────
create or replace function public.hr_theme_get(p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_row public.hr_theme_settings%rowtype;
begin
  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;

  select * into v_row
  from hr_theme_settings
  where tenant_id is not distinct from v_tenant
  limit 1;

  if not found then
    -- Honest empty: no saved theme yet → the UI falls back to Aurora defaults.
    return jsonb_build_object('ok', true, 'found', false,
      'tokens', '{}'::jsonb, 'typography', '{}'::jsonb, 'preset_id', null);
  end if;

  return jsonb_build_object('ok', true, 'found', true,
    'tokens', v_row.tokens, 'typography', v_row.typography,
    'preset_id', v_row.preset_id, 'updated_at', v_row.updated_at);
end; $$;

-- ── Write: upsert the tenant theme ────────────────────────────────────────────
create or replace function public.hr_theme_save(
  p_node_ids   uuid[],
  p_tokens     jsonb default null,
  p_typography jsonb default null,
  p_preset_id  text  default null,
  p_actor      uuid  default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;

  insert into hr_theme_settings (tenant_id, tokens, typography, preset_id, updated_by, updated_at)
  values (v_tenant,
          coalesce(p_tokens, '{}'::jsonb),
          coalesce(p_typography, '{}'::jsonb),
          coalesce(nullif(p_preset_id, ''), 'aurora-midnight'),
          p_actor, now())
  on conflict (tenant_id) do update
    set tokens     = coalesce(excluded.tokens, hr_theme_settings.tokens),
        typography = coalesce(excluded.typography, hr_theme_settings.typography),
        preset_id  = coalesce(excluded.preset_id, hr_theme_settings.preset_id),
        updated_by = excluded.updated_by,
        updated_at = now();

  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: reset (clear the theme → app falls back to Aurora defaults) ─────────
create or replace function public.hr_theme_reset(p_node_ids uuid[], p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant
  from org_nodes where id = any(coalesce(p_node_ids, '{}'::uuid[])) limit 1;
  delete from hr_theme_settings where tenant_id is not distinct from v_tenant;
  return jsonb_build_object('ok', true);
end; $$;

revoke all on function public.hr_theme_get(uuid[]) from public;
revoke all on function public.hr_theme_save(uuid[], jsonb, jsonb, text, uuid) from public;
revoke all on function public.hr_theme_reset(uuid[], uuid) from public;
grant execute on function public.hr_theme_get(uuid[]) to anon, authenticated;
grant execute on function public.hr_theme_save(uuid[], jsonb, jsonb, text, uuid) to anon, authenticated;
grant execute on function public.hr_theme_reset(uuid[], uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in
--   ('hr_theme_get','hr_theme_save','hr_theme_reset');
