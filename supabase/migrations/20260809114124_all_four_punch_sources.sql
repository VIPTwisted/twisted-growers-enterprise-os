-- Four ways to punch, one ledger. The company chooses later; all four work.
--   kiosk    wall tablet, login ID + PIN
--   scanner  badge or fob at a door
--   phone    staff device, checked against a registered geofence
--   import   Dynamics 365, or any payroll system that owns the clock
-- punch_devices already carries per-device geofencing, so no site table is
-- needed. Nothing about a device, radius or coordinate is hardwired.

create extension if not exists pgcrypto with schema extensions;

alter table public.punch_devices
  add column if not exists kind text not null default 'kiosk';

do $$ begin
  alter table public.punch_devices
    add constraint punch_devices_kind_ck check (kind in ('kiosk','scanner','phone','import'));
exception when duplicate_object then null; end $$;

create index if not exists punch_devices_active_kind_idx on public.punch_devices(active, kind);

comment on column public.punch_devices.kind is
  'What kind of surface this is. A kiosk cannot accept a badge punch and a '
  'scanner cannot accept a PIN — the source is proven by the device, not claimed '
  'by the caller.';

-- Credentials for the two unattended surfaces. Both hashed; neither readable.
alter table public.employees
  add column if not exists badge_code text,
  add column if not exists pin_hash   text,
  add column if not exists pin_set_at timestamptz;

create unique index if not exists employees_badge_code_key
  on public.employees(badge_code) where badge_code is not null;

comment on column public.employees.badge_code is
  'Physical fob or badge read at a door. Distinct from metrc_agent_badge, which '
  'is the state licence number.';
comment on column public.employees.pin_hash is
  'Kiosk PIN, bcrypt. The PIN is never stored and cannot be read back.';

create or replace function public.f_set_punch_pin(p_employee_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to set a PIN. Owner, HR or admin only.' using errcode='42501';
  end if;
  if p_pin !~ '^[0-9]{4,8}$' then raise exception 'A PIN must be 4 to 8 digits.'; end if;
  update public.employees
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 10)), pin_set_at = now()
   where id = p_employee_id;
end $$;

-- KIOSK
create or replace function public.f_punch_kiosk(p_login_id text, p_pin text, p_device_id uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_emp uuid;
begin
  if not exists (select 1 from public.punch_devices where id=p_device_id and active and kind='kiosk') then
    raise exception 'This terminal is not registered or has been deactivated.';
  end if;
  select e.id into v_emp from public.employees e
   where upper(e.login_id) = upper(btrim(p_login_id))
     and e.pin_hash is not null
     and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
     and e.status::text = 'active';
  if v_emp is null then
    raise exception 'That ID and PIN do not match an active employee.' using errcode='42501';
  end if;
  update public.punch_devices set last_seen_at = now() where id = p_device_id;
  return public.f_punch(v_emp, p_kind, 'kiosk', p_device_id, null, null, null, now());
end $$;

-- SCANNER
create or replace function public.f_punch_badge(p_badge_code text, p_device_id uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid;
begin
  if not exists (select 1 from public.punch_devices where id=p_device_id and active and kind='scanner') then
    raise exception 'This scanner is not registered or has been deactivated.';
  end if;
  select id into v_emp from public.employees
   where badge_code = btrim(p_badge_code) and status::text='active';
  if v_emp is null then raise exception 'Badge not recognised.' using errcode='42501'; end if;
  update public.punch_devices set last_seen_at = now() where id = p_device_id;
  return public.f_punch(v_emp, p_kind, 'scanner', p_device_id, null, null, null, now());
end $$;

-- PHONE. Refused outside every registered geofence.
create or replace function public.f_punch_phone(p_lat numeric, p_lon numeric, p_accuracy_m numeric, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_hit uuid;
begin
  v_emp := public.f_my_employee_id();
  if v_emp is null then raise exception 'No employee record for this login.' using errcode='42501'; end if;
  if p_lat is null or p_lon is null then raise exception 'Location is required for a phone punch.'; end if;

  select id into v_hit from (
    select id,
           6371000 * acos(least(1, greatest(-1,
             cos(radians(p_lat))*cos(radians(geofence_lat))*cos(radians(geofence_lon)-radians(p_lon))
             + sin(radians(p_lat))*sin(radians(geofence_lat))))) as d,
           geofence_m
    from public.punch_devices
    where active and geofence_lat is not null and geofence_lon is not null
  ) s where s.d <= s.geofence_m order by s.d limit 1;

  if v_hit is null then
    raise exception 'You are not at a work site. Phone punches are only accepted on site.'
      using errcode='42501';
  end if;
  return public.f_punch(v_emp, p_kind, 'phone', v_hit, p_lat, p_lon, p_accuracy_m, now());
end $$;

-- IMPORT. Dynamics 365 or any payroll clock.
create or replace function public.f_punch_import(p_rows jsonb, p_device_id uuid, p_source_system text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb; v_emp uuid; v_ok int := 0; v_skip int := 0; v_err jsonb := '[]'::jsonb;
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to import punches.' using errcode='42501';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into v_emp from public.employees
     where employee_code = (r->>'employee_code') or upper(login_id) = upper(r->>'login_id');
    if v_emp is null then
      v_skip := v_skip + 1;
      v_err := v_err || jsonb_build_object('row', r, 'why', 'no matching employee');
      continue;
    end if;
    insert into public.time_entries
      (employee_id, work_date, clock_in, clock_out, unpaid_lunch_min, source, device_id, source_ref, created_at)
    values
      (v_emp, (r->>'work_date')::date, (r->>'clock_in')::timestamptz,
       nullif(r->>'clock_out','')::timestamptz, coalesce((r->>'unpaid_lunch_min')::int,0),
       'import', p_device_id, p_source_system||':'||coalesce(r->>'ref',''), now());
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('imported', v_ok, 'skipped', v_skip, 'errors', v_err);
end $$;

grant execute on function public.f_punch_kiosk(text,text,uuid,text)          to authenticated;
grant execute on function public.f_punch_badge(text,uuid,text)               to authenticated;
grant execute on function public.f_punch_phone(numeric,numeric,numeric,text) to authenticated;
grant execute on function public.f_punch_import(jsonb,uuid,text)             to authenticated;
grant execute on function public.f_set_punch_pin(uuid,text)                  to authenticated;;
