-- P1, part two. The first pass gave manager and dept_head real rows on queues 1
-- and 3 but still zero on queues 2 and 4, and the proof caught it.
--
-- WHY. Queue 2 reads v_never_tested_proof and queue 4 reads v_overdue_harvests.
-- Those two are sibling-page views with security_invoker = true. A SECURITY
-- DEFINER *view* does not re-point a nested invoker view: the inner view still
-- resolves as the real caller, RLS on the Metrc mirror still applies, and a
-- manager gets nothing. Measured under a simulated manager session: 0 rows.
--
-- A SECURITY DEFINER *function* does switch the executing user for everything
-- inside it, including a nested invoker view. Measured in the same session:
-- 130 rows through a definer function against 0 through the view.
--
-- So each queue gets a one-line bridge function that returns the sibling view
-- verbatim. The sibling views are NOT altered, NOT copied and NOT re-derived -
-- there is still exactly one definition of "never tested" and one of "overdue",
-- and the sibling pages behave today exactly as they did yesterday.
--
-- The bridges bypass RLS, so EXECUTE is revoked from everyone. Only the view
-- owner can call them, which means the only route to their rows is through the
-- gated queue views. They are not reachable as RPC.
create or replace function public.f_xq_never_tested_rows()
returns setof public.v_never_tested_proof
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$ select * from public.v_never_tested_proof $function$;

create or replace function public.f_xq_overdue_harvest_rows()
returns setof public.v_overdue_harvests
language sql stable security definer set search_path to 'public', 'pg_temp'
as $function$ select * from public.v_overdue_harvests $function$;

comment on function public.f_xq_never_tested_rows() is
'TICKET C2 / owner ruling P1. Reads v_never_tested_proof as its owner so the gated queue view can serve manager and dept_head without widening RLS on the Metrc mirror and without altering the sibling page. EXECUTE is revoked from all; only the queue view owner can call it.';
comment on function public.f_xq_overdue_harvest_rows() is
'TICKET C2 / owner ruling P1. Reads v_overdue_harvests as its owner so the gated queue view can serve manager and dept_head without widening RLS on the Metrc mirror and without altering the sibling page. EXECUTE is revoked from all; only the queue view owner can call it.';

revoke all on function public.f_xq_never_tested_rows()     from public, anon, authenticated, service_role, tg_desktop_reader;
revoke all on function public.f_xq_overdue_harvest_rows()  from public, anon, authenticated, service_role, tg_desktop_reader;

-- Repoint the two queue views at their bridge. The substitution is anchored on
-- the FROM clause only: both view bodies also mention the sibling view inside a
-- provenance string literal, and a blind replace would have corrupted the text
-- the page prints under "read from".
do $repoint$
declare body text;
begin
  body := regexp_replace(pg_get_viewdef('public.v_xq_never_submitted'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|from)\s+(public\.)?v_never_tested_proof\M', 'FROM public.f_xq_never_tested_rows()', 'g');
  if body !~ 'f_xq_never_tested_rows' then
    raise exception 'v_xq_never_submitted: FROM clause not matched, refusing to replace the view with an unchanged body';
  end if;
  execute format('create or replace view public.v_xq_never_submitted with (security_invoker = false) as %s', body);

  body := regexp_replace(pg_get_viewdef('public.v_xq_harvest_open_past_limit'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|from)\s+(public\.)?v_overdue_harvests\M', 'FROM public.f_xq_overdue_harvest_rows()', 'g');
  if body !~ 'f_xq_overdue_harvest_rows' then
    raise exception 'v_xq_harvest_open_past_limit: FROM clause not matched, refusing to replace the view with an unchanged body';
  end if;
  execute format('create or replace view public.v_xq_harvest_open_past_limit with (security_invoker = false) as %s', body);
end
$repoint$;

alter view public.v_xq_never_submitted         set (security_invoker = false);
alter view public.v_xq_harvest_open_past_limit set (security_invoker = false);;
