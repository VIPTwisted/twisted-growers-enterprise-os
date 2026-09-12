-- 024_get_my_time_punches.sql
-- Read RPC so TimeClock stops querying time_punches directly (prereq for locking
-- the table under RLS). Returns the same shape as .select('*, org_nodes(name)').
create or replace function public.get_my_time_punches(p_person_id uuid, p_from date default null, p_to date default null)
returns jsonb language sql security definer set search_path=public as $$
  select coalesce(jsonb_agg(
    to_jsonb(tp) || jsonb_build_object('org_nodes', jsonb_build_object('name', n.name))
    order by tp.work_date desc, tp.punched_in_at desc
  ), '[]'::jsonb)
  from time_punches tp
  left join org_nodes n on n.id = tp.node_id
  where tp.person_id = p_person_id
    and (p_from is null or tp.work_date >= p_from)
    and (p_to is null or tp.work_date <= p_to)
$$;
grant execute on function public.get_my_time_punches(uuid,date,date) to anon, authenticated;
