-- Document Vault — real backend for src/screens/DocVault.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Replaces the screen's synthetic data (EMPLOYEES mock, seed()-generated
-- employee folders, SENSITIVE_DOCS mock array, MOCK_AUDIT trail, and the
-- localStorage-free in-memory upload stubs) with real relational storage
-- served through SECURITY DEFINER RPCs, matching the app's pin_login/anon
-- model (RLS ON, no anon table policies; definer RPCs bypass RLS).
--
-- REUSED (not rebuilt):
--   * get_roster(p_node_ids, p_actor)        -> employee folders (Tab 1 list)
--   * get_documents(p_node_ids)              -> sensitive documents (Tab 2 read)
--   * get_audit_log(...) / write_audit(...)  -> audit trail (Tab 3) + access logs
--   * public.documents                       -> sensitive docs storage (shared)
--   * public.app_audit_log                   -> audit events (shared)
--
-- NEW (no existing table fits per-person personnel files with present/missing
-- required-doc tracking):
--   * public.employee_documents + list/upload/log-access RPCs
--   * public.docvault_save_document          -> definer write into shared documents
--
-- Live-schema facts (verified 2026-07-17 against zsmdejhgdyyaakqsjhmk):
--   people(id uuid, full_name text, is_active bool)   -- NO node_id column
--   assignments(person_id, node_id, role_id, effective_from) -- location lives here
--   org_nodes(id uuid, name text, tenant_id uuid)   roles(id uuid, name text)
--   documents(id, tenant_id, node_id, name, type, content, category, location,
--             version, requires_ack, status, created_by_id, file_url, created_at)
--   app_audit_log(id, actor_id, actor_name, actor_role, action, target,
--             node_id, node_name, result, meta, created_at)
-- Idempotent — safe to re-run.

create extension if not exists pgcrypto;

-- ── Defensive column top-ups on shared tables (order-independent) ─────────────
-- documents: docvault_save_document writes these columns. The base table exists
-- (served by get_documents); ensure every column we touch is present so this
-- migration is self-contained regardless of whether the docmanager migration
-- has run yet.
alter table public.documents add column if not exists tenant_id     uuid;
alter table public.documents add column if not exists node_id       uuid;
alter table public.documents add column if not exists name          text;
alter table public.documents add column if not exists type          text;
alter table public.documents add column if not exists content       text;
alter table public.documents add column if not exists category      text;
alter table public.documents add column if not exists location      text;
alter table public.documents add column if not exists requires_ack  boolean not null default false;
alter table public.documents add column if not exists status        text not null default 'active';
alter table public.documents add column if not exists created_by_id uuid;
alter table public.documents add column if not exists created_at    timestamptz not null default now();

-- app_audit_log: node scoping column (also added by the auditlog migration).
alter table public.app_audit_log add column if not exists node_id uuid;

-- ── Table: per-person personnel documents (Tab 1 — Employee Records) ──────────
create table if not exists public.employee_documents (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  node_id          uuid,
  person_id        uuid not null,
  doc_type         text not null,
  title            text,
  file_url         text,
  uploaded_by_id   uuid,
  uploaded_by_name text,
  uploaded_at      timestamptz not null default now(),
  last_accessed_at timestamptz,
  last_accessed_by text
);
create index if not exists employee_documents_person_idx on public.employee_documents(person_id);
create index if not exists employee_documents_node_idx   on public.employee_documents(node_id);
alter table public.employee_documents enable row level security;

-- Resolve a person's current node from the latest assignment (helper inline).
-- ── Read: every stored personnel doc in scope (missing docs computed client) ──
create or replace function public.docvault_employee_docs(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',            d.id,
    'person_id',     d.person_id,
    'doc_type',      d.doc_type,
    'title',         coalesce(d.title, d.doc_type),
    'uploaded',      d.uploaded_at,
    'uploaded_by',   coalesce(d.uploaded_by_name, 'VIP HR'),
    'last_accessed', d.last_accessed_at,
    'present',       true
  ) order by d.uploaded_at desc), '[]'::jsonb)
  from public.employee_documents d
  where p_node_ids is null
     or d.node_id = any(p_node_ids)
     or d.node_id is null;
$$;
grant execute on function public.docvault_employee_docs(uuid[]) to anon, authenticated;

