-- TWO CORRECTIONS to the P1 gate, both caught before any role could benefit.
--
-- 1. THE GATE WAS OPEN TO EVERYONE. f_xq_reader() is SECURITY DEFINER, and inside
--    a SECURITY DEFINER function current_user is the function OWNER, not the
--    caller. The first clause therefore read current_user in ('postgres', ...)
--    and was ALWAYS TRUE for every caller, which would have handed the whole
--    Metrc exception set to any signed-in user the moment the views became
--    definer views. session_user is not rewritten by SECURITY DEFINER, and under
--    PostgREST every web caller connects as 'authenticator', so session_user is
--    the correct test for "this is a backend connection, not a browser".
--
-- 2. The reloption never flipped. CREATE OR REPLACE VIEW ... WITH (...) keeps the
--    existing security_invoker setting rather than overriding it, so all five
--    views were still security_invoker = true and manager/dept_head would still
--    have seen zeros. ALTER VIEW ... SET is the statement that actually changes it.
--
-- Order matters: the gate is corrected BEFORE the views are flipped to definer,
-- so there is no window in which an open gate sits on a definer view.
create or replace function public.f_xq_reader()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select session_user in ('postgres', 'supabase_admin', 'service_role', 'tg_desktop_reader')
      or exists (
           select 1
             from public.nav_role_visibility v
            where v.view_key = 'xq_metrc_exceptions'
              and v.visible
              and v.role = public.current_app_role()::text
         )
$function$;

comment on function public.f_xq_reader() is
'TICKET C2 / owner ruling P1. Who may read the Metrc exception queues. Reads nav_role_visibility for xq_metrc_exceptions so the menu list and the data list are one list and cannot drift. Tests session_user, NOT current_user: inside a SECURITY DEFINER function current_user is the owner and would pass for everybody. Fails closed - an unmapped caller resolves to readonly and gets nothing.';

alter view public.v_xq_harvest_moisture        set (security_invoker = false);
alter view public.v_xq_never_submitted         set (security_invoker = false);
alter view public.v_xq_failed_no_disposition   set (security_invoker = false);
alter view public.v_xq_harvest_open_past_limit set (security_invoker = false);
alter view public.v_xq_summary                 set (security_invoker = false);;
