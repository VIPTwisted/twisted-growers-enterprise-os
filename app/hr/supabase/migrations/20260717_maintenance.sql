-- System Maintenance — real backend for src/screens/Maintenance.jsx (HR brain,
-- project zsmdejhgdyyaakqsjhmk).
--
-- The screen previously fabricated EVERYTHING: subsystem uptimes/response times
-- (Math.random jitter), storage-by-table stats, cleanup estimates, a mock audit
-- log (seed() generator), incidents, security alerts and active-user counts.
-- None of that was backed by the database. This migration authors the real,
-- measurable telemetry the screen now consumes:
--
--   * get_maintenance_storage()        — real per-table row counts + on-disk
--                                        sizes from pg_catalog / pg_stat.
--   * get_maintenance_health(node[])   — real 24h signals from app_audit_log
--                                        (events, failures, security events,
--                                        active users, last activity).
--   * system_incidents + get/log/resolve — real, node-scoped incident log
--                                        (honest-empty until something is logged).
--   * get_maintenance_cleanup_preview()/run_maintenance_cleanup() — real,
--                                        SAFE disposable-data cleanup with live
--                                        eligible-row counts and audited deletes.
--
-- REUSED (not rebuilt): app_audit_log + get_audit_log(text,text,text,int,uuid[])
-- and audit_dismissals from 20260717_auditlog.sql; org_nodes(id,name).
--
-- Access model matches every sibling HR RPC: SECURITY DEFINER,
-- SET search_path = public, RLS on the new table, no anon table policies,
-- EXECUTE granted to anon + authenticated (the app authenticates through
-- pin_login and calls RPCs under the anon role). Idempotent — safe to re-run.

create extension if not exists pgcrypto;

-- ── Real storage stats (Data Management → Storage by Table) ──────────────────
create or replace function public.get_maintenance_storage()
returns jsonb language sql stable security definer set search_path = public as $$
  with t as (
    select c.relname                              as name,
           coalesce(s.n_live_tup, c.reltuples)::bigint as rows,
           pg_total_relation_size(c.oid)          as size_bytes
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
  )
  select jsonb_build_object(
    'total_bytes', coalesce((select sum(size_bytes) from t), 0),
    'total_rows',  coalesce((select sum(greatest(rows, 0)) from t), 0),
    'table_count', (select count(*) from t),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'rows', greatest(rows, 0), 'size_bytes', size_bytes)
               order by size_bytes desc)
      from (select * from t order by size_bytes desc limit 30) x
    ), '[]'::jsonb)
  );
$$;
grant execute on function public.get_maintenance_storage() to anon, authenticated;

-- ── Real health signals (KPIs, health score, subsystem cards, security feed) ─
-- Derived entirely from the immutable app_audit_log. NULL/empty p_node_ids =
-- every node (exec view); node-less system events are always included so
-- platform-level activity is never hidden by location scope.
create or replace function public.get_maintenance_health(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select a.*
    from app_audit_log a
    where a.created_at >= now() - interval '24 hours'
      and (p_node_ids is null
           or array_length(p_node_ids, 1) is null
           or a.node_id = any(p_node_ids)
           or a.node_id is null)
  ),
  sec as (
    select id, created_at, actor_name, actor_role, action, target, node_name, result
    from scoped
    where lower(coalesce(result, '')) not in ('success', 'ok', '')
       or action ilike '%security%' or action ilike '%permission%'
       or action ilike '%denied%'   or action ilike '%failed%'
       or action ilike '%role%'     or action ilike '%delete%'
    order by created_at desc
    limit 25
  )
  select jsonb_build_object(
    'total_events_24h',    (select count(*) from scoped),
    'failed_events_24h',   (select count(*) from scoped
                             where lower(coalesce(result, '')) not in ('success', 'ok', '')),
    'security_events_24h', (select count(*) from sec),
    'active_users_15m',    (select count(distinct actor_id)
                             from app_audit_log
                             where created_at >= now() - interval '15 minutes'
                               and actor_id is not null
                               and (p_node_ids is null
                                    or array_length(p_node_ids, 1) is null
                                    or node_id = any(p_node_ids)
                                    or node_id is null)),
    'last_event_at',       (select max(created_at) from app_audit_log
                             where p_node_ids is null
                                or array_length(p_node_ids, 1) is null
                                or node_id = any(p_node_ids)
                                or node_id is null),
    'security_events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', id, 'ts', created_at, 'actor_name', actor_name,
               'actor_role', actor_role, 'action', action, 'target', target,
               'node_name', node_name, 'result', result))
      from sec), '[]'::jsonb)
  );
$$;
grant execute on function public.get_maintenance_health(uuid[]) to anon, authenticated;

