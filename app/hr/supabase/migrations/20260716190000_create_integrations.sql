-- Integrations backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Powers src/screens/Integrations.jsx: connected third-party systems, data flows,
-- and sync/event logs. Idempotent — safe to re-run. RLS on; no anon policies
-- (all access via SECURITY DEFINER RPCs granted to anon/authenticated).
--
-- Scoping: node_id is nullable. A NULL node_id row is an enterprise-wide
-- integration/flow/log (visible to every location); a non-null node_id scopes it
-- to one location. Reads accept p_node_ids and return NULL-node rows + matches.

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────
create table if not exists public.hr_integrations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid references public.org_nodes(id) on delete cascade,
  provider_key  text not null,                       -- stable slug, e.g. 'adp'
  name          text not null,
  category      text not null default '',
  color         text not null default '#333',
  icon          text not null default '',
  description   text not null default '',
  sync_freq     text not null default '',
  direction     text not null default 'inbound',     -- inbound|outbound|bidirectional
  status        text not null default 'disconnected',-- connected|warning|disconnected
  config        jsonb not null default '{}'::jsonb,   -- endpoint_url, sync_frequency, has_api_key (never raw secrets)
  last_sync_at  timestamptz,
  records_count integer not null default 0,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists hr_integrations_node_provider_uidx
  on public.hr_integrations (coalesce(node_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_key);

create table if not exists public.hr_data_flows (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid references public.org_nodes(id) on delete cascade,
  integration_id  uuid references public.hr_integrations(id) on delete set null,
  source          text not null,
  dest            text not null,
  data_type       text not null default '',
  freq            text not null default '',
  enabled         boolean not null default true,
  last_success_at timestamptz,
  error_rate      numeric not null default 0,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.hr_integration_logs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid,
  node_id         uuid references public.org_nodes(id) on delete cascade,
  integration_id  uuid references public.hr_integrations(id) on delete cascade,
  event_type      text not null default 'sync',      -- sync|error|webhook|auth
  records         integer not null default 0,
  duration_ms     integer not null default 0,
  status          text not null default 'ok',        -- ok|error
  detail          text not null default '',
  created_by      uuid,
  created_at      timestamptz not null default now()
);
create index if not exists hr_integration_logs_created_idx on public.hr_integration_logs (created_at desc);
create index if not exists hr_integration_logs_int_idx     on public.hr_integration_logs (integration_id);

alter table public.hr_integrations     enable row level security;
alter table public.hr_data_flows       enable row level security;
alter table public.hr_integration_logs enable row level security;

-- ── Helper: does a node belong to the requested scope (or is it global)? ──────
-- Inlined in each RPC via: (node_id is null or node_id = any(p_node_ids))

-- ── Reads ─────────────────────────────────────────────────────────────────────
create or replace function public.hr_integrations_list(p_node_ids uuid[] default null)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', i.id, 'node_id', i.node_id, 'provider_key', i.provider_key,
      'name', i.name, 'category', i.category, 'color', i.color, 'icon', i.icon,
      'description', i.description, 'sync_freq', i.sync_freq, 'direction', i.direction,
      'status', i.status, 'config', i.config, 'last_sync_at', i.last_sync_at,
      'records_count', i.records_count
    ) as x
    from hr_integrations i
    where p_node_ids is null or i.node_id is null or i.node_id = any(p_node_ids)
  ) t;
$$;

create or replace function public.hr_flows_list(p_node_ids uuid[] default null)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', f.id, 'node_id', f.node_id, 'integration_id', f.integration_id,
      'source', f.source, 'dest', f.dest, 'data_type', f.data_type, 'freq', f.freq,
      'enabled', f.enabled, 'last_success_at', f.last_success_at,
      'error_rate', f.error_rate, 'created_at', f.created_at
    ) as x
    from hr_data_flows f
    where p_node_ids is null or f.node_id is null or f.node_id = any(p_node_ids)
  ) t;
$$;

