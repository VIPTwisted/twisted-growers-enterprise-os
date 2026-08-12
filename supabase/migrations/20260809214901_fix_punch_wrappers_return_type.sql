-- BUG, found by smoke test before a single real punch was taken.
-- f_punch returns TABLE(entry_id, action, late_minutes, occurrence_id, message).
-- My three wrappers declared `returns jsonb` and returned that record straight
-- through, which Postgres cannot cast — so every kiosk, badge and phone punch
-- would have failed at the moment someone tried to clock in.
--
-- I assumed the return type instead of reading it. Same mistake as the login.

create or replace function public.f_punch_kiosk(
  p_login_id text, p_pin text, p_device_id uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_emp uuid; v_name text; v_login text; v_dev public.punch_devices%rowtype;
  v_entry uuid; v_action text; v_late integer; v_occ uuid; v_msg text;
begin
  select * into v_dev from public.punch_devices
   where id = p_device_id and active and kind = 'kiosk';
  if v_dev.id is null then
    raise exception 'This terminal is not registered or has been deactivated.';
  end if;

  select e.id, e.full_name, e.login_id into v_emp, v_name, v_login
  from public.employees e
  where upper(e.login_id) = upper(btrim(p_login_id))
    and e.pin_hash is not null
    and e.pin_hash = extensions.crypt(p_pin, e.pin_hash)
    and e.status::text = 'active';

  if v_emp is null then
    raise exception 'That ID and PIN do not match an active employee.' using errcode='42501';
  end if;

  update public.punch_devices set last_seen_at = now() where id = p_device_id;

  select f.entry_id, f.action, f.late_minutes, f.occurrence_id, f.message
    into v_entry, v_action, v_late, v_occ, v_msg
  from public.f_punch(v_emp, p_kind, 'kiosk', p_device_id, null, null, null, now()) f;

  return jsonb_build_object(
    'time_entry_id', v_entry, 'action', v_action,
    'late_minutes', coalesce(v_late,0), 'occurrence_id', v_occ,
    'message', v_msg, 'full_name', v_name, 'login_id', v_login);
end $$;

create or replace function public.f_punch_badge(
  p_badge_code text, p_device_id uuid, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_name text;
        v_entry uuid; v_action text; v_late integer; v_occ uuid; v_msg text;
begin
  if not exists (select 1 from public.punch_devices
                  where id = p_device_id and active and kind = 'scanner') then
    raise exception 'This scanner is not registered or has been deactivated.';
  end if;

  select id, full_name into v_emp, v_name from public.employees
   where badge_code = btrim(p_badge_code) and status::text = 'active';
  if v_emp is null then raise exception 'Badge not recognised.' using errcode='42501'; end if;

  update public.punch_devices set last_seen_at = now() where id = p_device_id;

  select f.entry_id, f.action, f.late_minutes, f.occurrence_id, f.message
    into v_entry, v_action, v_late, v_occ, v_msg
  from public.f_punch(v_emp, p_kind, 'scanner', p_device_id, null, null, null, now()) f;

  return jsonb_build_object(
    'time_entry_id', v_entry, 'action', v_action,
    'late_minutes', coalesce(v_late,0), 'occurrence_id', v_occ,
    'message', v_msg, 'full_name', v_name);
end $$;

create or replace function public.f_punch_phone(
  p_lat numeric, p_lon numeric, p_accuracy_m numeric, p_kind text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_emp uuid; v_site text;
        v_entry uuid; v_action text; v_late integer; v_occ uuid; v_msg text;
begin
  v_emp := public.f_my_employee_id();
  if v_emp is null then raise exception 'No employee record for this login.' using errcode='42501'; end if;
  if p_lat is null or p_lon is null then raise exception 'Location is required for a phone punch.'; end if;

  select s.name into v_site from (
    select name,
           6371000 * acos(least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(lat)) * cos(radians(lon) - radians(p_lon))
             + sin(radians(p_lat)) * sin(radians(lat))))) as d,
           radius_m
    from public.punch_sites where active and lat is not null and lon is not null
  ) s where s.d <= s.radius_m order by s.d limit 1;

  if v_site is null then
    raise exception 'You are not at a work site. Phone punches are only accepted on site.'
      using errcode='42501';
  end if;

  select f.entry_id, f.action, f.late_minutes, f.occurrence_id, f.message
    into v_entry, v_action, v_late, v_occ, v_msg
  from public.f_punch(v_emp, p_kind, 'phone', null, p_lat, p_lon, p_accuracy_m, now()) f;

  return jsonb_build_object(
    'time_entry_id', v_entry, 'action', v_action,
    'late_minutes', coalesce(v_late,0), 'occurrence_id', v_occ,
    'message', v_msg, 'site', v_site);
end $$;

-- Same bug in the drain: it read v_res->>'time_entry_id' from a non-jsonb value.
create or replace function public.f_drain_punch_queue(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_emp uuid; v_entry uuid;
        v_ok int := 0; v_dup int := 0; v_bad int := 0; v_err int := 0;
begin
  for r in select * from public.punch_queue
            where status = 'queued' order by punched_at limit p_limit
  loop
    select id into v_emp from public.employees
     where (r.login_id is not null and upper(login_id) = upper(r.login_id))
        or (r.badge_code is not null and badge_code = r.badge_code);

    if v_emp is null then
      update public.punch_queue set status='rejected', error='no matching employee',
             attempts = attempts + 1 where id = r.id;
      v_bad := v_bad + 1; continue;
    end if;

    if exists (select 1 from public.time_entries t
                where t.employee_id = v_emp
                  and (abs(extract(epoch from (t.clock_in - r.punched_at))) < 60
                    or abs(extract(epoch from (coalesce(t.clock_out, r.punched_at) - r.punched_at))) < 60)) then
      update public.punch_queue set status='duplicate' where id = r.id;
      v_dup := v_dup + 1; continue;
    end if;

    begin
      select f.entry_id into v_entry
      from public.f_punch(v_emp, r.kind, 'offline', r.device_id,
                          r.lat, r.lon, r.accuracy_m, r.punched_at) f;
      update public.punch_queue
         set status='applied', time_entry_id = v_entry, attempts = attempts + 1, error = null
       where id = r.id;
      v_ok := v_ok + 1;
    exception when others then
      update public.punch_queue
         set status = case when attempts + 1 >= 5 then 'rejected' else 'queued' end,
             error = SQLERRM, attempts = attempts + 1
       where id = r.id;
      v_err := v_err + 1;
    end;
  end loop;

  return jsonb_build_object('applied', v_ok, 'duplicates', v_dup,
                            'no_match', v_bad, 'errored', v_err);
end $$;

grant execute on function public.f_punch_kiosk(text,text,uuid,text),
                        public.f_punch_badge(text,uuid,text),
                        public.f_punch_phone(numeric,numeric,numeric,text),
                        public.f_drain_punch_queue(integer) to authenticated;;
