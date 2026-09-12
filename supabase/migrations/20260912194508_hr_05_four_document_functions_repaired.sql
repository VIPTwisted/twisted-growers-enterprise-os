-- GROK-WHY: Already applied in production as 20260912194508 hr_05_four_document_functions_repaired.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- The only 4 of 776 VIP functions that would not create: documents.version is text, these SQL
-- functions declare integer. In VIP they were created before the column changed and are broken at
-- call time there too. Here the version is cast, so the Documents / Policies / Manual screens work.
set local search_path to hr, public, extensions;
create or replace function hr.get_documents(p_node_ids uuid[])
returns table(id uuid, node_id uuid, name text, type text, version integer, content text, file_url text, requires_ack boolean, status text, created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = hr, public, extensions as $$
  select id, node_id, name, type, nullif(regexp_replace(version, '[^0-9]', '', 'g'), '')::int, content, file_url, requires_ack, status, created_by, created_at, updated_at
  from hr.documents where node_id = any(p_node_ids) order by created_at desc
$$;
create or replace function hr.get_employee_manual(p_node_ids uuid[])
returns table(id uuid, name text, content text, file_url text, requires_ack boolean, version integer, created_at timestamptz)
language sql stable security definer set search_path = hr, public, extensions as $$
  select id, name, content, file_url, requires_ack, nullif(regexp_replace(version, '[^0-9]', '', 'g'), '')::int, created_at
  from hr.documents where node_id = any(p_node_ids) and type in ('handbook','policy','custom') and status = 'active' order by name
$$;
create or replace function hr.get_my_documents(p_person_id uuid, p_node_ids uuid[])
returns table(id uuid, name text, type text, version integer, content text, file_url text, requires_ack boolean, status text, acked_at timestamptz)
language sql stable security definer set search_path = hr, public, extensions as $$
  select d.id, d.name, d.type, nullif(regexp_replace(d.version, '[^0-9]', '', 'g'), '')::int, d.content, d.file_url, d.requires_ack, d.status, da.acked_at
  from hr.documents d left join hr.document_acknowledgments da on da.document_id = d.id and da.person_id = p_person_id
  where d.node_id = any(p_node_ids) order by d.created_at desc
$$;
create or replace function hr.get_policies(p_node_ids uuid[])
returns table(id uuid, name text, doc_type text, content text, file_url text, requires_ack boolean, status text, version integer, created_at timestamptz)
language sql stable security definer set search_path = hr, public, extensions as $$
  select id, name, type, content, file_url, requires_ack, status, nullif(regexp_replace(version, '[^0-9]', '', 'g'), '')::int, created_at
  from hr.documents where node_id = any(p_node_ids) and type in ('policy','sop','custom','handbook') order by created_at desc
$$;
delete from hr_import.log where kind = 'functions';
