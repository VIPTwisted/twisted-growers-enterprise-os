-- 025_rpc_reachability_guards.sql
-- P2 (interim): add server-side reachability enforcement to read RPCs that took
-- p_node_ids without checking the caller. Pattern mirrors scope_data's inline
-- ltree-path cascade. An optional p_actor keeps callers backward-compatible; the
-- app now passes the logged-in person, so a user can no longer read locations
-- they can't reach by tampering with node_ids.
--
-- NOTE (acknowledged interim limitation): the actor is still client-supplied, so
-- impersonation via a different person_id remains until real server-side identity
-- (Supabase Auth / auth.uid()) is adopted. scope_data already enforces reachability.

drop function if exists public.get_week_schedule(uuid[], date);
drop function if exists public.get_week_schedule(uuid[], date, uuid);
create function public.get_week_schedule(p_node_ids uuid[], p_week_start date, p_actor uuid default null)
returns table(shift_id text, shift_date date, start_time time without time zone, end_time time without time zone,
              full_name text, role_name text, node_name text, status text, zone text, exception_type text,
              keyholder_eligible boolean, role_rank int)
language sql security definer set search_path to 'public' as $function$
  select s.id::text, s.shift_date, s.start_time, s.end_time, p.full_name,
    coalesce(r.name,'—'), n.name, s.status, s.zone,
    (select se.exception_type from shift_exceptions se where se.shift_id = s.id order by se.created_at desc limit 1),
    (coalesce(r.rank, 999) <= 65), r.rank
  from shifts s
  join people p on p.id = s.person_id
  join org_nodes n on n.id = s.node_id
  left join roles r on r.id = s.role_id
  where s.node_id = any(p_node_ids)
    and s.shift_date between p_week_start and p_week_start + 6
    and (p_actor is null or exists (
      select 1 from assignments a join org_nodes an on an.id = a.node_id
      where a.person_id = p_actor and a.status = 'active' and n.path <@ an.path
    ))
  order by s.shift_date, s.start_time, n.name
$function$;
grant execute on function public.get_week_schedule(uuid[],date,uuid) to anon, authenticated;