-- ── Write: upload/record a personnel doc for one employee ────────────────────
create or replace function public.docvault_upload_employee_doc(
  p_person_id  uuid,
  p_doc_type   text,
  p_title      text,
  p_file_url   text    default null,
  p_actor      uuid    default null,
  p_actor_name text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_id uuid; v_name text; v_node_name text;
begin
  if p_person_id is null then raise exception 'An employee is required'; end if;
  if coalesce(btrim(p_doc_type),'') = '' then raise exception 'A document type is required'; end if;

  -- Resolve the employee's current node from their latest assignment.
  select a.node_id into v_node
  from public.assignments a
  where a.person_id = p_person_id
  order by a.effective_from desc nulls last
  limit 1;

  if v_node is not null then
    select o.tenant_id, o.name into v_tenant, v_node_name from public.org_nodes o where o.id = v_node;
  end if;

  select full_name into v_name from public.people where id = p_person_id;

  insert into public.employee_documents
    (tenant_id, node_id, person_id, doc_type, title, file_url,
     uploaded_by_id, uploaded_by_name, uploaded_at)
  values
    (v_tenant, v_node, p_person_id, btrim(p_doc_type),
     coalesce(nullif(btrim(p_title),''), btrim(p_doc_type) || ' — ' || coalesce(v_name,'Employee')),
     p_file_url, p_actor, nullif(btrim(coalesce(p_actor_name,'')),''), now())
  returning id into v_id;

  -- Real audit entry so the Audit Trail tab reflects this upload.
  insert into public.app_audit_log
    (actor_id, actor_name, actor_role, action, target, node_id, node_name, result, meta)
  values
    (p_actor, nullif(btrim(coalesce(p_actor_name,'')),''), null,
     'Document Uploaded',
     coalesce(nullif(btrim(p_title),''), btrim(p_doc_type)) || ' — ' || coalesce(v_name,'Employee'),
     v_node, v_node_name, 'Success',
     jsonb_build_object('person_id', p_person_id, 'doc_type', p_doc_type, 'source', 'DocVault'));

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.docvault_upload_employee_doc(uuid,text,text,text,uuid,text) to anon, authenticated;

-- ── Write: log a view/download of a personnel doc (stamps last_accessed) ─────
create or replace function public.docvault_log_access(
  p_doc_id     uuid,
  p_action     text    default 'Document Viewed',
  p_actor      uuid    default null,
  p_actor_name text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_title text; v_node uuid; v_node_name text; v_person uuid; v_pname text;
begin
  if p_doc_id is null then raise exception 'A document is required'; end if;

  update public.employee_documents
     set last_accessed_at = now(),
         last_accessed_by = nullif(btrim(coalesce(p_actor_name,'')),'')
   where id = p_doc_id
  returning title, node_id, person_id into v_title, v_node, v_person;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select name into v_node_name from public.org_nodes where id = v_node;
  select full_name into v_pname from public.people where id = v_person;

  insert into public.app_audit_log
    (actor_id, actor_name, actor_role, action, target, node_id, node_name, result, meta)
  values
    (p_actor, nullif(btrim(coalesce(p_actor_name,'')),''), null,
     coalesce(nullif(btrim(p_action),''),'Document Viewed'),
     coalesce(v_title, 'Employee Document') ,
     v_node, v_node_name, 'Success',
     jsonb_build_object('doc_id', p_doc_id, 'person_id', v_person, 'source', 'DocVault'));

  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.docvault_log_access(uuid,text,uuid,text) to anon, authenticated;

-- ── Write: save a sensitive/legal document into the shared documents table ───
-- (Tab 2 — Sensitive Documents upload). Read back through the existing
-- get_documents RPC, so this only provides the write path.
create or replace function public.docvault_save_document(
  p_name       text,
  p_type       text,
  p_category   text,
  p_location   text,
  p_node_id    uuid    default null,
  p_content    text    default null,
  p_actor      uuid    default null,
  p_actor_name text    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_node uuid; v_tenant uuid; v_id uuid; v_node_name text;
begin
  if coalesce(btrim(p_name),'') = '' then raise exception 'Document title is required'; end if;

  v_node := p_node_id;
  if v_node is not null then
    select tenant_id, name into v_tenant, v_node_name from public.org_nodes where id = v_node;
  end if;
  if v_tenant is null then
    select id, tenant_id, name into v_node, v_tenant, v_node_name
    from public.org_nodes order by tenant_id limit 1;
  end if;

  insert into public.documents
    (tenant_id, node_id, name, type, category, location, content,
     requires_ack, status, created_by_id, created_at)
  values
    (v_tenant, v_node, btrim(p_name),
     coalesce(nullif(btrim(p_type),''),'contract'),
     coalesce(nullif(btrim(p_category),''),'Legal'),
     coalesce(nullif(btrim(p_location),''),'All'),
     p_content, true, 'active', p_actor, now())
  returning id into v_id;

  insert into public.app_audit_log
    (actor_id, actor_name, actor_role, action, target, node_id, node_name, result, meta)
  values
    (p_actor, nullif(btrim(coalesce(p_actor_name,'')),''), null,
     'Document Uploaded', btrim(p_name), v_node, v_node_name, 'Success',
     jsonb_build_object('doc_id', v_id, 'category', p_category, 'source', 'DocVault'));

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.docvault_save_document(text,text,text,text,uuid,text,uuid,text) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'docvault\_%';
-- select count(*) from public.employee_documents;
