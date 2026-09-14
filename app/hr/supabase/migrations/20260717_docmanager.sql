-- Document Manager — real backend for src/screens/DocManager.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Replaces the screen's synthetic data (MOCK_DOCS, MOCK_DISTRIBUTIONS,
-- MOCK_EMPLOYEES, seed()-generated I-9 & handbook rows) with real relational
-- tables served through SECURITY DEFINER RPCs, matching the app's
-- pin_login/anon model (RLS ON, no anon policies; definer RPCs bypass RLS).
-- Idempotent — safe to re-run.
--
-- Live-schema facts (verified against get_roster / handbook / ct_compliance):
--   people(id uuid, full_name text, is_active bool)   -- NO node_id column
--   assignments(person_id, node_id, role_id, effective_from) -- location lives here
--   org_nodes(id uuid, name text, tenant_id uuid)   roles(id uuid, name text)
--   documents(...) already exists (served by get_documents); this migration only
--   ADDS missing columns idempotently and layers tailored RPCs on top.
--
-- REUSED (not rebuilt): get_roster, handbook_signature_roster,
--   handbook_get_document (Handbook Acknowledgment tab).

create extension if not exists pgcrypto;

-- ── 0. Ensure the shared documents table has the columns this screen needs ────
create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid,
  name          text,
  type          text,
  content       text,
  requires_ack  boolean not null default false,
  status        text not null default 'active',
  created_by_id uuid,
  created_at    timestamptz not null default now()
);
alter table public.documents add column if not exists category   text;
alter table public.documents add column if not exists location    text;
alter table public.documents add column if not exists version     text;
alter table public.documents add column if not exists file_url     text;
alter table public.documents add column if not exists updated_at    timestamptz not null default now();
alter table public.documents add column if not exists requires_ack  boolean not null default false;
alter table public.documents add column if not exists status        text not null default 'active';
alter table public.documents enable row level security;

-- ── 1. Distributions (Distribute tab + Distribution Log) ─────────────────────
create table if not exists public.document_distributions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid,
  doc_id        uuid,
  doc_name      text,
  sent_by_id    uuid,
  sent_by_name  text,
  sent_to_label text,
  require_sig   boolean not null default false,
  due_date      date,
  message       text,
  sent_at       timestamptz not null default now()
);
create index if not exists document_distributions_node_idx on public.document_distributions(node_id);

create table if not exists public.document_distribution_recipients (
  id              uuid primary key default gen_random_uuid(),
  distribution_id uuid not null references public.document_distributions(id) on delete cascade,
  person_id       uuid,
  person_name     text,
  signed          boolean not null default false,
  signed_at       timestamptz,
  last_reminded_at timestamptz
);
create index if not exists document_distribution_recipients_dist_idx
  on public.document_distribution_recipients(distribution_id);

alter table public.document_distributions            enable row level security;
alter table public.document_distribution_recipients  enable row level security;

-- ── 2. I-9 employment-eligibility records (I-9 Expiry tab) ───────────────────
create table if not exists public.i9_records (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid,
  node_id          uuid,
  person_id        uuid not null,
  work_auth_type   text,
  original_i9_date date,
  reverify_date    date,
  notes            text,
  last_reminded_at timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (person_id)
);
create index if not exists i9_records_node_idx on public.i9_records(node_id);
alter table public.i9_records enable row level security;

-- ═════════════════════════════ RPCs: Library ════════════════════════════════

-- Full library list for the Document Manager, with live signature progress
-- computed from real distributions. Returns a jsonb array.
create or replace function public.docmanager_documents(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with prog as (
    select d.doc_id,
           count(*)                                  as total,
           count(*) filter (where r.signed)          as signed
    from public.document_distributions d
    join public.document_distribution_recipients r on r.distribution_id = d.id
    where d.doc_id is not null
    group by d.doc_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',           doc.id,
    'node_id',      doc.node_id,
    'name',         doc.name,
    'type',         coalesce(doc.type,'custom'),
    'category',     coalesce(doc.category,'Custom'),
    'location',     coalesce(doc.location,'All'),
    'version',      coalesce(doc.version,'1.0'),
    'status',       coalesce(doc.status,'active'),
    'requires_ack', coalesce(doc.requires_ack,false),
    'content',      doc.content,
    'file_url',     doc.file_url,
    'created_by',   coalesce(pe.full_name,'VIP HR'),
    'created_at',   doc.created_at,
    'signed',       coalesce(prog.signed,0),
    'total',        coalesce(prog.total,0)
  ) order by doc.created_at desc), '[]'::jsonb)
  from public.documents doc
  left join public.people pe  on pe.id = doc.created_by_id
  left join prog              on prog.doc_id = doc.id
  where p_node_ids is null or doc.node_id = any(p_node_ids) or doc.node_id is null;
