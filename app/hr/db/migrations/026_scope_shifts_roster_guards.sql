-- 026_scope_shifts_roster_guards.sql
-- P2 interim (cont.): same reachability guard on scope_shifts + get_roster.
-- Backward-compatible optional p_actor; app passes the logged-in person where wired.
drop function if exists public.scope_shifts(uuid[]);
drop function if exists public.scope_shifts(uuid[], uuid);
create function public.scope_shifts(p_node_ids uuid[], p_actor uuid default null)
returns table(shift_date date, start_time time without time zone, end_time time without time zone, status text, full_name text, node_id uuid)
language sql security definer set search_path to 'public' as $function$
  select s.shift_date, s.start_time, s.end_time, s.status, p.full_name, s.node_id
  from shifts s
  left join people p on p.id = s.person_id
  join org_nodes n on n.id = s.node_id
  where s.node_id = any(p_node_ids)
    and (p_actor is null or exists (
      select 1 from assignments a join org_nodes an on an.id = a.node_id
      where a.person_id = p_actor and a.status = 'active' and n.path <@ an.path))
  order by s.shift_date, s.start_time;
$function$;
grant execute on function public.scope_shifts(uuid[],uuid) to anon, authenticated;

drop function if exists public.get_roster(uuid[]);
drop function if exists public.get_roster(uuid[], uuid);
create function public.get_roster(p_node_ids uuid[], p_actor uuid default null)
returns table(id uuid, full_name text, login_id text, is_active boolean, role_name text, node_name text, effective_from date)
language sql stable security definer set search_path to 'public' as $function$
  select distinct on (p.id)
    p.id, p.full_name, p.login_id, p.is_active, r.name as role_name, n.name as node_name, a.effective_from
  from people p
  join assignments a on a.person_id = p.id and a.node_id = any(p_node_ids)
  join org_nodes n on n.id = a.node_id
  left join roles r on r.id = a.role_id
  where (p_actor is null or exists (
    select 1 from assignments a2 join org_nodes an on an.id = a2.node_id
    where a2.person_id = p_actor and a2.status = 'active' and n.path <@ an.path))
  order by p.id, a.effective_from desc;
$function$;
grant execute on function public.get_roster(uuid[],uuid) to anon, authenticated;

-- Client wiring status (p_actor passed): get_week_schedule (Schedule), scope_shifts
-- (ScheduleBuilder + scopeShifts wrapper), get_roster (Schedule + getRoster wrapper).
-- Remaining get_roster sites (Cockpit/AdminPanel/Availability/Roster/Reports/etc.)
-- are backward-compatible (unguarded) until wired — best done with a test login.
