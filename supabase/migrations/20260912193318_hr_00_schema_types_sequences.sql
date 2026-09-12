-- GROK-WHY: Already applied in production as 20260912193318 hr_00_schema_types_sequences.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- TG HR platform (line-for-line clone of vip-hr-hub, main @ 2026-07-17) — schema `hr`, SCHEMA ONLY, no VIP rows.
-- Owner direction 12 Sep 2026. Part 00: schema, extension, enums, sequences.
-- TG rule E6: nothing is granted to anon. The HR app signs in (OS session or an anonymous auth
-- session before the PIN step) so every call runs as `authenticated` and RLS decides.
create schema if not exists hr;
create extension if not exists ltree with schema extensions;
create type hr.node_type as enum ('portfolio', 'company', 'region', 'location', 'department', 'team', 'zone', 'custom');
create type hr.assignment_status as enum ('active', 'suspended', 'ended');
create type hr.doc_type as enum ('policy', 'handbook', 'memo', 'sop', 'notice', 'form', 'agreement', 'certificate', 'personal');
create type hr.doc_status as enum ('draft', 'published', 'archived');
create type hr.doc_delivery as enum ('fyi', 'read', 'acknowledge', 'sign');
create type hr.doc_priority as enum ('normal', 'important', 'urgent');
create type hr.doc_target_type as enum ('entity', 'node', 'role', 'lens', 'person', 'all_entity');
create type hr.doc_event_status as enum ('assigned', 'delivered', 'opened', 'read', 'acknowledged', 'signed', 'reacted', 'overdue', 'expired');
create sequence if not exists hr.incidents_number_seq;
create sequence if not exists hr.workers_comp_claim_seq;
grant usage on schema hr to authenticated, service_role;
alter default privileges in schema hr grant all on tables to authenticated, service_role;
alter default privileges in schema hr grant all on functions to authenticated, service_role;
alter default privileges in schema hr grant all on sequences to authenticated, service_role;
