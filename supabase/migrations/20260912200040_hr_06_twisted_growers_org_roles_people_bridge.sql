-- TG HR platform, part 06 — Twisted Growers' own organisation in the HR schema, and the bridge from the OS.
-- No VIP row was copied. The tenant, company, facility and department nodes are TG's; roles keep the names
-- the 136 screens gate on (Admin/Owner, CEO, HR Manager, Key Holder, Associate …) plus TG's; people and
-- assignments are derived from public.employees / public.app_users and stay in step by trigger.
set local search_path to hr, public, extensions;

create or replace function hr.tg_tenant_id() returns uuid language sql immutable as $$ select 'a7b1c2d3-0000-4000-8000-747769737400'::uuid $$;
create or replace function hr.tg_facility_node_id() returns uuid language sql immutable as $$ select 'a7b1c2d3-0000-4000-8000-747769737401'::uuid $$;

insert into hr.org_nodes (id, parent_id, node_type, name, tenant_id, state_code, timezone, config)
values (hr.tg_tenant_id(), null, 'company', 'Twisted Growers', hr.tg_tenant_id(), 'MA', 'America/New_York',
        jsonb_build_object('licences', jsonb_build_array('MC281714','MP281909'), 'address', '415 Millennium Circle, Lakeville, MA'))
on conflict (id) do nothing;

insert into hr.org_nodes (id, parent_id, node_type, name, tenant_id, state_code, timezone, config)
values (hr.tg_facility_node_id(), hr.tg_tenant_id(), 'location', 'Lakeville Facility', hr.tg_tenant_id(), 'MA', 'America/New_York',
        jsonb_build_object('licences', jsonb_build_array('MC281714','MP281909'), 'kind', 'cultivation_manufacturing'))
on conflict (id) do nothing;

insert into hr.org_nodes (id, parent_id, node_type, name, tenant_id, state_code, timezone, config)
select ('a7b1c2d3-0000-4000-8000-' || lpad(to_hex(x'747769737410'::bigint + d.sort), 12, '0'))::uuid,
       hr.tg_facility_node_id(), 'department', d.name, hr.tg_tenant_id(), 'MA', 'America/New_York',
       jsonb_build_object('os_department_id', d.id, 'color', d.color)
from public.departments d where d.active
on conflict (id) do nothing;

insert into hr.roles (tenant_id, name, rank, lens, permissions)
select hr.tg_tenant_id(), v.name, v.rank, v.lens, '{}'::jsonb
from (values
  ('Admin/Owner', 1, 'executive'), ('CEO', 2, 'executive'), ('CFO', 3, 'executive'), ('COO', 4, 'executive'),
  ('HR Manager', 10, 'hr'), ('District Manager', 15, 'operations'), ('Department Head', 20, 'operations'),
  ('Store Manager', 25, 'operations'), ('Lead', 30, 'operations'), ('Key Holder', 35, 'operations'),
  ('Associate', 100, 'operations'), ('Cashier', 100, 'operations')
) v(name, rank, lens)
where not exists (select 1 from hr.roles r where r.tenant_id = hr.tg_tenant_id() and r.name = v.name);

create or replace function hr.tg_role_name(p_app_role text) returns text language sql immutable as $$
  select case p_app_role
    when 'owner' then 'Admin/Owner' when 'executive' then 'CEO' when 'cfo' then 'CFO' when 'admin' then 'Admin/Owner'
    when 'hr' then 'HR Manager' when 'dept_head' then 'Department Head' when 'manager' then 'Department Head'
    when 'assistant_manager' then 'Lead' when 'planner' then 'Lead'
    else 'Associate' end
$$;

