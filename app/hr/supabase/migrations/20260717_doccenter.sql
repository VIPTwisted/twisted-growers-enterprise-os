-- Document Center — real backend for src/screens/DocCenter.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Replaces the screen's MOCK_DOCS / EMPLOYEES / MOCK_DIST synthetic arrays, the
-- seed() deterministic generators, the mock "AI analyzer", and the in-memory
-- setDocs() persistence with real relational tables served through SECURITY
-- DEFINER RPCs (RLS ON, no anon table policies; definer RPCs bypass RLS).
-- Idempotent — safe to re-run.
--
-- Why dedicated tables (not the existing `documents` table used by DocManager):
--   DocManager owns `documents` as a lightweight EDITOR model
--   (name/type/content/status/requires_ack). DocCenter is a distinct COMPLIANCE
--   LIBRARY: access levels, required-reads, per-recipient distribution log, and
--   per-employee/-location compliance — fields `documents` does not carry, plus
--   a distribution/compliance capability that exists NOWHERE in the schema.
--   Mapping DocCenter onto `documents` would silently drop category/version/
--   access/location on round-trip. A coherent dedicated backend matches the
--   repo's per-screen migration convention (contests/coverage/communications…).
--
-- Live-schema facts reused (verified against get_roster / handbook migration):
--   people(id uuid, full_name text, is_active bool)      -- NO node_id column
--   assignments(person_id, node_id, role_id, effective_from) -- location lives here
--   org_nodes(id uuid, name, tenant_id)   roles(id, name)
--
-- The CATEGORIES / ACCESS_LEVELS enum labels stay in the front end (reference
-- constants, same precedent as create_ct_compliance.sql / handbook static text).

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.hr_documents (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid,                                   -- null = All locations
  title          text not null,
  category       text not null default 'Policies',
  version        text not null default 'v1.0',
  access_level   text not null default 'All Employees',  -- All Employees | Managers Only | HR Only
  required       boolean not null default false,
  description    text,
  effective_date date,
  file_url       text,
  author         text,
  created_by     uuid,
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists hr_documents_node_idx on public.hr_documents(node_id);

-- One row per (document, recipient) — the distribution / required-read ledger.
create table if not exists public.hr_document_distributions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  document_id   uuid not null references public.hr_documents(id) on delete cascade,
  document_title text,
  person_id     uuid not null,
  person_name   text,
  node_id       uuid,
  location_name text,
  role_name     text,
  sig_required  boolean not null default false,
  sent_at       timestamptz not null default now(),
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (document_id, person_id)
);
create index if not exists hr_doc_dist_doc_idx    on public.hr_document_distributions(document_id);
create index if not exists hr_doc_dist_person_idx on public.hr_document_distributions(person_id);
create index if not exists hr_doc_dist_node_idx   on public.hr_document_distributions(node_id);

alter table public.hr_documents               enable row level security;
alter table public.hr_document_distributions  enable row level security;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- Document catalog for the Library / Reports tabs, with live read counts derived
-- from the distribution ledger. Scoped by location (node_id null = All = always
-- visible). Returns ALL docs incl. archived; the screen filters client-side.
create or replace function public.doccenter_list_documents(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with scoped as (
    select d.*
    from public.hr_documents d
    where d.node_id is null
       or p_node_ids is null
       or array_length(p_node_ids, 1) is null
       or d.node_id = any(p_node_ids)
  ),
  counts as (
    select document_id,
           count(*)                              as total_rec,
           count(*) filter (where completed_at is not null) as read_count
    from public.hr_document_distributions
    group by document_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',             s.id,
    'title',          s.title,
    'category',       s.category,
    'version',        s.version,
    'access',         s.access_level,
    'required',       s.required,
    'location',       coalesce(n.name, 'All'),
    'author',         coalesce(s.author, '—'),
    'description',    s.description,
    'effectiveDate',  s.effective_date,
    'file_url',       s.file_url,
    'archived',       s.archived,
    'updated',        (coalesce(s.updated_at, s.created_at))::date,
    'readCount',      coalesce(c.read_count, 0),
    'totalRec',       coalesce(c.total_rec, 0)
  ) order by s.updated_at desc), '[]'::jsonb)
  from scoped s
  left join public.org_nodes n on n.id = s.node_id
  left join counts c on c.document_id = s.id;
$$;

-- Per-recipient distribution ledger for the Distribution Log tab.
create or replace function public.doccenter_distribution_log(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',          dd.id,
    'docId',       dd.document_id,
    'docTitle',    dd.document_title,
    'recipient',   dd.person_name,
    'location',    dd.location_name,
    'sentDate',    dd.sent_at::date,
    'sigRequired', dd.sig_required,
    'completed',   (dd.completed_at is not null)
  ) order by dd.sent_at desc), '[]'::jsonb)
  from public.hr_document_distributions dd
  where dd.node_id is null
     or p_node_ids is null
     or array_length(p_node_ids, 1) is null
     or dd.node_id = any(p_node_ids);
$$;

