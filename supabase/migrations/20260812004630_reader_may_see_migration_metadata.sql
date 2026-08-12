-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-034 (reviewers V, X, W).
-- OWNER HARD RULE: Supa, git and Netlify deploy and sync together. The mirror tool
-- (tools/sync-migrations.mjs) was blocked because tg_desktop_reader cannot read
-- supabase_migrations. This grants THE READ-ONLY ROLE, READ-ONLY ACCESS, to MIGRATION METADATA
-- ONLY - SQL whose entire destination is the public repository. No table data, no write, no
-- widening of anything secret. This is not "loosening a guard to make a check pass": the
-- migration text is repo-bound by the owner's own rule, and the reader stays a reader.
-- UNDO: revoke usage on schema supabase_migrations from tg_desktop_reader;
--       revoke select on supabase_migrations.schema_migrations from tg_desktop_reader;

grant usage on schema supabase_migrations to tg_desktop_reader;
grant select on supabase_migrations.schema_migrations to tg_desktop_reader;;
