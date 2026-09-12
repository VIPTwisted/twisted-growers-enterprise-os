-- PIN login: verifies bcrypt PIN server-side, returns person (with role_name) + reachable nodes.
-- SECURITY DEFINER; never returns the hash. Already applied live to project zsmdejhgdyyaakqsjhmk.
create or replace function public.pin_login(p_login_id text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_person record; v_nodes jsonb; v_role_name text;
begin
  select p.id, p.login_id, p.full_name, p.pin_hash, p.is_active
  into v_person
  from people p
  where upper(p.login_id) = upper(trim(p_login_id)) limit 1;

  if v_person.id is null or v_person.is_active = false then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  if crypt(p_pin, v_person.pin_hash) <> v_person.pin_hash then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  -- Get highest-rank role from active assignments
  select r.name into v_role_name
  from assignments a
  join roles r on r.id = a.role_id
  where a.person_id = v_person.id and a.status = 'active'
  order by r.rank asc
  limit 1;

  -- Get reachable org nodes (ltree cascade)
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id',n.id,'name',n.name,'node_type',n.node_type,'path',n.path::text)
      order by n.path
    ),
    '[]'::jsonb
  )
  into v_nodes
  from org_nodes n
  where exists (
    select 1 from assignments a
    join org_nodes an on an.id = a.node_id
    where a.person_id = v_person.id
      and a.status = 'active'
      and n.path <@ an.path
  );

  return jsonb_build_object(
    'ok', true,
    'person', jsonb_build_object(
      'id',        v_person.id,
      'login_id',  v_person.login_id,
      'full_name', v_person.full_name,
      'role_name', coalesce(v_role_name, 'Associate')
    ),
    'nodes', v_nodes
  );
end; $$;

revoke all on function public.pin_login(text,text) from public;
grant execute on function public.pin_login(text,text) to anon, authenticated;
