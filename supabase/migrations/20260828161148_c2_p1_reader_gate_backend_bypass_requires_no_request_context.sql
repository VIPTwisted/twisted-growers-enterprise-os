-- THIRD CORRECTION to the gate, and the most serious. Testing the DENY path
-- caught it: a simulated staff session returned gate = true and read all 210
-- and 250 rows.
--
-- CAUSE. The backend bypass tested session_user alone. SET ROLE changes
-- current_user but never session_user, so on a direct database connection the
-- bypass fires no matter which app role is being simulated. In production under
-- PostgREST session_user is 'authenticator' and the bypass would not have fired,
-- so this was very probably never exploitable through the web app - but "very
-- probably" is not a standard to hold an access gate to, and it made the deny
-- path impossible to test, which is how it survived the first two passes.
--
-- FIX. A backend connection is one with NO PostgREST request context at all.
-- Under PostgREST request.jwt.claims is always set, so the bypass cannot fire
-- for any web caller, whatever role is set. Now both paths are testable and the
-- deny path can be proven rather than assumed.
create or replace function public.f_xq_reader()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select (
           current_setting('request.jwt.claims', true) is null
           and session_user in ('postgres', 'supabase_admin', 'service_role', 'tg_desktop_reader')
         )
      or exists (
           select 1
             from public.nav_role_visibility v
            where v.view_key = 'xq_metrc_exceptions'
              and v.visible
              and v.role = public.current_app_role()::text
         )
$function$;

comment on function public.f_xq_reader() is
'TICKET C2 / owner ruling P1. Who may read the Metrc exception queues. The allow-list is nav_role_visibility for xq_metrc_exceptions, so the menu list and the data list are one list and cannot drift. The backend bypass requires BOTH a backend session_user AND the complete absence of a PostgREST request context - session_user alone was not enough, because SET ROLE does not change it and a simulated staff session passed the gate. Fails closed: an unmapped caller resolves to readonly and gets nothing.';;
