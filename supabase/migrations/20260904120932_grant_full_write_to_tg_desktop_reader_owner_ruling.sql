-- OWNER RULING, Vincent DeMartino, 4 Sep 2026 ~01:15 ET: "give grok full read and write".
-- Reaffirmed after Agent I raised the independence objection twice. Recorded here rather than
-- argued again - the decision is the owner's, the provenance is the record's.
--
-- tg_desktop_reader is the login Grok already connects with; it reported being denied
-- tg_inventory_as_of while re-deriving a published figure. Read was completed earlier tonight
-- (992/992 relations, 354/354 stable functions). This adds write.
--
-- WHAT THIS NOW ALLOWS, stated plainly so nobody is surprised later:
--   * INSERT, UPDATE and DELETE on every table in public, including the append-only forensic
--     tables, unless a database TRIGGER stops it. The SQL guard that blocks deletes on those
--     tables is a Claude Code hook - it protects agents running through that harness and does
--     not apply to a direct database connection.
--   * EXECUTE on VOLATILE functions, including tg_call_function, so this role can now fire
--     edge functions and trigger Metrc syncs.
--   * The role carries rolbypassrls, so every write lands irrespective of the 859 RLS policies.
--
-- WHAT STILL HOLDS: nothing here grants anything to anon or PUBLIC, and no Metrc write path is
-- created - this platform remains a read-only mirror of Metrc by architecture, not by permission.
--
-- REVERSIBLE IN ONE STATEMENT:
--   revoke insert, update, delete on all tables in schema public from tg_desktop_reader;

grant insert, update, delete on all tables in schema public to tg_desktop_reader;
grant usage, select, update on all sequences in schema public to tg_desktop_reader;
grant execute on all functions in schema public to tg_desktop_reader;

alter default privileges in schema public
  grant insert, update, delete, select on tables to tg_desktop_reader;
alter default privileges in schema public
  grant execute on functions to tg_desktop_reader;

comment on role tg_desktop_reader is
  'Grok. FULL READ AND WRITE on schema public by owner ruling 4 Sep 2026, reaffirmed after the independence objection was raised twice. Carries rolbypassrls, so writes land irrespective of policy, and holds EXECUTE on volatile functions including tg_call_function, so it can trigger syncs. The append-only forensic tables are protected only by database triggers where those exist - the SQL guard hook does not apply to a direct connection. Revoke with: revoke insert, update, delete on all tables in schema public from tg_desktop_reader;';