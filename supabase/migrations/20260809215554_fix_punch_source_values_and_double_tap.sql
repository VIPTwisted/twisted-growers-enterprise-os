-- BUG 3, found by smoke test: time_entries.source is constrained to
-- ('kiosk','mobile','web','payroll_import','manual') but my wrappers pass
-- 'scanner', 'phone', 'offline' and 'import'. Three of the four punch sources
-- the owner asked for would have failed the moment anyone used them. Only the
-- kiosk path worked, which is exactly the one I happened to test first.
--
-- Fix: use the vocabulary that already exists where it fits, and extend it
-- only where the source is genuinely new. A door scanner is not a kiosk — it
-- takes no input and shows no screen — so it earns its own value.

alter table public.time_entries drop constraint if exists time_entries_source_check;
alter table public.time_entries add constraint time_entries_source_check
  check (source in ('kiosk','scanner','mobile','web','payroll_import','manual'));

comment on column public.time_entries.source is
  'How the punch arrived. kiosk = wall terminal with ID and PIN. scanner = badge '
  'or fob at a door, no screen and no input. mobile = a phone, geofenced. web = '
  'signed in on a computer. payroll_import = Dynamics 365 or another provider. '
  'manual = entered or corrected by HR. Offline capture is not a source — a '
  'punch queued on a tablet is still a kiosk punch; punch_queue records that it '
  'was delayed.';

-- BUG 4: clock_out > clock_in is strict, so two taps in the same instant hit a
-- constraint error at the terminal instead of a message. A double-tap on a
-- tablet is a normal human event, not an exception.
create or replace function public.f_punch(
  p_employee_id uuid, p_kind text, p_source text default 'web',
  p_device_id uuid default null, p_lat numeric default null,
  p_lon numeric default null, p_accuracy_m numeric default null,
  p_at timestamptz default now())
