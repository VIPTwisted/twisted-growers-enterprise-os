-- GROK-WHY: Already applied in production as 20260912194536 hr_import_bridge_removed.
-- Another desk ran this. Filed here so migration-drift can pass and the Bots paid key can ship on Sync.
-- Exact SQL from supabase_migrations.schema_migrations.statements. No ledger rewrite. Metrc read-only.

-- The clone is loaded (251 tables, 776 functions, 287 FKs, 76 policies, 8 triggers, 0 rows); the fetch-and-execute bridge goes.
drop function if exists hr_import.apply(bigint);
drop function if exists hr_import.retry(text);
drop function if exists hr_import.fetch(text, int, int);
drop table if exists hr_import.requests;
drop table if exists hr_import.log;
drop schema if exists hr_import;
