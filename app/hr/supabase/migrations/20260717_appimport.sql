-- Data Import backend (HR brain, project zsmdejhgdyyaakqsjhmk).
-- Powers src/screens/AppImport.jsx -> Import Center + Import History tabs.
-- The Data Sync tab reuses the existing hr_integrations backend
-- (see 20260716190000_create_integrations.sql) — no new sync tables here.
--
-- Idempotent — safe to re-run. RLS on; no anon table policies (all access via
-- SECURITY DEFINER RPCs granted to anon/authenticated).
--
-- Scoping: node_id is nullable. A NULL node_id row is an enterprise-wide import
-- (visible from every location); a non-null node_id scopes it to one location.
-- Reads accept p_node_ids and return NULL-node rows + matching-node rows.

create extension if not exists pgcrypto;

-- ── Table ─────────────────────────────────────────────────────────────────────
create table if not exists public.hr_import_jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid references public.org_nodes(id) on delete set null,
  template_key  text not null,                        -- employees|time-punches|sales|inventory|customers|training
  file_name     text not null default '',
  attempted     integer not null default 0,
  imported      integer not null default 0,
  failed        integer not null default 0,
  status        text not null default 'success',      -- success|warning|partial_error|error|pending
  errors        jsonb not null default '[]'::jsonb,   -- array of human-readable error strings
  imported_by   text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now()
);
create index if not exists hr_import_jobs_created_idx on public.hr_import_jobs (created_at desc);
create index if not exists hr_import_jobs_node_idx    on public.hr_import_jobs (node_id);

alter table public.hr_import_jobs enable row level security;

-- ── Read ──────────────────────────────────────────────────────────────────────
create or replace function public.hr_imports_list(
  p_node_ids uuid[] default null, p_limit integer default 200)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', j.id, 'node_id', j.node_id, 'template_key', j.template_key,
      'file_name', j.file_name, 'attempted', j.attempted, 'imported', j.imported,
      'failed', j.failed, 'status', j.status, 'errors', j.errors,
      'imported_by', j.imported_by, 'created_at', j.created_at
    ) as x
    from hr_import_jobs j
    where p_node_ids is null or j.node_id is null or j.node_id = any(p_node_ids)
    order by j.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ) t;
$$;

-- ── Write ─────────────────────────────────────────────────────────────────────
-- Records a real import job from a validated CSV upload. Counts + errors are
-- what the client actually parsed from the user's file — nothing fabricated.
create or replace function public.hr_import_record(
  p_node_id uuid, p_template_key text, p_file_name text,
  p_attempted integer, p_imported integer, p_failed integer,
  p_status text default 'success', p_errors jsonb default '[]'::jsonb,
  p_imported_by text default '', p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_template_key is null or length(btrim(p_template_key)) = 0 then
    return jsonb_build_object('ok', false, 'error', 'missing_template');
  end if;
  if p_node_id is not null then
    select tenant_id into v_tenant from org_nodes where id = p_node_id;
  end if;
  insert into hr_import_jobs
    (tenant_id, node_id, template_key, file_name, attempted, imported, failed,
     status, errors, imported_by, created_by)
  values
    (v_tenant, p_node_id, p_template_key, coalesce(p_file_name, ''),
     coalesce(p_attempted, 0), coalesce(p_imported, 0), coalesce(p_failed, 0),
     coalesce(p_status, 'success'), coalesce(p_errors, '[]'::jsonb),
     coalesce(p_imported_by, ''), p_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

-- ── Grants (execute-only on definer RPCs; no anon table policies) ─────────────
revoke all on function public.hr_imports_list(uuid[], integer) from public;
revoke all on function public.hr_import_record(uuid, text, text, integer, integer, integer, text, jsonb, text, uuid) from public;

grant execute on function public.hr_imports_list(uuid[], integer) to anon, authenticated;
grant execute on function public.hr_import_record(uuid, text, text, integer, integer, integer, text, jsonb, text, uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname in ('hr_imports_list','hr_import_record');
