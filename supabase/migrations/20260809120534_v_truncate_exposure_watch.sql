/* IT WILL COME BACK IF NOBODY WATCHES.

   Default privileges are fixed for the postgres path, but NOT for supabase_admin
   - that statement was refused because this connection is not that role. A table
   created through the Supabase dashboard can therefore still arrive carrying
   TRUNCATE for anon, and it would do so silently, one table at a time.

   A revoke is a moment. A view is a standing question. This one answers "can
   anything browser-facing empty a table" every time it is read, and it names the
   tables rather than returning a count - a number tells you there is a problem,
   a list tells you which. */
create or replace view v_truncate_exposure as
select g.table_name,
       string_agg(distinct g.grantee, ', ' order by g.grantee) as browser_facing_roles,
       exists (
         select 1 from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = g.table_name and not t.tgisinternal
       ) as has_a_trigger_truncate_would_bypass
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.privilege_type = 'TRUNCATE'
  and g.grantee in ('anon', 'authenticated', 'PUBLIC')
group by g.table_name
order by 3 desc, 1;

comment on view v_truncate_exposure is
  'Any table a browser-facing role can EMPTY. Should always be zero rows. TRUNCATE does not fire row triggers, so it walks straight past the append-only guard on watchdog_findings, issue_decisions and verification_runs - has_a_trigger_truncate_would_bypass marks exactly those. Revoked wholesale on 8 Aug 2026 when anon held it on 146 tables and authenticated on 592; this view exists because default privileges for supabase_admin could not be changed from that connection, so a table created via the dashboard can still reinherit it.';

grant select on v_truncate_exposure to authenticated;

select count(*) as tables_still_exposed from v_truncate_exposure;;
