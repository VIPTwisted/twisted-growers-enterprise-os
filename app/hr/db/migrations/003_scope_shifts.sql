-- Live shifts for in-scope nodes with assigned person name. Already applied live.
create or replace function public.scope_shifts(p_node_ids uuid[])
returns table(shift_date date, start_time time, end_time time, status text, full_name text, node_id uuid)
language sql security definer set search_path = public as $$
  select s.shift_date, s.start_time, s.end_time, s.status, p.full_name, s.node_id
  from shifts s left join people p on p.id=s.person_id
  where s.node_id = any(p_node_ids) order by s.shift_date, s.start_time;
$$;
revoke all on function public.scope_shifts(uuid[]) from public;
grant execute on function public.scope_shifts(uuid[]) to anon, authenticated;
