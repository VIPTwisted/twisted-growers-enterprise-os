-- ENHANCEMENT #16, from docs/07_DEEP_SCOPE_ENHANCEMENTS.md:
--   "scheduler REFUSES an assignment when the employee's Metrc badge is
--    expired or machine qualification is missing. Turns training records
--    into an enforced control."
--
-- I built the report and the red cell. That is advisory. A manager could
-- still post a lapsed-licence shift and nothing stopped them — which is a
-- control in appearance only, and worse than none because it looks handled.
--
-- This is the enforcement. It refuses at the database, so it holds however
-- the row arrives: the builder, an agent draft, a direct insert, an import.

create or replace function public.f_guard_schedulable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_exp date; v_badge text; v_name text; v_status text; v_req text;
begin
  select e.badge_expires, e.metrc_agent_badge, e.full_name, e.status::text
    into v_exp, v_badge, v_name, v_status
  from public.employees e where e.id = new.employee_id;

  if v_name is null then
    raise exception 'No employee record for that id.' using errcode='23503';
  end if;

  if v_status <> 'active' then
    raise exception 'Cannot schedule %: they are not an active employee.', v_name
      using errcode='23514';
  end if;

  -- The licence gate. Metrc badge expired, or none held at all.
  if v_badge is null and v_exp is null then
    raise exception
      'Cannot schedule %: no Cannabis Agent Registration on file. A person without a registration cannot legally be on the floor.',
      v_name using errcode='23514';
  end if;

  if v_exp is not null and v_exp < new.work_date then
    raise exception
      'Cannot schedule % on %: their agent registration expired on %. They cannot legally work that day.',
      v_name, new.work_date, v_exp using errcode='23514';
  end if;

  -- Any other requirement marked as blocking work — training, forklift,
  -- machine qualification. The catalogue decides; this code does not.
  select string_agg(cr.name, ', ') into v_req
  from public.employee_compliance ec
  join public.compliance_requirements cr on cr.id = ec.requirement_id
  where ec.employee_id = new.employee_id
    and cr.blocks_work and cr.active
    and (ec.status = 'expired'
         or (ec.status = 'held' and ec.expires_on is not null and ec.expires_on < new.work_date));

  if v_req is not null then
    raise exception 'Cannot schedule % on %: expired requirement — %.',
      v_name, new.work_date, v_req using errcode='23514';
  end if;

  return new;
end $$;

comment on function public.f_guard_schedulable is
  'Enhancement #16 made real. Refuses a scheduled shift for anyone not active, '
  'without an agent registration, whose registration has expired by that date, or '
  'who has lapsed any requirement flagged blocks_work. Enforced at the database so '
  'it holds however the row arrives — the builder, an agent draft, an import or a '
  'direct insert. A control that only warns is not a control.';

drop trigger if exists trg_guard_schedulable on public.employee_schedules;
create trigger trg_guard_schedulable
  before insert or update of employee_id, work_date on public.employee_schedules
  for each row execute function public.f_guard_schedulable();

-- The same gate on a claimed shift: claiming is scheduling by another route.
create or replace function public.f_guard_claim()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_exp date; v_name text; v_date date;
begin
  select e.badge_expires, e.full_name into v_exp, v_name
  from public.employees e where e.id = new.employee_id;
  select o.work_date into v_date from public.open_shifts o where o.id = new.open_shift_id;

  if v_exp is not null and v_date is not null and v_exp < v_date then
    raise exception
      'Cannot claim that shift: % has an agent registration that expires on %, before the shift on %.',
      v_name, v_exp, v_date using errcode='23514';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_claim on public.shift_claims;
create trigger trg_guard_claim
  before insert on public.shift_claims
  for each row execute function public.f_guard_claim();

comment on function public.f_guard_claim is
  'Claiming an open shift is scheduling by another route, so it meets the same '
  'licence gate. Otherwise the front door is locked and the side door is open.';

-- Hot-path index, enhancement #24, which names this exact one:
--   "time_entries(employee, date)"
create index if not exists time_entries_emp_date_idx
  on public.time_entries(employee_id, work_date desc);
create index if not exists employee_schedules_emp_date_idx
  on public.employee_schedules(employee_id, work_date desc);;
