-- BP-12g · "HR → OS people sync direction settled".
-- THE RULING AS IMPLEMENTED: public.employees is the register (it carries the Metrc agent
-- badge, the department, the pay rate); hr.people is the HR platform's person. The two share
-- one id. OS → HR already flowed (trigger hr_sync_person on public.employees →
-- hr.sync_person_from_os). Now HR → OS flows too, so a hire entered in the HR platform exists
-- in the register the moment it is saved, and an HR-side change of name, email or active flag
-- reaches the OS row. Both triggers stop at depth 1 so neither can re-fire the other.
-- An OS user who signed in without an employee row (profile_extra.source = os_login) is a
-- login, not a hire: it is never turned into an employee.
set search_path = hr, public, extensions;

create or replace function public.f_hr_sync_person_trigger()
returns trigger language plpgsql security definer set search_path = hr, public, extensions as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform hr.sync_person_from_os(new.id);
  return new;
end $$;

create or replace function hr.f_people_to_os_trigger()
returns trigger language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_code text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if coalesce(new.profile_extra->>'source', '') = 'os_login' then return new; end if;
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.employees e where e.id = new.id) then
      v_code := coalesce(nullif(new.login_id, ''), 'HR-' || left(new.id::text, 8));
      if exists (select 1 from public.employees e where e.employee_code = v_code) then v_code := v_code || '-' || left(new.id::text, 4); end if;
      insert into public.employees (id, employee_code, full_name, status, hired_on, email, login_id)
      values (new.id, v_code, new.full_name, case when coalesce(new.is_active, true) then 'active' else 'inactive' end, current_date, new.email, new.login_id);
    end if;
  elsif tg_op = 'UPDATE' then
    update public.employees e
       set full_name = new.full_name,
           email = coalesce(new.email, e.email),
           status = case when coalesce(new.is_active, true) then (case when e.status = 'terminated' then e.status else 'active' end) else (case when e.status = 'terminated' then e.status else 'inactive' end) end
     where e.id = new.id
       and (e.full_name is distinct from new.full_name or e.email is distinct from coalesce(new.email, e.email)
            or (e.status <> 'terminated' and (e.status = 'active') <> coalesce(new.is_active, true)));
  end if;
  return new;
end $$;

drop trigger if exists hr_people_to_os on hr.people;
create trigger hr_people_to_os
  after insert or update of full_name, email, is_active on hr.people
  for each row execute function hr.f_people_to_os_trigger();

comment on trigger hr_people_to_os on hr.people is
  'HR → OS: a person created or renamed in the HR platform is created or renamed in public.employees (the register). OS → HR is trigger hr_sync_person on public.employees. Depth-guarded both ways. Bible §12g, 14 Sep 2026.';

notify pgrst, 'reload schema';;
