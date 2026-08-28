-- CORRECTION. Revoking EXECUTE from everyone broke the queue views outright:
-- "permission denied for function f_xq_never_tested_rows". A view owner's
-- privileges cover the RELATIONS a view reads, but FUNCTION execute is checked
-- against the CURRENT USER even inside a security-definer view. So the caller
-- must hold EXECUTE.
--
-- Granting EXECUTE would otherwise expose the bridges as RPC, and they bypass
-- RLS by design - any signed-in user could have called them directly and read
-- the whole set around the gate. So the gate moves INSIDE each bridge. The
-- function now refuses a non-reader on its own terms, which makes it safe to
-- grant and makes the direct-RPC route exactly as tight as the view route.
--
-- f_xq_reader() still judges the real caller from inside a definer function:
-- it tests session_user, which SECURITY DEFINER does not rewrite, and
-- current_app_role(), which reads auth.uid() from the request GUC.
create or replace function public.f_xq_never_tested_rows()
returns setof public.v_never_tested_proof
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select * from public.v_never_tested_proof where public.f_xq_reader()
$function$;

create or replace function public.f_xq_overdue_harvest_rows()
returns setof public.v_overdue_harvests
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$
  select * from public.v_overdue_harvests where public.f_xq_reader()
$function$;

comment on function public.f_xq_never_tested_rows() is
'TICKET C2 / owner ruling P1. Reads v_never_tested_proof as its owner so the queue view can serve manager and dept_head without widening RLS on the Metrc mirror and without altering the sibling page. Carries f_xq_reader() itself, so calling it directly as RPC is gated exactly like the view.';
comment on function public.f_xq_overdue_harvest_rows() is
'TICKET C2 / owner ruling P1. Reads v_overdue_harvests as its owner so the queue view can serve manager and dept_head without widening RLS on the Metrc mirror and without altering the sibling page. Carries f_xq_reader() itself, so calling it directly as RPC is gated exactly like the view.';

revoke all on function public.f_xq_never_tested_rows()    from public, anon;
revoke all on function public.f_xq_overdue_harvest_rows() from public, anon;
grant execute on function public.f_xq_never_tested_rows()    to authenticated, service_role, tg_desktop_reader;
grant execute on function public.f_xq_overdue_harvest_rows() to authenticated, service_role, tg_desktop_reader;;
