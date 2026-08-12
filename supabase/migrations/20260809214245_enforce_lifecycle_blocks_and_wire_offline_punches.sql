-- Two things I shipped as appearance rather than control. Both are mine.

-- ── 1 · blocks_start and blocks_close become real ────────────────────
-- They were flags with nothing behind them. A flag that reads "blocks" and
-- blocks nothing is worse than no flag: it tells a manager the system is
-- holding a line it is not holding.

create or replace function public.f_guard_schedulable()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_exp date; v_badge text; v_name text; v_status text; v_req text; v_steps text;
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

  select string_agg(cr.name, ', ') into v_req
  from public.employee_compliance ec
  join public.compliance_requirements cr on cr.id = ec.requirement_id
  where ec.employee_id = new.employee_id and cr.blocks_work and cr.active
    and (ec.status = 'expired'
         or (ec.status = 'held' and ec.expires_on is not null and ec.expires_on < new.work_date));
  if v_req is not null then
    raise exception 'Cannot schedule % on %: expired requirement — %.',
      v_name, new.work_date, v_req using errcode='23514';
  end if;

  -- NEW: onboarding steps marked blocks_start must be done before this person
  -- can be scheduled at all. I-9, agent registration, gowning SOP, PIN.
  select string_agg(s.title, '; ' order by s.ordinal) into v_steps
  from public.lifecycle_progress p
  join public.lifecycle_steps s on s.id = p.step_id
  where p.employee_id = new.employee_id and s.phase = 'onboarding'
    and s.blocks_start and s.active and p.done_at is null and p.na_reason is null;

  if v_steps is not null then
    raise exception
      'Cannot schedule %: onboarding is not complete. Outstanding — %.',
      v_name, v_steps using errcode='23514';
  end if;

  return new;
end $$;

comment on function public.f_guard_schedulable is
  'Enhancement #16 plus the blocks_start half of #18, enforced. Refuses a shift '
  'for anyone not active, unregistered, expired by that date, holding a lapsed '
  'blocks_work requirement, or with an incomplete blocks_start onboarding step. '
  'At the database, so it holds however the row arrives.';

-- blocks_close: a departure cannot be marked complete while a statutory
-- obligation is outstanding. Final pay, CCC deactivation, access revoked.
create or replace function public.f_guard_offboarding_close()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_open text; v_name text;
begin
  if new.status <> 'complete' or coalesce(old.status,'') = 'complete' then
    return new;
  end if;

  select e.full_name into v_name from public.employees e where e.id = new.employee_id;

  select string_agg(s.title, '; ' order by s.ordinal) into v_open
  from public.lifecycle_progress p
  join public.lifecycle_steps s on s.id = p.step_id
  where p.employee_id = new.employee_id and s.phase = 'offboarding'
    and s.blocks_close and s.active and p.done_at is null and p.na_reason is null;

  if v_open is not null then
    raise exception
      'Cannot close the departure for %: outstanding obligations — %. Mark each done, or record why it does not apply.',
      coalesce(v_name,'this employee'), v_open using errcode='23514';
  end if;

  -- Belt and braces on the two that carry a deadline, whether or not a
  -- checklist row was ever raised for this person.
  if new.ccc_deactivated_on is null then
    raise exception
      'Cannot close: the Cannabis Agent Registration has not been deactivated in Metrc. An active registration for someone who has left is a finding.'
      using errcode='23514';
  end if;
  if new.system_access_revoked_on is null then
    raise exception
      'Cannot close: system access has not been revoked. Termination must revoke at the identity layer.'
      using errcode='23514';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_offboarding_close on public.offboarding;
create trigger trg_guard_offboarding_close
  before update on public.offboarding
  for each row execute function public.f_guard_offboarding_close();

comment on function public.f_guard_offboarding_close is
  'The blocks_close half of #18. A departure cannot be marked complete while a '
  'blocks_close step is open, and never while the CCC registration is live or '
  'system access still works — the two that are regulatory rather than tidy.';

-- ── 2 · Offline punches actually become punches ──────────────────────
-- The drain marked rows applied and created nothing. That is a queue that
-- silently swallows work, which is the worst possible failure for a clock.
create or replace function public.f_drain_punch_queue(p_limit integer default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; v_emp uuid; v_res jsonb; v_te uuid;
        v_ok int := 0; v_dup int := 0; v_bad int := 0; v_err int := 0;
begin
  for r in select * from public.punch_queue
            where status = 'queued' order by punched_at limit p_limit
  loop
    select id into v_emp from public.employees
     where (r.login_id is not null and upper(login_id) = upper(r.login_id))
        or (r.badge_code is not null and badge_code = r.badge_code);

    if v_emp is null then
      update public.punch_queue
         set status='rejected', error='no matching employee', attempts = attempts + 1
       where id = r.id;
      v_bad := v_bad + 1; continue;
    end if;

    if exists (select 1 from public.time_entries t
                where t.employee_id = v_emp
                  and (abs(extract(epoch from (t.clock_in  - r.punched_at))) < 60
                    or abs(extract(epoch from (coalesce(t.clock_out, r.punched_at) - r.punched_at))) < 60)) then
      update public.punch_queue set status='duplicate' where id = r.id;
      v_dup := v_dup + 1; continue;
    end if;

    -- The punch is created with the time it HAPPENED. f_punch decides in or
    -- out and computes lateness against the schedule for that day, so an
    -- outage cannot manufacture a late arrival.
    begin
      v_res := public.f_punch(v_emp, r.kind, 'offline', r.device_id,
                              r.lat, r.lon, r.accuracy_m, r.punched_at);
      v_te := nullif(v_res->>'time_entry_id','')::uuid;
      update public.punch_queue
         set status='applied', time_entry_id = v_te, attempts = attempts + 1, error = null
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

comment on function public.f_drain_punch_queue is
  'Turns queued offline punches into real time_entries through f_punch, stamped '
  'with when they HAPPENED. A retry within sixty seconds of an existing punch is '
  'a duplicate. A punch that errors goes back to queued and is retried up to five '
  'times, then held as rejected and visible — a queue that silently swallows a '
  'punch is the worst failure a clock can have.';

-- Drain on a schedule; the terminal cannot be relied on to be awake.
select cron.schedule('hr-drain-punch-queue', '*/5 * * * *',
                     $$select public.f_drain_punch_queue(500)$$);;
