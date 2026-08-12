-- Smoke test caught this: clocking out very shortly after clocking in
-- produced productive_hours = -0.50, because the unpaid lunch was deducted
-- from a shift shorter than the lunch. A check constraint refused the row,
-- which is correct — but the punch then failed with a constraint error
-- instead of a message, and the person is left standing at the terminal.
--
-- Real cases this happens in: someone punches by mistake and corrects it,
-- a badge is scanned twice at a door, a tablet double-fires on a bad touch.
-- None of those should be a hard error.
--
-- Two guards: never deduct more lunch than the shift is long, and never
-- return a negative. A mis-punch is a data-quality problem for HR to
-- correct, not a crash at the clock.

create or replace function public.f_punch(
  p_employee_id uuid, p_kind text, p_source text default 'web',
  p_device_id uuid default null, p_lat numeric default null,
  p_lon numeric default null, p_accuracy_m numeric default null,
  p_at timestamptz default now())
returns table(entry_id uuid, action text, late_minutes integer,
              occurrence_id uuid, message text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_date    date := (p_at at time zone 'America/New_York')::date;
  v_open    public.time_entries%rowtype;
  v_planned time;
  v_grace   integer;
  v_late    integer := null;
  v_points  numeric(3,1);
  v_occ     uuid := null;
  v_entry   uuid;
  v_kind    text;
  v_mins    numeric;
  v_lunch   integer;
  v_hours   numeric;
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

    select planned_start into v_planned
    from public.employee_schedules
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
      values
        (p_employee_id, v_date, 'late', v_late, v_points, 'awaiting_explanation', v_entry)
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

  v_mins  := extract(epoch from (p_at - v_open.clock_in)) / 60.0;
  v_lunch := least(coalesce(v_open.unpaid_lunch_min, 0), greatest(floor(v_mins)::int, 0));
  v_hours := greatest(round((v_mins - v_lunch) / 60.0, 2), 0);

  update public.time_entries
     set clock_out = p_at,
         unpaid_lunch_min = v_lunch,
         productive_hours = v_hours,
         exception_code = case
           when v_mins < 1 then 'mispunch'
           else exception_code end
   where id = v_open.id
  returning id into v_entry;

  return query select v_entry, 'clocked_out'::text, v_open.late_minutes, null::uuid,
    case when v_mins < 1
      then 'Clocked out — but that shift was under a minute. Flagged as a mis-punch for HR to correct.'
      else format('Clocked out. %s hours.', v_hours) end::text;
end $function$;

comment on function public.f_punch is
  'One door for every punch. p_kind null INFERS direction — open punch means '
  'out, none means in — because a wall terminal must not ask a gloved hand at '
  '6:52 whether it is arriving or leaving. Two bugs found by smoke test 8 Aug '
  '2026 before any real punch: NULL NOT IN (...) is NULL not TRUE, so a null '
  'kind silently fell through to clock-out and created nothing; and an unpaid '
  'lunch longer than the shift produced negative hours and a constraint error '
  'at the terminal. Lunch is now capped at the shift length, hours never go '
  'below zero, and a sub-minute shift is flagged mispunch rather than crashing.';;