-- Per-employee compliance for the Reports tab. Every active employee in scope
-- appears (0 required docs => honest empty), joined to their required-read
-- distributions.
create or replace function public.doccenter_employee_compliance(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with ppl as (
    select distinct on (p.id)
      p.id        as person_id,
      p.full_name as full_name,
      n.name      as location
    from people p
    join assignments a on a.person_id = p.id
      and (p_node_ids is null or array_length(p_node_ids,1) is null or a.node_id = any(p_node_ids))
    join org_nodes n on n.id = a.node_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  ),
  req as (
    select person_id,
           count(*) filter (where sig_required)                                   as total,
           count(*) filter (where sig_required and completed_at is not null)       as completed
    from public.hr_document_distributions
    group by person_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', ppl.person_id,
    'emp',       ppl.full_name,
    'location',  coalesce(ppl.location, '—'),
    'total',     coalesce(r.total, 0),
    'completed', coalesce(r.completed, 0),
    'overdue',   coalesce(r.total, 0) - coalesce(r.completed, 0),
    'pct',       case when coalesce(r.total,0) = 0 then 0
                      else round(coalesce(r.completed,0)::numeric * 100 / r.total) end
  ) order by ppl.full_name), '[]'::jsonb)
  from ppl left join req r on r.person_id = ppl.person_id;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

create or replace function public.doccenter_create_document(
  p_title text,
  p_category text default 'Policies',
  p_version text default 'v1.0',
  p_access text default 'All Employees',
  p_required boolean default false,
  p_node_id uuid default null,
  p_description text default null,
  p_effective_date date default null,
  p_author text default null,
  p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Title is required.');
  end if;
  if p_node_id is not null then
    select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  end if;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;
  insert into public.hr_documents(
    tenant_id, node_id, title, category, version, access_level, required,
    description, effective_date, author, created_by)
  values (
    v_tenant, p_node_id, btrim(p_title),
    coalesce(nullif(p_category,''),'Policies'),
    coalesce(nullif(p_version,''),'v1.0'),
    coalesce(nullif(p_access,''),'All Employees'),
    coalesce(p_required, false),
    nullif(btrim(coalesce(p_description,'')),''),
    p_effective_date,
    nullif(btrim(coalesce(p_author,'')),''),
    p_actor)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;

create or replace function public.doccenter_archive_document(
  p_document_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_document_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing document');
  end if;
  update public.hr_documents
     set archived = true, updated_at = now()
   where id = p_document_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'document not found');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- Distribute a document to an audience. p_role_filter: null|'manager'|'hr';
-- p_target_node: single location (null = all in scope). Creates one distribution
-- row per resolved recipient (idempotent per person via unique constraint).
create or replace function public.doccenter_distribute(
  p_document_id uuid,
  p_role_filter text default null,
  p_target_node uuid default null,
  p_sig_required boolean default false,
  p_node_ids uuid[] default null,
  p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_title text; v_count int;
begin
  if p_document_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing document');
  end if;
  select title into v_title from public.hr_documents where id = p_document_id limit 1;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'document not found');
  end if;

  with recips as (
    select distinct on (p.id)
      p.id        as person_id,
      p.full_name as full_name,
      a.node_id   as node_id,
      n.name      as location,
      r.name      as role_name,
      n.tenant_id as tenant_id
    from people p
    join assignments a on a.person_id = p.id
      and (p_node_ids is null or array_length(p_node_ids,1) is null or a.node_id = any(p_node_ids))
    join org_nodes n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
      and (p_target_node is null or a.node_id = p_target_node)
      and (
        p_role_filter is null
        or (p_role_filter = 'manager' and (
              coalesce(r.name,'') ilike '%manager%' or coalesce(r.name,'') ilike '%coo%'
           or coalesce(r.name,'') ilike '%owner%'   or coalesce(r.name,'') ilike '%admin%'
           or coalesce(r.name,'') ilike '%ceo%'))
        or (p_role_filter = 'hr' and coalesce(r.name,'') ilike '%hr%')
      )
    order by p.id, a.effective_from desc nulls last
  ),
  ins as (
    insert into public.hr_document_distributions(
      tenant_id, document_id, document_title, person_id, person_name,
      node_id, location_name, role_name, sig_required, sent_at)
    select tenant_id, p_document_id, v_title, person_id, full_name,
           node_id, location, role_name, coalesce(p_sig_required, false), now()
    from recips
    on conflict (document_id, person_id) do update
      set sent_at      = now(),
          sig_required = excluded.sig_required,
          document_title = excluded.document_title
    returning 1
  )
  select count(*) into v_count from ins;

  return jsonb_build_object('ok', true, 'count', v_count);
end; $$;

-- Mark a distribution complete (recipient acknowledged / read). Available for
-- future recipient-facing acknowledgment; keeps the ledger honest.
create or replace function public.doccenter_mark_complete(
  p_distribution_id uuid, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_distribution_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing distribution');
  end if;
  update public.hr_document_distributions
     set completed_at = now()
   where id = p_distribution_id and completed_at is null;
  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (RPC-only surface; tables stay RLS-locked) ────────────────────────
grant execute on function public.doccenter_list_documents(uuid[])                                 to anon, authenticated;
grant execute on function public.doccenter_distribution_log(uuid[])                                to anon, authenticated;
grant execute on function public.doccenter_employee_compliance(uuid[])                             to anon, authenticated;
grant execute on function public.doccenter_create_document(text,text,text,text,boolean,uuid,text,date,text,uuid) to anon, authenticated;
grant execute on function public.doccenter_archive_document(uuid,uuid)                             to anon, authenticated;
grant execute on function public.doccenter_distribute(uuid,text,uuid,boolean,uuid[],uuid)          to anon, authenticated;
grant execute on function public.doccenter_mark_complete(uuid,uuid)                                to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'doccenter\_%';
