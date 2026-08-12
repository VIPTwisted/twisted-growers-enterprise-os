-- Staff-facing login ID: first initial + surname, middle initial added on
-- collision. Kept SEPARATE from employee_code — E001..E021 is the stable
-- join key for v_payroll_forecast, v_employee_capacity and both editing
-- triggers. Renaming that key would break live pages; a login ID is a
-- label for humans and can change when someone marries.

alter table public.employees
  add column if not exists login_id text;

create unique index if not exists employees_login_id_key
  on public.employees(login_id) where login_id is not null;

comment on column public.employees.login_id is
  'Sign-in identifier: first initial + surname, uppercased, non-letters stripped. '
  'Middle initial inserted when two people would otherwise collide. '
  'Not a key — employee_code is. Safe to reissue if a name changes.';

-- Names are stored "Last, First M". Parse accordingly.
create or replace function public.f_login_id_parts(p_full_name text)
returns table (surname text, first_i text, middle_i text)
language sql immutable as $$
  select
    upper(regexp_replace(split_part(p_full_name, ',', 1), '[^A-Za-z]', '', 'g')),
    upper(left(regexp_replace(split_part(btrim(split_part(p_full_name, ',', 2)), ' ', 1),
          '[^A-Za-z]', '', 'g'), 1)),
    upper(left(regexp_replace(coalesce(nullif(split_part(btrim(split_part(p_full_name, ',', 2)), ' ', 2), ''), ''),
          '[^A-Za-z]', '', 'g'), 1))
$$;

-- Assign in a stable order so a re-run produces the same answer. The first
-- holder of a colliding name keeps the short form; later ones take the
-- middle initial. If there is no middle initial to fall back on, a numeric
-- suffix is used rather than silently failing.
create or replace function public.f_assign_login_ids(p_dry_run boolean default true)
returns table (employee_code text, full_name text, proposed_login_id text, note text)
language plpgsql security definer set search_path = public as $$
declare r record; v_try text; v_note text; v_n int;
begin
  create temp table _claimed (lid text primary key) on commit drop;
  insert into _claimed
    select e.login_id from public.employees e where e.login_id is not null;

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

    v_try := r.first_i || r.surname;
    v_note := 'first initial + surname';

    if exists (select 1 from _claimed where lid = v_try) then
      if r.middle_i <> '' then
        v_try := r.first_i || r.middle_i || r.surname;
        v_note := 'collision — middle initial added';
      end if;
      v_n := 1;
      while exists (select 1 from _claimed where lid = v_try) loop
        v_n := v_n + 1;
        v_try := r.first_i || coalesce(nullif(r.middle_i,''),'') || r.surname || v_n::text;
        v_note := 'collision — no distinct middle initial, numeric suffix';
      end loop;
    end if;

    insert into _claimed values (v_try);
    if not p_dry_run then
      update public.employees set login_id = v_try where id = r.id;
    end if;

    employee_code := r.employee_code; full_name := r.full_name;
    proposed_login_id := v_try; note := v_note;
    return next;
  end loop;
end $$;

revoke all on function public.f_assign_login_ids(boolean) from public;
grant execute on function public.f_assign_login_ids(boolean) to authenticated;;
