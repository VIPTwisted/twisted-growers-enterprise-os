-- BP-12g · the HR shell's top bar still printed the clone's company name from a string in
-- Shell.jsx (seen live 14 Sep 2026 on the first owner sign-in). The brand is a ROW:
-- hr.company_branding already had the columns and no rows. One TG row, one reader, and the
-- shell reads it (falling back to the locked fact "Twisted Growers", never to the clone's).
set search_path = hr, public, extensions;

insert into hr.company_branding (node_id, tenant_id, company_display_name, tagline, legal_name, theme, mode, login_headline, login_subhead)
select hr.tg_tenant_id(), hr.tg_tenant_id(), 'TWISTED GROWERS', 'HR Command Center · Lakeville, MA', 'Twisted Growers', 'aurora', 'dark',
       'Twisted Growers', 'HR Command Center · Lakeville, MA'
where not exists (select 1 from hr.company_branding where tenant_id = hr.tg_tenant_id());

create or replace function hr.get_company_branding()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select to_jsonb(b) - 'custom_tokens' from hr.company_branding b where b.tenant_id = hr.tg_tenant_id() order by b.updated_at desc nulls last limit 1;
$$;
revoke all on function hr.get_company_branding() from public, anon;
grant execute on function hr.get_company_branding() to authenticated;

-- the person's display name on first OS sign-in: app_users.display_name, else the auth
-- user's own metadata name, else the email's local part (what the owner saw: "twistedgrowersma")
create or replace function hr.session_login()
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_person record; v_nodes jsonb; v_role_name text; u record; v_role uuid; v_id uuid; v_name text;
begin
  select p.id, p.login_id, p.full_name, p.is_active into v_person from hr.people p where p.auth_user_id = auth.uid() and p.is_active limit 1;

  if v_person.id is null and auth.uid() is not null then
    select au.user_id, au.employee_id, au.role::text, au.display_name into u from public.app_users au where au.user_id = auth.uid();
    if u.user_id is not null then
      if u.employee_id is not null then
        v_id := hr.sync_person_from_os(u.employee_id);
        update hr.people set auth_user_id = auth.uid() where id = v_id and auth_user_id is null;
      else
        select coalesce(nullif(u.display_name, ''), nullif(au.raw_user_meta_data->>'full_name', ''), nullif(au.raw_user_meta_data->>'name', ''),
                        split_part(au.email, '@', 1), 'OS user')
          into v_name from auth.users au where au.id = auth.uid();
        insert into hr.people (auth_user_id, login_id, pin_hash, full_name, is_active, profile_extra)
        values (auth.uid(), 'OS-' || left(auth.uid()::text, 8), '!no-pin-set', v_name, true, jsonb_build_object('source', 'os_login', 'app_role', u.role))
        on conflict (auth_user_id) do update set full_name = excluded.full_name returning id into v_id;
        select id into v_role from hr.roles where tenant_id = hr.tg_tenant_id() and name = hr.tg_role_name(u.role);
        if not exists (select 1 from hr.assignments a where a.person_id = v_id and a.status = 'active') then
          insert into hr.assignments (person_id, role_id, node_id, status) values (v_id, v_role, hr.tg_tenant_id(), 'active');
        end if;
      end if;
      select p.id, p.login_id, p.full_name, p.is_active into v_person from hr.people p where p.id = v_id;
    end if;
  end if;

  if v_person.id is null then return jsonb_build_object('ok', false, 'error', 'no_person_for_session'); end if;
  select r.name into v_role_name from hr.assignments a join hr.roles r on r.id = a.role_id
   where a.person_id = v_person.id and a.status = 'active' order by r.rank asc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'name', n.name, 'node_type', n.node_type, 'path', n.path::text) order by n.path), '[]'::jsonb)
    into v_nodes from hr.org_nodes n
   where exists (select 1 from hr.assignments a join hr.org_nodes an on an.id = a.node_id where a.person_id = v_person.id and a.status = 'active' and n.path <@ an.path);
  return jsonb_build_object('ok', true,
    'person', jsonb_build_object('id', v_person.id, 'login_id', v_person.login_id, 'full_name', v_person.full_name, 'role_name', coalesce(v_role_name, 'Associate')),
    'nodes', v_nodes);
end $$;

notify pgrst, 'reload schema';;
