-- OWNER RULING P1, 28 August 2026: manager and dept_head stay visible on
-- xq_metrc_exceptions and must see real counts, not zeros. RLS on the raw Metrc
-- mirror tables must NOT be widened and no sibling Metrc page may change.
--
-- HOW. The five C2 views become SECURITY DEFINER (security_invoker = false), so
-- they read the mirror as their owner and the raw-table RLS is untouched. On its
-- own that would expose them to every signed-in user, including staff and hr, who
-- could call them straight off the REST API - so each view also carries an
-- explicit reader gate.
--
-- THE GATE HAS ONE SOURCE OF TRUTH. f_xq_reader() asks nav_role_visibility who is
-- allowed to see this page. Who sees the menu entry and who can read the data are
-- therefore the same list by construction, and cannot drift: hide a role from the
-- nav and its data access closes in the same statement. No second allow-list.
--
-- Nothing here touches metrc_harvests, metrc_packages, metrc_lab_results, the rpt
-- tables, v_never_tested_proof, v_overdue_harvests or v_harvest_forensic. The
-- sibling pages that read those keep the exact behaviour they have today.
create or replace function public.f_xq_reader()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select current_user in ('postgres', 'supabase_admin', 'service_role', 'tg_desktop_reader')
      or exists (
           select 1
             from public.nav_role_visibility v
            where v.view_key = 'xq_metrc_exceptions'
              and v.visible
              and v.role = public.current_app_role()::text
         )
$function$;

comment on function public.f_xq_reader() is
'TICKET C2 / owner ruling P1. Who may read the Metrc exception queues. Reads nav_role_visibility for xq_metrc_exceptions so the menu list and the data list are one list and cannot drift. Fails closed: an unknown or unmapped caller resolves to readonly and gets nothing.';

revoke all on function public.f_xq_reader() from public;
grant execute on function public.f_xq_reader() to authenticated, service_role, tg_desktop_reader;

-- Wrap each view in its own gate without restating a single line of its body,
-- so no clause can be lost in transcription. create or replace keeps the column
-- names, order and types because select * preserves them.
do $wrap$
declare
  v    text;
  body text;
begin
  foreach v in array array[
    'v_xq_harvest_moisture',
    'v_xq_never_submitted',
    'v_xq_failed_no_disposition',
    'v_xq_harvest_open_past_limit'
  ] loop
    body := regexp_replace(pg_get_viewdef(('public.' || v)::regclass, true), ';\s*$', '');
    execute format(
      'create or replace view public.%I with (security_invoker = false) as
         select * from (%s) __gated where public.f_xq_reader()', v, body);
  end loop;

  body := regexp_replace(pg_get_viewdef('public.v_xq_summary'::regclass, true), ';\s*$', '');
  execute format(
    'create or replace view public.v_xq_summary with (security_invoker = false) as
       select * from (%s) __gated where public.f_xq_reader() order by ord', body);
end
$wrap$;;