create or replace function hr.sync_person_from_os(p_employee_id uuid) returns uuid
language plpgsql security definer set search_path = hr, public, extensions as $$
declare e record; v_person uuid; v_role uuid; v_node uuid; v_auth uuid; v_app_role text;
begin
  select * into e from public.employees where id = p_employee_id;
  if e.id is null then return null; end if;
  select u.user_id, u.role::text into v_auth, v_app_role from public.app_users u where u.employee_id = e.id limit 1;

  insert into hr.people (id, auth_user_id, login_id, pin_hash, full_name, email, phone, is_active, profile_extra)
  values (e.id, v_auth, e.employee_code, coalesce(e.pin_hash, '!no-pin-set'), e.full_name, e.email, null, e.status = 'active',
          jsonb_build_object('os_employee_id', e.id, 'metrc_agent_badge', e.metrc_agent_badge, 'badge_expires', e.badge_expires, 'hired_on', e.hired_on, 'tier', e.tier))
  on conflict (id) do update set
    auth_user_id = coalesce(excluded.auth_user_id, hr.people.auth_user_id),
    login_id = excluded.login_id, pin_hash = excluded.pin_hash, full_name = excluded.full_name,
    email = excluded.email, is_active = excluded.is_active,
    profile_extra = hr.people.profile_extra || excluded.profile_extra, updated_at = now()
  returning id into v_person;

  select id into v_role from hr.roles where tenant_id = hr.tg_tenant_id() and name = hr.tg_role_name(v_app_role);
  select n.id into v_node from hr.org_nodes n where n.node_type = 'department' and (n.config->>'os_department_id')::uuid = e.primary_department_id;
  if v_node is null then v_node := hr.tg_facility_node_id(); end if;

  if e.status = 'active' then
    if not exists (select 1 from hr.assignments a where a.person_id = v_person and a.status = 'active' and a.role_id = v_role and a.node_id = v_node) then
      update hr.assignments set status = 'ended', effective_to = current_date where person_id = v_person and status = 'active';
      insert into hr.assignments (person_id, role_id, node_id, status, effective_from) values (v_person, v_role, v_node, 'active', coalesce(e.hired_on, current_date));
    end if;
  else
    update hr.assignments set status = 'ended', effective_to = coalesce(e.terminated_on, current_date) where person_id = v_person and status = 'active';
  end if;
  return v_person;
end $$;

create or replace function hr.sync_people_from_os() returns integer
language plpgsql security definer set search_path = hr, public, extensions as $$
declare n int := 0; r record;
begin
  for r in select id from public.employees loop perform hr.sync_person_from_os(r.id); n := n + 1; end loop;
  return n;
end $$;

create or replace function public.f_hr_sync_person_trigger() returns trigger
language plpgsql security definer set search_path = hr, public, extensions as $$
begin perform hr.sync_person_from_os(new.id); return new; end $$;
drop trigger if exists hr_sync_person on public.employees;
create trigger hr_sync_person after insert or update on public.employees for each row execute function public.f_hr_sync_person_trigger();

create or replace function public.f_hr_sync_app_user_trigger() returns trigger
language plpgsql security definer set search_path = hr, public, extensions as $$
begin if new.employee_id is not null then perform hr.sync_person_from_os(new.employee_id); end if; return new; end $$;
drop trigger if exists hr_sync_app_user on public.app_users;
create trigger hr_sync_app_user after insert or update on public.app_users for each row execute function public.f_hr_sync_app_user_trigger();

select hr.sync_people_from_os();

create or replace function hr.session_login() returns jsonb
language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_person record; v_nodes jsonb; v_role_name text;
begin
  select p.id, p.login_id, p.full_name, p.is_active into v_person from hr.people p where p.auth_user_id = auth.uid() and p.is_active limit 1;
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
grant execute on function hr.session_login() to authenticated;

create or replace function hr.send_emergency_contact_reminders(p_node_ids uuid[] default null, p_person_ids uuid[] default null)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare n int := 0;
begin
  insert into hr.notifications (node_id, target_person, title, body, category, priority)
  select null, p.id, 'Please update your emergency contacts',
         'HR asks you to confirm or update your emergency contacts in My Home › Emergency Contacts.', 'reminder', 'normal'
  from hr.people p where p.is_active and (p_person_ids is null or p.id = any(p_person_ids));
  get diagnostics n = row_count;
  return jsonb_build_object('count', n);
end $$;

create or replace function public.ceo_company_kpi_strip(p_tenant uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'revenue_mtd', null, 'net_income_mtd', null, 'gross_margin_pct', null,
    'net_sales_today', null, 'transactions_today', null, 'aov_today', null,
    'entities', 2, 'locations', 1, 'mlm_consultants', null, 'mlm_gross_sales', null,
    'as_of', now())
$$;
grant execute on function public.ceo_company_kpi_strip(uuid) to authenticated;

create or replace function public.nav_registry_get(p_module text default null, p_role text default null)
returns table (group_label text, label text, route text, app_url text)
language sql stable security definer set search_path = public as $$
  select n.category as group_label, n.label, '/?view=' || n.view_key as route, null::text as app_url
  from public.nav_registry n
  where n.enabled and (p_module is null or n.module = p_module or n.category ilike '%' || p_module || '%')
  order by n.category_order, n.item_order
$$;
grant execute on function public.nav_registry_get(text, text) to authenticated;
