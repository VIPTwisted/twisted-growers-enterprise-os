-- Employee Handbook Builder — real backend for src/screens/HandbookBuilder.jsx
-- HR brain project: zsmdejhgdyyaakqsjhmk
--
-- Replaces the screen's former localStorage persistence + seed()/EMPLOYEES
-- synthetic data with real relational tables served through SECURITY DEFINER
-- RPCs, matching the app's pin_login/anon model (RLS ON, no anon policies;
-- definer RPCs bypass RLS). Idempotent — safe to re-run.
--
-- Live-schema facts used (verified against get_roster / sibling migrations):
--   people(id uuid, full_name text, is_active bool)   -- NO node_id column
--   assignments(person_id, node_id, role_id, status, effective_from) -- location lives here
--   org_nodes(id, name, tenant_id)   roles(id, name)
--
-- The static POLICY and LAW-ALERT catalogs (reference text, like enum labels)
-- stay in the front end — same precedent as create_ct_compliance.sql. Only the
-- MUTABLE data persists here: handbook design/content/access/publish config,
-- signatures, per-employee read progress, and law-alert review status.

create extension if not exists pgcrypto;

-- ── Tables ───────────────────────────────────────────────────────────────────

-- One working handbook config document (single-tenant HR -> slug='default').
create table if not exists public.handbook_documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  slug          text not null default 'default',
  design        jsonb not null default '{}'::jsonb,   -- Tab 1 cover/typography/branding
  content       jsonb not null default '[]'::jsonb,   -- Tab 2 ordered items (dividers/custom/policy refs)
  access_matrix jsonb not null default '{}'::jsonb,   -- Tab 6 role -> feature visibility
  version       text  not null default '1.0',
  effective_date date,
  notes         text,
  audience      jsonb not null default '{}'::jsonb,   -- Tab 3 locations map
  require_sig   boolean not null default true,
  sig_deadline  date,
  status        text  not null default 'draft',       -- draft | published
  published_at  timestamptz,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (slug)
);

-- One acknowledgment per employee per handbook version.
create table if not exists public.handbook_signatures (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid,
  node_id        uuid,
  person_id      uuid not null,
  person_name    text,
  version        text,
  acknowledgment text,
  signed_at      timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  unique (person_id, version)
);
create index if not exists handbook_signatures_person_idx on public.handbook_signatures(person_id);

-- Per-employee "mark as read" progress against individual policy sections.
create table if not exists public.handbook_read_progress (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  person_id   uuid not null,
  policy_key  text not null,
  read_at     timestamptz not null default now(),
  unique (person_id, policy_key)
);
create index if not exists handbook_read_progress_person_idx on public.handbook_read_progress(person_id);

-- Review status for each static law-alert (keyed by the catalog's stable key).
create table if not exists public.handbook_law_alert_status (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid,
  alert_key  text not null,
  status     text not null default 'unreviewed',   -- unreviewed | reviewed | dismissed
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (alert_key)
);

alter table public.handbook_documents        enable row level security;
alter table public.handbook_signatures        enable row level security;
alter table public.handbook_read_progress     enable row level security;
alter table public.handbook_law_alert_status  enable row level security;

-- ── Helper: ensure the single default document row exists ────────────────────
create or replace function public._handbook_ensure_doc()
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if not exists (select 1 from public.handbook_documents where slug = 'default') then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
    insert into public.handbook_documents(tenant_id, slug) values (v_tenant, 'default')
    on conflict (slug) do nothing;
  end if;
end; $$;

-- ── Reads ────────────────────────────────────────────────────────────────────

-- The whole working document (design/content/access/publish fields).
create or replace function public.handbook_get_document()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'exists',        true,
       'design',        design,
       'content',       content,
       'access_matrix', access_matrix,
       'version',       version,
       'effective_date',effective_date,
       'notes',         notes,
       'audience',      audience,
       'require_sig',   require_sig,
       'sig_deadline',  sig_deadline,
       'status',        status,
       'published_at',  published_at,
       'updated_at',    updated_at
     )
     from public.handbook_documents where slug = 'default' limit 1),
    jsonb_build_object('exists', false)
  );
$$;

-- Every stored law-alert status as { alert_key: status }.
create or replace function public.handbook_get_law_status()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(alert_key, status), '{}'::jsonb)
  from public.handbook_law_alert_status;
$$;

-- Manager Signature Center roster: one row per employee in scope + sign status.
create or replace function public.handbook_signature_roster(p_node_ids uuid[])
returns jsonb language sql stable security definer set search_path = public as $$
  with ppl as (
    select distinct on (p.id)
      p.id                 as person_id,
      p.full_name          as full_name,
      a.node_id            as node_id,
      n.name               as location,
      coalesce(r.name,'—') as role
    from people p
    join assignments a on a.person_id = p.id
      and (p_node_ids is null or a.node_id = any(p_node_ids))
    join org_nodes n on n.id = a.node_id
    left join roles r on r.id = a.role_id
    where coalesce(p.is_active, true) = true
    order by p.id, a.effective_from desc nulls last
  ),
  sig as (
    select distinct on (person_id) person_id, version, signed_at
    from public.handbook_signatures
    order by person_id, signed_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id',      ppl.person_id,
    'name',           ppl.full_name,
    'location',       ppl.location,
    'role',           ppl.role,
    'signed_at',      s.signed_at,
    'signed_version', s.version,
    'status', case
        when s.person_id is null then 'pending'
        when (select version from public.handbook_documents where slug='default' limit 1) is null then 'signed'
        when s.version = (select version from public.handbook_documents where slug='default' limit 1) then 'signed'
        else 'outdated' end
  ) order by ppl.full_name), '[]'::jsonb)
  from ppl left join sig s on s.person_id = ppl.person_id;
