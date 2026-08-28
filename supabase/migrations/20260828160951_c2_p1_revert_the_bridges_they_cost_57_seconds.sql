-- REVERTED, on measurement. The definer bridge is functionally correct - a
-- simulated manager read 130 rows through it against 0 through the view - but a
-- SECURITY DEFINER function is never inlined, so v_never_tested_proof is
-- materialised whole instead of being planned with its filter pushed down:
--
--   select count(*) from v_never_tested_proof        ->    174.9 ms
--   select count(*) from f_xq_never_tested_rows()    -> 57,461.5 ms
--
-- 57 seconds is not a page, and v_xq_summary calls it as well, so this would
-- have made the whole tile strip time out for every role including the owner.
-- Queues 2 and 4 go back to reading the sibling views directly. They stay
-- security-definer views with the reader gate, exactly as queues 1 and 3, which
-- means manager and dept_head still see zeros on those two only.
do $revert$
declare body text;
begin
  body := regexp_replace(pg_get_viewdef('public.v_xq_never_submitted'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|from)\s+(public\.)?f_xq_never_tested_rows\(\)', 'FROM public.v_never_tested_proof', 'g');
  if body ~ 'f_xq_never_tested_rows' then
    raise exception 'v_xq_never_submitted: bridge reference survived the revert';
  end if;
  execute format('create or replace view public.v_xq_never_submitted with (security_invoker = false) as %s', body);

  body := regexp_replace(pg_get_viewdef('public.v_xq_harvest_open_past_limit'::regclass, true), ';\s*$', '');
  body := regexp_replace(body, '(FROM|from)\s+(public\.)?f_xq_overdue_harvest_rows\(\)', 'FROM public.v_overdue_harvests', 'g');
  if body ~ 'f_xq_overdue_harvest_rows' then
    raise exception 'v_xq_harvest_open_past_limit: bridge reference survived the revert';
  end if;
  execute format('create or replace view public.v_xq_harvest_open_past_limit with (security_invoker = false) as %s', body);
end
$revert$;

alter view public.v_xq_never_submitted         set (security_invoker = false);
alter view public.v_xq_harvest_open_past_limit set (security_invoker = false);

drop function if exists public.f_xq_never_tested_rows();
drop function if exists public.f_xq_overdue_harvest_rows();;