returns table(entry_id uuid, action text, late_minutes integer,
              occurrence_id uuid, message text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_date date := (p_at at time zone 'America/New_York')::date;
  v_open public.time_entries%rowtype;
  v_planned time; v_grace integer; v_late integer := null;
  v_points numeric(3,1); v_occ uuid := null; v_entry uuid;
  v_kind text; v_mins numeric; v_lunch integer; v_hours numeric;
begin
  select grace_minutes, points_late into v_grace, v_points
  from public.attendance_policy where id;

  select * into v_open from public.time_entries
  where employee_id = p_employee_id and clock_out is null
  order by clock_in desc limit 1;

  if p_kind is null then
    v_kind := case when v_open.id is null then 'in' else 'out' end;
  elsif p_kind in ('in','out') then
    v_kind := p_kind;
  else
    raise exception 'f_punch: p_kind must be in, out, or null to infer — got %', p_kind;
  end if;

  if v_kind = 'in' then
    if v_open.id is not null then
      return query select v_open.id, 'already_in'::text, null::integer, null::uuid,
        'Already clocked in. Clock out first.'::text;
      return;
    end if;

    select planned_start into v_planned from public.employee_schedules
    where employee_id = p_employee_id and work_date = v_date
    order by planned_start limit 1;

    if v_planned is not null then
      v_late := greatest(0, ceil(extract(epoch from
        ((p_at at time zone 'America/New_York')::time - v_planned)) / 60.0)::integer);
      if v_late <= v_grace then v_late := 0; end if;
    end if;

    insert into public.time_entries
      (employee_id, work_date, clock_in, source, device_id,
       punch_lat, punch_lon, punch_accuracy_m, late_minutes, exception_code)
    values
      (p_employee_id, v_date, p_at, p_source, p_device_id,
       p_lat, p_lon, p_accuracy_m, v_late,
       case when coalesce(v_late,0) > 0 then 'late' else null end)
    returning id into v_entry;

    if coalesce(v_late,0) > 0 then
      insert into public.attendance_occurrences
        (employee_id, work_date, kind, minutes, points, status, time_entry_id)
      values (p_employee_id, v_date, 'late', v_late, v_points, 'awaiting_explanation', v_entry)
      returning id into v_occ;
    end if;

    return query select v_entry, 'clocked_in'::text, v_late, v_occ,
      case when coalesce(v_late,0) > 0
        then format('Clocked in %s minutes late. This is an attendance occurrence '
                    'worth %s points and may result in a disciplinary warning. '
                    'If you have an excusable reason, state it now.', v_late, v_points)
        else 'Clocked in.' end::text;
    return;
  end if;

  if v_open.id is null then
    return query select null::uuid, 'not_in'::text, null::integer, null::uuid,
      'No open punch to close.'::text;
    return;
  end if;

  v_mins := extract(epoch from (p_at - v_open.clock_in)) / 60.0;

  -- A second tap within a few seconds is the same tap. Say so and change
  -- nothing, rather than erroring or recording a zero-length shift.
  if v_mins < 0.084 then                              -- about five seconds
    return query select v_open.id, 'ignored_double_tap'::text, v_open.late_minutes, null::uuid,
      'Already registered a moment ago — you are still clocked in.'::text;
    return;
  end if;

  v_lunch := least(coalesce(v_open.unpaid_lunch_min, 0), greatest(floor(v_mins)::int, 0));
  v_hours := greatest(round((v_mins - v_lunch) / 60.0, 2), 0);

  update public.time_entries
     set clock_out = p_at, unpaid_lunch_min = v_lunch, productive_hours = v_hours,
         exception_code = case when v_mins < 1 then 'mispunch' else exception_code end
   where id = v_open.id
  returning id into v_entry;

  return query select v_entry, 'clocked_out'::text, v_open.late_minutes, null::uuid,
    case when v_mins < 1
      then 'Clocked out — that shift was under a minute. Flagged as a mis-punch for HR to correct.'
      else format('Clocked out. %s hours.', v_hours) end::text;
end $function$;

-- The wrappers now pass values the constraint accepts.
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

  return jsonb_build_object('time_entry_id', v_entry, 'action', v_action,
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
    select name, 6371000 * acos(least(1, greatest(-1,
             cos(radians(p_lat))*cos(radians(lat))*cos(radians(lon)-radians(p_lon))
             + sin(radians(p_lat))*sin(radians(lat))))) as d, radius_m
    from public.punch_sites where active and lat is not null and lon is not null
  ) s where s.d <= s.radius_m order by s.d limit 1;

  if v_site is null then
    raise exception 'You are not at a work site. Phone punches are only accepted on site.'
      using errcode='42501';
  end if;

  select f.entry_id, f.action, f.late_minutes, f.occurrence_id, f.message
    into v_entry, v_action, v_late, v_occ, v_msg
  from public.f_punch(v_emp, p_kind, 'mobile', null, p_lat, p_lon, p_accuracy_m, now()) f;

  return jsonb_build_object('time_entry_id', v_entry, 'action', v_action,
    'late_minutes', coalesce(v_late,0), 'occurrence_id', v_occ,
    'message', v_msg, 'site', v_site);
end $$;

-- An offline punch is still a kiosk punch — it was merely delayed. The queue
-- records the delay; the source records the instrument.
create or replace function public.f_drain_punch_queue(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_emp uuid; v_entry uuid; v_src text;
        v_ok int := 0; v_dup int := 0; v_bad int := 0; v_err int := 0;
begin
  for r in select * from public.punch_queue
            where status='queued' order by punched_at limit p_limit
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

    select coalesce(d.kind,'kiosk') into v_src
    from public.punch_devices d where d.id = r.device_id;
    if v_src not in ('kiosk','scanner') then v_src := 'kiosk'; end if;

    begin
      select f.entry_id into v_entry
      from public.f_punch(v_emp, r.kind, v_src, r.device_id,
                          r.lat, r.lon, r.accuracy_m, r.punched_at) f;
      update public.punch_queue set status='applied', time_entry_id = v_entry,
             attempts = attempts + 1, error = null where id = r.id;
      v_ok := v_ok + 1;
    exception when others then
      update public.punch_queue
         set status = case when attempts + 1 >= 5 then 'rejected' else 'queued' end,
             error = SQLERRM, attempts = attempts + 1 where id = r.id;
      v_err := v_err + 1;
    end;
  end loop;
  return jsonb_build_object('applied', v_ok, 'duplicates', v_dup,
                            'no_match', v_bad, 'errored', v_err);
end $$;

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
      (employee_id, work_date, clock_in, clock_out, unpaid_lunch_min,
       source, device_id, source_ref, created_at)
    values
      (v_emp, (r->>'work_date')::date, (r->>'clock_in')::timestamptz,
       nullif(r->>'clock_out','')::timestamptz, coalesce((r->>'unpaid_lunch_min')::int,0),
       'payroll_import', p_device_id, p_source_system || ':' || coalesce(r->>'ref',''), now());
    v_ok := v_ok + 1;
  end loop;
  return jsonb_build_object('imported', v_ok, 'skipped', v_skip, 'errors', v_err);
end $$;;
