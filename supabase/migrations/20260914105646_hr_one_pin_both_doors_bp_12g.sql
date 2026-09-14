-- BP-12g · "Every active employee has a PIN (kiosk)". ONE PIN, both doors: the OS wall
-- terminal (public.f_punch_kiosk, bcrypt on public.employees.pin_hash) and the HR platform's
-- kiosk sign-in (hr.pin_login, bcrypt on hr.people.pin_hash) now share the hash.
--   • hr.admin_reset_pin and hr.change_pin write both rows.
--   • public.f_set_punch_pin (the OS side) mirrors to hr.people.
--   • hr.sync_person_from_os no longer wipes an HR-set PIN with '!no-pin-set' when the OS row
--     has none — it keeps whichever side holds a real hash.
-- Measured before: 0 of 27 active people hold a PIN on either side; HR enters them
-- (HR platform › Admin › Reset PIN, or OS › Wall Terminal › set PIN) — this migration makes one
-- entry serve both.
set search_path = hr, public, extensions;

create or replace function hr.admin_reset_pin(p_person_id uuid, p_pin text, p_actor uuid default null)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_name text; v_hash text;
begin
  if p_person_id is null then return jsonb_build_object('ok', false, 'error', 'person id is required'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'PIN must be 4-8 digits'); end if;
  v_hash := crypt(p_pin, gen_salt('bf'));
  update hr.people set pin_hash = v_hash where id = p_person_id returning full_name into v_name;
  if v_name is null then return jsonb_build_object('ok', false, 'error', 'person not found'); end if;
  update public.employees set pin_hash = v_hash, pin_set_at = now() where id = p_person_id;
  begin
    insert into hr.audit_log (actor_person, action, entity_type, entity_id, detail)
    values (p_actor, 'PIN Reset', 'people', p_person_id, jsonb_build_object('via', 'admin', 'mirrored_to_os', true));
  exception when others then null; end;
  return jsonb_build_object('ok', true, 'person_id', p_person_id, 'full_name', v_name, 'mirrored_to_os', true);
end $$;

create or replace function hr.change_pin(p_person_id uuid, p_current_pin text, p_new_pin text)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_hash text; v_new text;
begin
  if p_person_id is null then return jsonb_build_object('ok', false, 'error', 'missing person'); end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then return jsonb_build_object('ok', false, 'error', 'too_short'); end if;
  select pin_hash into v_hash from hr.people where id = p_person_id;
  if v_hash is null then return jsonb_build_object('ok', false, 'error', 'person not found'); end if;
  -- a first PIN needs no current PIN; after that the current one must match
  if v_hash <> '!no-pin-set' and crypt(coalesce(p_current_pin, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;
  v_new := crypt(p_new_pin, gen_salt('bf'));
  update hr.people set pin_hash = v_new where id = p_person_id;
  update public.employees set pin_hash = v_new, pin_set_at = now() where id = p_person_id;
  begin
    insert into hr.audit_log (actor_person, action, entity_type, entity_id, detail)
    values (p_person_id, 'PIN Changed', 'people', p_person_id, jsonb_build_object('via', 'settings', 'mirrored_to_os', true));
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;

-- the OS side mirrors to HR (same hash), depth-guarded by the people trigger design
create or replace function public.f_set_punch_pin_mirror_trigger()
returns trigger language plpgsql security definer set search_path = hr, public, extensions as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.pin_hash is distinct from old.pin_hash and new.pin_hash is not null then
    update hr.people set pin_hash = new.pin_hash where id = new.id and pin_hash is distinct from new.pin_hash;
  end if;
  return new;
end $$;
drop trigger if exists hr_mirror_pin on public.employees;
create trigger hr_mirror_pin after update of pin_hash on public.employees for each row execute function public.f_set_punch_pin_mirror_trigger();

-- sync keeps a real PIN from either side
create or replace function hr.sync_person_from_os(p_employee_id uuid)
returns uuid language plpgsql security definer set search_path = hr, public, extensions as $$
declare e record; v_person uuid; v_role uuid; v_node uuid; v_auth uuid; v_app_role text;
begin
  select * into e from public.employees where id = p_employee_id;
  if e.id is null then return null; end if;
  select u.user_id, u.role::text into v_auth, v_app_role from public.app_users u where u.employee_id = e.id limit 1;

  insert into hr.people (id, auth_user_id, login_id, pin_hash, full_name, email, phone, is_active, profile_extra)
  values (e.id, v_auth, e.employee_code, coalesce(nullif(e.pin_hash, ''), '!no-pin-set'), e.full_name, e.email, null, e.status = 'active',
          jsonb_build_object('os_employee_id', e.id, 'metrc_agent_badge', e.metrc_agent_badge, 'badge_expires', e.badge_expires, 'hired_on', e.hired_on, 'tier', e.tier))
  on conflict (id) do update set
    auth_user_id = coalesce(excluded.auth_user_id, hr.people.auth_user_id),
    login_id = excluded.login_id,
    pin_hash = case when excluded.pin_hash <> '!no-pin-set' then excluded.pin_hash else coalesce(hr.people.pin_hash, '!no-pin-set') end,
    full_name = excluded.full_name,
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

notify pgrst, 'reload schema';;
