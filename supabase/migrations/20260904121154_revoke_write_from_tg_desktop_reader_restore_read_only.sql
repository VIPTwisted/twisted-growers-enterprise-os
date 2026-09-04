-- OWNER RULING, 4 Sep 2026: reverse the write grant on tg_desktop_reader ("the leaked reader")
-- and give the MCP read-only role the two functions it is missing. Executed as supplied, plus
-- two closures the supplied SQL does not reach - both of them defects I introduced an hour ago:
--
--   (a) ALTER DEFAULT PRIVILEGES. My grant migration set default privileges so that every table
--       created in public from that point on would be INSERT/UPDATE/DELETE-able by
--       tg_desktop_reader. A REVOKE on existing tables does not touch that. Left in place it
--       would silently re-grant write on every new table forever. Reversed here.
--   (b) GRANT EXECUTE ON ALL FUNCTIONS. My grant covered all 581 functions including the 227
--       VOLATILE ones. Revoking tg_call_function alone leaves the other 226 executable. This
--       revokes execute wholesale and re-grants only STABLE/IMMUTABLE, restoring exactly the
--       read-only state that existed before the write grant.

revoke insert, update, delete on all tables in schema public from tg_desktop_reader;
revoke usage, update on all sequences in schema public from tg_desktop_reader;
revoke execute on function public.tg_call_function(text, jsonb) from tg_desktop_reader;

alter default privileges in schema public
  revoke insert, update, delete on tables from tg_desktop_reader;
alter default privileges in schema public
  revoke execute on functions from tg_desktop_reader;

revoke execute on all functions in schema public from tg_desktop_reader;

do $$
declare f record; n int := 0;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public' and p.provolatile in ('s','i')
  loop
    execute format('grant execute on function %s to tg_desktop_reader', f.sig);
    n := n + 1;
  end loop;
  raise notice 're-granted execute on % read-only functions', n;
end $$;

grant execute on function public.tg_inventory_as_of(date) to supabase_read_only_user;
grant execute on function public.f_to_pounds(numeric, text) to supabase_read_only_user;

comment on role tg_desktop_reader is
  'Read-only. SELECT on all of public and EXECUTE on STABLE/IMMUTABLE functions only. Write was granted 4 Sep 2026 by owner ruling and REVOKED the same night on owner instruction after the credential was identified as leaked. No INSERT/UPDATE/DELETE, no execute on VOLATILE functions, no tg_call_function, no default privileges. Note it still carries rolbypassrls, so it reads every row irrespective of policy - that predates tonight and is unchanged.';