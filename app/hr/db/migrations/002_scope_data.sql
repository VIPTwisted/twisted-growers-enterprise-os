-- Roster + shift counts for in-scope nodes. Re-verifies reachability (defense in depth) so anon
-- cannot request nodes the person can't reach. Already applied live.
create or replace function public.scope_data(p_person_id uuid, p_node_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_allowed uuid[]; v_people jsonb; v_shift_counts jsonb; v_nodes jsonb;
begin
  select array_agg(n.id) into v_allowed from org_nodes n
  where n.id = any(p_node_ids) and exists (
    select 1 from assignments a join org_nodes an on an.id=a.node_id
    where a.person_id=p_person_id and a.status='active' and n.path <@ an.path);
  if v_allowed is null then return jsonb_build_object('ok',false,'error','no_access'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('node_id',a.node_id,'full_name',p.full_name,
    'login_id',p.login_id,'role',r.name,'rank',r.rank) order by a.node_id, r.rank),'[]'::jsonb)
  into v_people from assignments a join people p on p.id=a.person_id
  left join roles r on r.id=a.role_id where a.node_id = any(v_allowed) and a.status='active';
  select coalesce(jsonb_object_agg(node_id,cnt),'{}'::jsonb) into v_shift_counts
  from (select node_id, count(*) cnt from shifts where node_id=any(v_allowed) group by node_id) s;
  select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'name',n.name) order by n.name),'[]'::jsonb)
  into v_nodes from org_nodes n where n.id=any(v_allowed);
  return jsonb_build_object('ok',true,'people',v_people,'shift_counts',v_shift_counts,'nodes',v_nodes);
end; $$;
revoke all on function public.scope_data(uuid,uuid[]) from public;
grant execute on function public.scope_data(uuid,uuid[]) to anon, authenticated;