-- ── Real, node-scoped system incident log ────────────────────────────────────
create table if not exists public.system_incidents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid references public.org_nodes(id) on delete set null,
  "system"      text    not null default '',
  severity      text    not null default 'medium',   -- low | medium | high
  description   text    not null default '',
  resolved      boolean not null default false,
  reported_by   uuid,
  reporter_name text,
  resolved_by   uuid,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.system_incidents enable row level security;
create index if not exists system_incidents_node_idx    on public.system_incidents (node_id);
create index if not exists system_incidents_created_idx on public.system_incidents (created_at desc);

create or replace function public.get_system_incidents(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', si.id, 'ts', si.created_at, 'system', si."system",
           'severity', si.severity, 'description', si.description,
           'resolved', si.resolved, 'reporter_name', si.reporter_name,
           'resolved_at', si.resolved_at, 'node_name', n.name)
           order by si.created_at desc), '[]'::jsonb)
  from system_incidents si
  left join org_nodes n on n.id = si.node_id
  where p_node_ids is null
     or array_length(p_node_ids, 1) is null
     or si.node_id = any(p_node_ids)
     or si.node_id is null;
$$;
grant execute on function public.get_system_incidents(uuid[]) to anon, authenticated;

create or replace function public.log_system_incident(
  p_system        text,
  p_description   text,
  p_severity      text default 'medium',
  p_node_id       uuid default null,
  p_reported_by   uuid default null,
  p_reporter_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if nullif(btrim(coalesce(p_description, '')), '') is null then
    raise exception 'description is required';
  end if;
  insert into system_incidents ("system", description, severity, node_id, reported_by, reporter_name)
  values (nullif(btrim(coalesce(p_system, '')), ''),
          btrim(p_description),
          lower(coalesce(nullif(btrim(coalesce(p_severity, '')), ''), 'medium')),
          p_node_id, p_reported_by,
          nullif(btrim(coalesce(p_reporter_name, '')), ''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.log_system_incident(text, text, text, uuid, uuid, text) to anon, authenticated;

create or replace function public.resolve_system_incident(
  p_id         uuid,
  p_actor_id   uuid default null,
  p_actor_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_id is null then raise exception 'incident id is required'; end if;
  update system_incidents
     set resolved = true, resolved_by = p_actor_id, resolved_at = now()
   where id = p_id;
  if not found then raise exception 'incident not found'; end if;
  return jsonb_build_object('ok', true, 'id', p_id);
end; $$;
grant execute on function public.resolve_system_incident(uuid, uuid, text) to anon, authenticated;

-- ── Real, SAFE cleanup (only disposable data; live eligible counts) ──────────
-- Preview returns actual eligible-row counts so the UI shows honest 0s and
-- disables tasks with nothing to do. Run performs the real delete and writes an
-- audit event. Deliberately limited to non-authoritative, disposable rows —
-- it never touches HR/business records.
create or replace function public.get_maintenance_cleanup_preview()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_array(
    jsonb_build_object(
      'task',  'resolved-incidents',
      'label', 'Purge Resolved Incidents',
      'desc',  'Resolved system incidents older than 90 days',
      'rows',  (select count(*) from system_incidents
                 where resolved and resolved_at < now() - interval '90 days')),
    jsonb_build_object(
      'task',  'old-dismissals',
      'label', 'Clear Old Alert Dismissals',
      'desc',  'Security-alert dismissals older than 180 days',
      'rows',  (select count(*) from audit_dismissals
                 where created_at < now() - interval '180 days'))
  );
$$;
grant execute on function public.get_maintenance_cleanup_preview() to anon, authenticated;

create or replace function public.run_maintenance_cleanup(
  p_task       text,
  p_actor_id   uuid default null,
  p_actor_name text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_del bigint := 0;
begin
  if p_task = 'resolved-incidents' then
    delete from system_incidents
      where resolved and resolved_at < now() - interval '90 days';
    get diagnostics v_del = row_count;
  elsif p_task = 'old-dismissals' then
    delete from audit_dismissals
      where created_at < now() - interval '180 days';
    get diagnostics v_del = row_count;
  else
    raise exception 'unknown cleanup task: %', p_task;
  end if;

  insert into app_audit_log (actor_id, actor_name, action, target, result, meta)
  values (p_actor_id,
          nullif(btrim(coalesce(p_actor_name, '')), ''),
          'Maintenance Cleanup', p_task, 'Success',
          jsonb_build_object('deleted', v_del));

  return jsonb_build_object('ok', true, 'task', p_task, 'deleted', v_del);
end; $$;
grant execute on function public.run_maintenance_cleanup(text, uuid, text) to anon, authenticated;
