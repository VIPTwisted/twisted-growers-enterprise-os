-- Owner's rule, 8 Aug 2026: on a duplicate, number it — BAC, then BAC2,
-- BAC3. Do not silently shorten to BC; two people whose IDs differ only
-- by a dropped initial is exactly how a punch lands on the wrong person.
--
-- Uniqueness is checked against EVERY employee, not just active ones. A
-- leaver's ID must never be handed to a new hire: their punches, warnings
-- and timecards still point at it, and reissuing it would silently merge
-- two people's records.

create or replace function public.f_next_login_id(p_full_name text)
returns text language plpgsql stable security definer set search_path = public as $$
declare p record; v_base text; v_try text; v_n int := 1;
begin
  select * into p from public.f_login_id_parts(p_full_name);
  if p.surname = '' or p.first_i = '' then
    raise exception 'Cannot derive a login ID from "%" — expected "Last, First M"', p_full_name;
  end if;

  v_base := p.first_i || p.middle_i || left(p.surname, 1);
  v_try  := v_base;
  while exists (select 1 from public.employees where login_id = v_try) loop
    v_n := v_n + 1;
    v_try := v_base || v_n::text;
  end loop;
  return v_try;
end $$;

comment on function public.f_next_login_id is
  'Login ID for one person: first+middle+surname initial, or first+surname when '
  'there is no middle name. Numbered on collision — BAC, BAC2, BAC3. Checked '
  'against all employees including leavers, so an ID is never reused.';

create or replace function public.f_assign_login_ids(p_dry_run boolean default true)
returns table (employee_code text, full_name text, proposed_login_id text, note text)
language plpgsql security definer set search_path = public as $$
declare r record; v_try text; v_base text; v_n int;
begin
  create temp table _claimed (lid text primary key) on commit drop;
  insert into _claimed select e.login_id from public.employees e where e.login_id is not null;

  for r in
    select e.id, e.employee_code, e.full_name, p.surname, p.first_i, p.middle_i
    from public.employees e, lateral public.f_login_id_parts(e.full_name) p
    where e.login_id is null
    order by e.employee_code
  loop
    if r.surname = '' or r.first_i = '' then
      employee_code := r.employee_code; full_name := r.full_name;
      proposed_login_id := null; note := 'SKIPPED — cannot parse name';
      return next; continue;
    end if;

    v_base := r.first_i || r.middle_i || left(r.surname, 1);
    v_try := v_base; v_n := 1;
    while exists (select 1 from _claimed where lid = v_try) loop
      v_n := v_n + 1;
      v_try := v_base || v_n::text;
    end loop;

    insert into _claimed values (v_try);
    if not p_dry_run then
      update public.employees set login_id = v_try where id = r.id;
    end if;

    employee_code := r.employee_code; full_name := r.full_name;
    proposed_login_id := v_try;
    note := case when v_n > 1 then 'collision — numbered'
                 when r.middle_i = '' then 'initials — no middle name'
                 else 'initials' end;
    return next;
  end loop;
end $$;

-- New hires get an ID automatically on insert. Nobody has to remember to run
-- the batch, and the rule cannot drift between the two code paths.
create or replace function public.f_employee_login_id_bi()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.login_id is null and new.full_name is not null then
    begin
      new.login_id := public.f_next_login_id(new.full_name);
    exception when others then
      new.login_id := null;   -- unparseable name: leave it for HR rather than block the hire
    end;
  end if;
  return new;
end $$;

drop trigger if exists trg_employee_login_id on public.employees;
create trigger trg_employee_login_id
  before insert on public.employees
  for each row execute function public.f_employee_login_id_bi();;