create or replace function public.hr_logs_list(
  p_node_ids uuid[] default null, p_integration_id uuid default null,
  p_event_type text default null, p_limit integer default 100)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', l.id, 'integration_id', l.integration_id, 'integration_name', i.name,
      'event_type', l.event_type, 'records', l.records, 'duration_ms', l.duration_ms,
      'status', l.status, 'detail', l.detail, 'created_at', l.created_at
    ) as x
    from hr_integration_logs l
    left join hr_integrations i on i.id = l.integration_id
    where (p_node_ids is null or l.node_id is null or l.node_id = any(p_node_ids))
      and (p_integration_id is null or l.integration_id = p_integration_id)
      and (p_event_type is null or l.event_type = p_event_type)
    order by l.created_at desc
    limit greatest(coalesce(p_limit, 100), 1)
  ) t;
$$;

-- ── Writes: integrations ──────────────────────────────────────────────────────
create or replace function public.hr_integration_upsert(
  p_id uuid, p_node_id uuid, p_provider_key text, p_name text,
  p_category text default '', p_description text default '',
  p_sync_freq text default '', p_direction text default 'inbound',
  p_color text default '#333', p_icon text default '',
  p_config jsonb default '{}'::jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_name is null or length(btrim(p_name)) = 0
     or p_provider_key is null or length(btrim(p_provider_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if p_node_id is not null then
    select tenant_id into v_tenant from org_nodes where id = p_node_id;
  end if;
  if p_id is not null then
    update hr_integrations set
      node_id = p_node_id, provider_key = p_provider_key, name = p_name,
      category = coalesce(p_category, ''), description = coalesce(p_description, ''),
      sync_freq = coalesce(p_sync_freq, ''), direction = coalesce(p_direction, 'inbound'),
      color = coalesce(p_color, '#333'), icon = coalesce(p_icon, ''),
      config = coalesce(p_config, '{}'::jsonb), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  else
    insert into hr_integrations
      (tenant_id, node_id, provider_key, name, category, description, sync_freq,
       direction, color, icon, config, created_by)
    values
      (v_tenant, p_node_id, p_provider_key, p_name, coalesce(p_category,''),
       coalesce(p_description,''), coalesce(p_sync_freq,''), coalesce(p_direction,'inbound'),
       coalesce(p_color,'#333'), coalesce(p_icon,''), coalesce(p_config,'{}'::jsonb), p_actor)
    on conflict (coalesce(node_id, '00000000-0000-0000-0000-000000000000'::uuid), provider_key)
      do update set name = excluded.name, category = excluded.category,
        description = excluded.description, sync_freq = excluded.sync_freq,
        direction = excluded.direction, color = excluded.color, icon = excluded.icon,
        config = excluded.config, updated_at = now()
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- Set status (Test / Disconnect / Reconnect) and record a real event row.
create or replace function public.hr_integration_set_status(
  p_id uuid, p_status text, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_evt text; v_stat text; v_detail text;
begin
  if p_id is null or p_status is null then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  update hr_integrations
    set status = p_status,
        last_sync_at = case when p_status = 'connected' then now() else last_sync_at end,
        updated_at = now()
    where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- record an honest event describing what happened
  v_evt   := case when p_status = 'disconnected' then 'auth' else 'auth' end;
  v_stat  := case when p_status = 'connected' then 'ok' else 'error' end;
  v_detail:= case p_status
               when 'connected'    then 'Connection test succeeded'
               when 'warning'      then 'Connection test returned a warning'
               when 'disconnected' then 'Integration disconnected'
               else 'Status changed to ' || p_status end;
  insert into hr_integration_logs (node_id, integration_id, event_type, status, detail, created_by)
    select node_id, id, v_evt, v_stat, v_detail, p_actor from hr_integrations where id = p_id;
  return jsonb_build_object('ok', true, 'status', p_status);
end; $$;

create or replace function public.hr_integration_delete(p_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  delete from hr_integrations where id = p_id;
  select jsonb_build_object('ok', true);
$$;

-- ── Writes: data flows ────────────────────────────────────────────────────────
create or replace function public.hr_flow_upsert(
  p_id uuid, p_node_id uuid, p_integration_id uuid, p_source text, p_dest text,
  p_data_type text default '', p_freq text default '', p_enabled boolean default true,
  p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_source is null or length(btrim(p_source)) = 0
     or p_dest is null or length(btrim(p_dest)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_params');
  end if;
  if p_node_id is not null then select tenant_id into v_tenant from org_nodes where id = p_node_id; end if;
  if p_id is not null then
    update hr_data_flows set node_id = p_node_id, integration_id = p_integration_id,
      source = p_source, dest = p_dest, data_type = coalesce(p_data_type,''),
      freq = coalesce(p_freq,''), enabled = coalesce(p_enabled, true), updated_at = now()
    where id = p_id returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  else
    insert into hr_data_flows
      (tenant_id, node_id, integration_id, source, dest, data_type, freq, enabled, created_by)
    values (v_tenant, p_node_id, p_integration_id, p_source, p_dest,
            coalesce(p_data_type,''), coalesce(p_freq,''), coalesce(p_enabled,true), p_actor)
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.hr_flow_set_enabled(p_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update hr_data_flows set enabled = coalesce(p_enabled, true), updated_at = now() where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, true));
end; $$;

create or replace function public.hr_flow_delete(p_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  delete from hr_data_flows where id = p_id;
  select jsonb_build_object('ok', true);
$$;

-- ── Writes: logs ──────────────────────────────────────────────────────────────
create or replace function public.hr_log_add(
  p_integration_id uuid, p_node_id uuid, p_event_type text, p_records integer,
  p_duration_ms integer, p_status text, p_detail text, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into hr_integration_logs
    (node_id, integration_id, event_type, records, duration_ms, status, detail, created_by)
  values (p_node_id, p_integration_id, coalesce(p_event_type,'sync'),
          coalesce(p_records,0), coalesce(p_duration_ms,0),
          coalesce(p_status,'ok'), coalesce(p_detail,''), p_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.hr_log_retry(p_log_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update hr_integration_logs
    set status = 'ok', detail = 'Retry successful', created_by = coalesce(p_actor, created_by)
    where id = p_log_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (no anon table policies; execute-only on definer RPCs) ─────────────
revoke all on function public.hr_integrations_list(uuid[])                          from public;
revoke all on function public.hr_flows_list(uuid[])                                 from public;
revoke all on function public.hr_logs_list(uuid[], uuid, text, integer)             from public;
revoke all on function public.hr_integration_upsert(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, uuid) from public;
revoke all on function public.hr_integration_set_status(uuid, text, uuid)           from public;
revoke all on function public.hr_integration_delete(uuid)                           from public;
revoke all on function public.hr_flow_upsert(uuid, uuid, uuid, text, text, text, text, boolean, uuid) from public;
revoke all on function public.hr_flow_set_enabled(uuid, boolean)                    from public;
revoke all on function public.hr_flow_delete(uuid)                                  from public;
revoke all on function public.hr_log_add(uuid, uuid, text, integer, integer, text, text, uuid) from public;
revoke all on function public.hr_log_retry(uuid, uuid)                              from public;

grant execute on function public.hr_integrations_list(uuid[])                          to anon, authenticated;
grant execute on function public.hr_flows_list(uuid[])                                 to anon, authenticated;
grant execute on function public.hr_logs_list(uuid[], uuid, text, integer)             to anon, authenticated;
grant execute on function public.hr_integration_upsert(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.hr_integration_set_status(uuid, text, uuid)           to anon, authenticated;
grant execute on function public.hr_integration_delete(uuid)                           to anon, authenticated;
grant execute on function public.hr_flow_upsert(uuid, uuid, uuid, text, text, text, text, boolean, uuid) to anon, authenticated;
grant execute on function public.hr_flow_set_enabled(uuid, boolean)                    to anon, authenticated;
grant execute on function public.hr_flow_delete(uuid)                                  to anon, authenticated;
grant execute on function public.hr_log_add(uuid, uuid, text, integer, integer, text, text, uuid) to anon, authenticated;
grant execute on function public.hr_log_retry(uuid, uuid)                              to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in
--   ('hr_integrations_list','hr_flows_list','hr_logs_list','hr_integration_upsert',
--    'hr_integration_set_status','hr_integration_delete','hr_flow_upsert',
--    'hr_flow_set_enabled','hr_flow_delete','hr_log_add','hr_log_retry');
