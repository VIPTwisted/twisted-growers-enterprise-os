-- Login ID is initials only: first + middle + surname initial. BAC for
-- Brenda A Correia. Short enough to type on a wall terminal with gloves,
-- which is the whole point. Falls back to first+surname when there is no
-- middle name, then to a numeric suffix if two people still collide.

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

    -- first + middle + surname initial
    v_try  := r.first_i || r.middle_i || left(r.surname, 1);
    v_note := case when r.middle_i = '' then 'initials — no middle name'
                   else 'initials' end;

    if exists (select 1 from _claimed where lid = v_try) then
      -- Already taken. Try the two-letter form, then number it.
      if r.middle_i <> '' and not exists
        (select 1 from _claimed where lid = r.first_i || left(r.surname,1)) then
        v_try := r.first_i || left(r.surname, 1);
        v_note := 'collision — dropped middle initial';
      else
        v_n := 1;
        loop
          v_n := v_n + 1;
          v_try := r.first_i || r.middle_i || left(r.surname,1) || v_n::text;
          exit when not exists (select 1 from _claimed where lid = v_try);
        end loop;
        v_note := 'collision — numeric suffix';
      end if;
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

comment on function public.f_assign_login_ids is
  'Initials login ID: first + middle + surname initial (BAC = Brenda A Correia). '
  'Run with p_dry_run := true to preview, false to commit. Re-runnable — only '
  'fills employees with a null login_id, so existing IDs are never reissued.';;
