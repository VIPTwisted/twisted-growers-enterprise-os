-- Make the two existing HR pages editable without touching the UI.
-- INSTEAD OF triggers route edits to the real tables underneath, and the
-- effective-dating on employee_rates is respected: a wage change closes
-- the old row and opens a new one. Overwriting a rate in place would
-- silently rewrite payroll history, which is the one thing you must not
-- be able to do by clicking a cell.

-- ── Payroll Forecast ─────────────────────────────────────────────────
create or replace function public.f_payroll_forecast_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp  uuid;
  v_cur  public.employee_rates%rowtype;
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to change pay. Owner, HR or admin only.'
      using errcode = '42501';
  end if;

  select id into v_emp from public.employees where employee_code = old.employee_code;
  if v_emp is null then
    raise exception 'No employee with code %', old.employee_code;
  end if;

  -- Planned hours live on the employee, not the rate.
  if new.planned_hours is distinct from old.planned_hours then
    if new.planned_hours < 0 or new.planned_hours > 80 then
      raise exception 'Planned hours must be between 0 and 80, got %', new.planned_hours;
    end if;
    update public.employees set weekly_target_hours = new.planned_hours where id = v_emp;
  end if;

  -- Rate or basis change → effective-dated roll.
  if new.rate is distinct from old.rate or new.basis is distinct from old.basis then
    if new.rate is null or new.rate <= 0 then
      raise exception 'Rate must be greater than zero, got %', new.rate;
    end if;

    select * into v_cur from public.employee_rates
    where employee_id = v_emp
      and effective_from <= current_date
      and (effective_to is null or effective_to >= current_date)
    order by effective_from desc limit 1;

    if v_cur.effective_from = current_date then
      -- Already changed today; correct that row rather than stack duplicates.
      update public.employee_rates
         set rate = new.rate, basis = new.basis, approved_by = auth.uid()
       where id = v_cur.id;
    else
      update public.employee_rates
         set effective_to = current_date - 1
       where id = v_cur.id;

      insert into public.employee_rates
        (employee_id, basis, rate, ot_multiplier, burden_pct,
         effective_from, effective_to, approved_by, note)
      values
        (v_emp, new.basis, new.rate,
         coalesce(v_cur.ot_multiplier, 1.5), coalesce(v_cur.burden_pct, 0),
         current_date, null, auth.uid(),
         format('Changed from %s %s via Payroll Forecast', v_cur.rate, v_cur.basis));
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_payroll_forecast_upd on public.v_payroll_forecast;
create trigger trg_payroll_forecast_upd
  instead of update on public.v_payroll_forecast
  for each row execute function public.f_payroll_forecast_upd();

-- ── Work Schedules ───────────────────────────────────────────────────
create or replace function public.f_employee_capacity_upd()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_emp   uuid;
  v_days  integer;
  v_per   numeric;
  v_start time := time '07:00';
begin
  if not public.f_can_decide_hr() then
    raise exception 'Not permitted to change work schedules. Owner, HR or admin only.'
      using errcode = '42501';
  end if;

  select id into v_emp from public.employees where employee_code = old.employee_code;
  if v_emp is null then
    raise exception 'No employee with code %', old.employee_code;
  end if;

  if new.payroll_target_hours is distinct from old.payroll_target_hours then
    update public.employees set weekly_target_hours = new.payroll_target_hours where id = v_emp;
  end if;

  -- Capacity is a SUM over employee_work_schedules, so a new weekly total
  -- has to be distributed back across days. Even split over the requested
  -- day count, Monday first. Anyone needing uneven days edits the
  -- underlying rows directly — this is the sane default, not the only way.
  if new.weekly_capacity_hours is distinct from old.weekly_capacity_hours
     or new.days_per_week is distinct from old.days_per_week then

    v_days := coalesce(new.days_per_week, old.days_per_week, 5);
    if v_days < 1 or v_days > 7 then
      raise exception 'Days per week must be 1 to 7, got %', v_days;
    end if;
    if coalesce(new.weekly_capacity_hours,0) <= 0 then
      raise exception 'Weekly capacity must be greater than zero';
    end if;

    v_per := round(new.weekly_capacity_hours::numeric / v_days, 2);
    if v_per > 24 then
      raise exception 'That is % hours per day across % days', v_per, v_days;
    end if;

    delete from public.employee_work_schedules where employee_id = v_emp;
    insert into public.employee_work_schedules (employee_id, weekday, start_time, end_time)
    select v_emp, g, v_start, v_start + (v_per || ' hours')::interval
    from generate_series(1, v_days) g;
  end if;

  return new;
end $$;

drop trigger if exists trg_employee_capacity_upd on public.v_employee_capacity;
create trigger trg_employee_capacity_upd
  instead of update on public.v_employee_capacity
  for each row execute function public.f_employee_capacity_upd();

grant select, update on public.v_payroll_forecast  to authenticated;
grant select, update on public.v_employee_capacity to authenticated;

comment on function public.f_payroll_forecast_upd is
  'INSTEAD OF UPDATE on v_payroll_forecast. rate/basis roll effective-dated into '
  'employee_rates; planned_hours writes to employees.weekly_target_hours. The three '
  'cost columns are computed and silently ignored if edited.';
comment on function public.f_employee_capacity_upd is
  'INSTEAD OF UPDATE on v_employee_capacity. Weekly capacity is distributed evenly '
  'across days_per_week into employee_work_schedules.';;