$$;

-- Flat signature history (most recent first) for the Signature Center log.
create or replace function public.handbook_get_signatures()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id',   person_id,
    'person_name', person_name,
    'version',     version,
    'signed_at',   signed_at
  ) order by signed_at desc), '[]'::jsonb)
  from public.handbook_signatures;
$$;

-- One employee's read-progress (array of policy_key that are marked read).
create or replace function public.handbook_get_read(p_person_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(policy_key), '[]'::jsonb)
  from public.handbook_read_progress where person_id = p_person_id;
$$;

-- ── Writes ───────────────────────────────────────────────────────────────────

create or replace function public.handbook_save_design(p_design jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  perform public._handbook_ensure_doc();
  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  update public.handbook_documents
     set design     = coalesce(p_design, '{}'::jsonb),
         tenant_id  = coalesce(tenant_id, v_tenant),
         updated_by = p_actor,
         updated_at = now()
   where slug = 'default';
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.handbook_save_content(p_content jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._handbook_ensure_doc();
  update public.handbook_documents
     set content    = coalesce(p_content, '[]'::jsonb),
         updated_by = p_actor,
         updated_at = now()
   where slug = 'default';
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.handbook_save_access(p_access jsonb, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._handbook_ensure_doc();
  update public.handbook_documents
     set access_matrix = coalesce(p_access, '{}'::jsonb),
         updated_by    = p_actor,
         updated_at    = now()
   where slug = 'default';
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.handbook_publish(
  p_version text, p_effective_date date, p_notes text, p_audience jsonb,
  p_require_sig boolean, p_sig_deadline date, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._handbook_ensure_doc();
  update public.handbook_documents
     set version        = coalesce(nullif(p_version,''), version),
         effective_date = p_effective_date,
         notes          = p_notes,
         audience       = coalesce(p_audience, '{}'::jsonb),
         require_sig    = coalesce(p_require_sig, true),
         sig_deadline   = p_sig_deadline,
         status         = 'published',
         published_at   = now(),
         updated_by     = p_actor,
         updated_at     = now()
   where slug = 'default';
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.handbook_set_law_status(
  p_alert_key text, p_status text, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  if coalesce(btrim(p_alert_key),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing alert_key');
  end if;
  select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  insert into public.handbook_law_alert_status(tenant_id, alert_key, status, updated_by, updated_at)
  values (v_tenant, p_alert_key, coalesce(nullif(p_status,''),'unreviewed'), p_actor, now())
  on conflict (alert_key) do update
    set status     = excluded.status,
        updated_by = excluded.updated_by,
        updated_at = now();
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.handbook_sign(
  p_person_id uuid, p_person_name text, p_version text,
  p_node_id uuid default null, p_ack text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing person');
  end if;
  select tenant_id into v_tenant from public.org_nodes where id = p_node_id limit 1;
  if v_tenant is null then
    select tenant_id into v_tenant from public.org_nodes order by tenant_id limit 1;
  end if;
  insert into public.handbook_signatures(
    tenant_id, node_id, person_id, person_name, version, acknowledgment, signed_at)
  values (v_tenant, p_node_id, p_person_id, p_person_name,
          coalesce(nullif(p_version,''),'1.0'), p_ack, now())
  on conflict (person_id, version) do update
    set person_name    = excluded.person_name,
        acknowledgment = excluded.acknowledgment,
        node_id        = coalesce(excluded.node_id, handbook_signatures.node_id),
        signed_at      = now()
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'signed_at', now());
end; $$;

create or replace function public.handbook_mark_read(p_person_id uuid, p_policy_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_person_id is null or coalesce(btrim(p_policy_key),'') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing params');
  end if;
  insert into public.handbook_read_progress(person_id, policy_key, read_at)
  values (p_person_id, p_policy_key, now())
  on conflict (person_id, policy_key) do update set read_at = now();
  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (RPC-only surface; tables stay RLS-locked) ────────────────────────
grant execute on function public._handbook_ensure_doc()                                   to anon, authenticated;
grant execute on function public.handbook_get_document()                                  to anon, authenticated;
grant execute on function public.handbook_get_law_status()                                to anon, authenticated;
grant execute on function public.handbook_signature_roster(uuid[])                        to anon, authenticated;
grant execute on function public.handbook_get_signatures()                                to anon, authenticated;
grant execute on function public.handbook_get_read(uuid)                                  to anon, authenticated;
grant execute on function public.handbook_save_design(jsonb,uuid)                         to anon, authenticated;
grant execute on function public.handbook_save_content(jsonb,uuid)                        to anon, authenticated;
grant execute on function public.handbook_save_access(jsonb,uuid)                         to anon, authenticated;
grant execute on function public.handbook_publish(text,date,text,jsonb,boolean,date,uuid) to anon, authenticated;
grant execute on function public.handbook_set_law_status(text,text,uuid)                  to anon, authenticated;
grant execute on function public.handbook_sign(uuid,text,text,uuid,text)                  to anon, authenticated;
grant execute on function public.handbook_mark_read(uuid,text)                            to anon, authenticated;

-- Verify:
-- select proname from pg_proc where proname like 'handbook\_%';