$$;
grant execute on function public.docmanager_documents(uuid[]) to anon, authenticated;

-- Insert or update a library document. Returns the saved row (jsonb).
create or replace function public.docmanager_save(
  p_id           uuid,
  p_node_id      uuid,
  p_name         text,
  p_type         text,
  p_category     text,
  p_location     text,
  p_version      text,
  p_status       text,
  p_requires_ack boolean,
  p_content      text,
  p_actor        uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_node uuid; v_id uuid;
begin
  if coalesce(btrim(p_name),'') = '' then
    raise exception 'Document name is required';
  end if;
  v_node := p_node_id;
  select tenant_id into v_tenant from public.org_nodes where id = v_node;
  if v_tenant is null then
    select id, tenant_id into v_node, v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;

  if p_id is null then
    insert into public.documents
      (tenant_id, node_id, name, type, category, location, version, status,
       requires_ack, content, created_by_id, created_at, updated_at)
    values
      (v_tenant, v_node, p_name, coalesce(nullif(p_type,''),'custom'),
       coalesce(nullif(p_category,''),'Custom'), coalesce(nullif(p_location,''),'All'),
       coalesce(nullif(p_version,''),'1.0'), coalesce(nullif(p_status,''),'active'),
       coalesce(p_requires_ack,false), p_content, p_actor, now(), now())
    returning id into v_id;
  else
    update public.documents set
      name         = p_name,
      type         = coalesce(nullif(p_type,''), type),
      category     = coalesce(nullif(p_category,''), category),
      location     = coalesce(nullif(p_location,''), location),
      version      = coalesce(nullif(p_version,''), version),
      status       = coalesce(nullif(p_status,''), status),
      requires_ack = coalesce(p_requires_ack, requires_ack),
      content      = p_content,
      updated_at   = now()
    where id = p_id
    returning id into v_id;
  end if;

  return (
    select jsonb_build_object(
      'id', id, 'node_id', node_id, 'name', name, 'type', coalesce(type,'custom'),
      'category', coalesce(category,'Custom'), 'location', coalesce(location,'All'),
      'version', coalesce(version,'1.0'), 'status', coalesce(status,'active'),
      'requires_ack', coalesce(requires_ack,false), 'content', content,
      'file_url', file_url, 'created_by', 'VIP HR', 'created_at', created_at,
      'signed', 0, 'total', 0)
    from public.documents where id = v_id
  );
end; $$;
grant execute on function public.docmanager_save(uuid,uuid,text,text,text,text,text,text,boolean,text,uuid) to anon, authenticated;

create or replace function public.docmanager_delete(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  delete from public.documents where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.docmanager_delete(uuid) to anon, authenticated;

-- ═════════════════════════════ RPCs: Distribute ═════════════════════════════

-- Create a distribution and its recipient rows (recipients resolved on the
-- client from the real roster, passed as parallel person_id / name arrays).
create or replace function public.docmanager_distribute(
  p_doc_id        uuid,
  p_doc_name      text,
  p_node_id       uuid,
  p_sent_to_label text,
  p_require_sig   boolean,
  p_due_date      date,
  p_message       text,
  p_person_ids    uuid[],
  p_person_names  text[],
  p_actor         uuid default null,
  p_actor_name    text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_node uuid; v_dist uuid; i int;
begin
  if coalesce(btrim(p_doc_name),'') = '' then
    raise exception 'A document must be selected';
  end if;
  if p_person_ids is null or array_length(p_person_ids,1) is null then
    raise exception 'No recipients selected';
  end if;
  v_node := p_node_id;
  select tenant_id into v_tenant from public.org_nodes where id = v_node;
  if v_tenant is null then
    select id, tenant_id into v_node, v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;

  insert into public.document_distributions
    (tenant_id, node_id, doc_id, doc_name, sent_by_id, sent_by_name,
     sent_to_label, require_sig, due_date, message)
  values
    (v_tenant, v_node, p_doc_id, p_doc_name, p_actor, coalesce(p_actor_name,'VIP HR'),
     p_sent_to_label, coalesce(p_require_sig,false), p_due_date, p_message)
  returning id into v_dist;

  for i in 1 .. array_length(p_person_ids,1) loop
    insert into public.document_distribution_recipients
      (distribution_id, person_id, person_name, signed)
    values (v_dist, p_person_ids[i],
            coalesce(p_person_names[i],'Employee'), false);
  end loop;

  return jsonb_build_object('ok', true, 'id', v_dist,
    'total', array_length(p_person_ids,1));
end; $$;
grant execute on function public.docmanager_distribute(uuid,text,uuid,text,boolean,date,text,uuid[],text[],uuid,text) to anon, authenticated;

-- Distribution log with nested recipients + signed/total counts.
create or replace function public.docmanager_distributions(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(rec order by rec->>'sent_at' desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id',            d.id,
      'doc_id',        d.doc_id,
      'doc_name',      d.doc_name,
      'sent_by',       coalesce(d.sent_by_name,'VIP HR'),
      'sent_to_label', d.sent_to_label,
      'sent_at',       d.sent_at,
      'require_sig',   d.require_sig,
      'due_date',      d.due_date,
      'signed',        coalesce(count(r.id) filter (where r.signed),0),
      'total',         coalesce(count(r.id),0),
      'recipients',    coalesce(jsonb_agg(jsonb_build_object(
                          'name',      r.person_name,
                          'person_id', r.person_id,
                          'signed',    r.signed,
                          'signed_at', r.signed_at
                        ) order by r.person_name) filter (where r.id is not null), '[]'::jsonb)
    ) as rec
    from public.document_distributions d
    left join public.document_distribution_recipients r on r.distribution_id = d.id
    where p_node_ids is null or d.node_id = any(p_node_ids) or d.node_id is null
    group by d.id
  ) s;
$$;
grant execute on function public.docmanager_distributions(uuid[]) to anon, authenticated;

-- Mark a distribution's unsigned recipients as reminded (real persistence).
create or replace function public.docmanager_remind_distribution(p_distribution_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  update public.document_distribution_recipients
     set last_reminded_at = now()
   where distribution_id = p_distribution_id and signed = false;
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'reminded', v_count);
end; $$;
grant execute on function public.docmanager_remind_distribution(uuid) to anon, authenticated;

-- ═════════════════════════════ RPCs: I-9 Expiry ═════════════════════════════

-- Every I-9 record in scope, joined to the live roster, with status/days-until
-- computed server-side. Returns a jsonb array (empty when nothing recorded yet).
create or replace function public.i9_records_list(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',             i.id,
    'person_id',      i.person_id,
    'name',           coalesce(pe.full_name,'Employee'),
    'loc',            coalesce(n.name,'—'),
    'authType',       coalesce(i.work_auth_type,'—'),
    'origDate',       i.original_i9_date,
    'reVerifyDate',   i.reverify_date,
    'daysUntil',      case when i.reverify_date is null then null
                           else (i.reverify_date - current_date) end,
    'status',         case
                        when i.reverify_date is null then 'NA'
                        when (i.reverify_date - current_date) <= 7  then 'CRITICAL'
                        when (i.reverify_date - current_date) <= 30 then 'WARNING'
                        when (i.reverify_date - current_date) <= 60 then 'UPCOMING'
                        else 'VALID' end
  ) order by i.reverify_date nulls last), '[]'::jsonb)
  from public.i9_records i
  left join public.people pe on pe.id = i.person_id
  left join public.org_nodes n on n.id = i.node_id
  where p_node_ids is null or i.node_id = any(p_node_ids) or i.node_id is null;
$$;
grant execute on function public.i9_records_list(uuid[]) to anon, authenticated;

-- Create / update an I-9 record.
create or replace function public.i9_record_save(
  p_id             uuid,
  p_person_id      uuid,
  p_node_id        uuid,
  p_work_auth_type text,
  p_original_date  date,
  p_reverify_date  date,
  p_notes          text,
  p_actor          uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_node uuid; v_id uuid;
begin
  if p_person_id is null then raise exception 'An employee is required'; end if;
  v_node := p_node_id;
  select tenant_id into v_tenant from public.org_nodes where id = v_node;
  if v_tenant is null then
    select id, tenant_id into v_node, v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;

  insert into public.i9_records
    (tenant_id, node_id, person_id, work_auth_type, original_i9_date,
     reverify_date, notes, created_by, updated_at)
  values
    (v_tenant, v_node, p_person_id, p_work_auth_type, p_original_date,
     p_reverify_date, p_notes, p_actor, now())
  on conflict (person_id) do update set
    node_id          = excluded.node_id,
    work_auth_type   = excluded.work_auth_type,
    original_i9_date = excluded.original_i9_date,
    reverify_date    = excluded.reverify_date,
    notes            = excluded.notes,
    updated_at       = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end; $$;
grant execute on function public.i9_record_save(uuid,uuid,uuid,text,date,date,text,uuid) to anon, authenticated;

create or replace function public.i9_send_reminder(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update public.i9_records set last_reminded_at = now(), updated_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end; $$;
grant execute on function public.i9_send_reminder(uuid) to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'docmanager\_%' or proname like 'i9\_%';
