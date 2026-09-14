-- v2 of the HR → OS people trigger: employment_status is an enum — cast the CASE results.
set search_path = hr, public, extensions;

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
      values (new.id, v_code, new.full_name, (case when coalesce(new.is_active, true) then 'active' else 'inactive' end)::public.employment_status, current_date, new.email, new.login_id);
    end if;
  elsif tg_op = 'UPDATE' then
    update public.employees e
       set full_name = new.full_name,
           email = coalesce(new.email, e.email),
           status = case when e.status = 'terminated'::public.employment_status then e.status
                         when coalesce(new.is_active, true) then 'active'::public.employment_status
                         else 'inactive'::public.employment_status end
     where e.id = new.id
       and (e.full_name is distinct from new.full_name or e.email is distinct from coalesce(new.email, e.email)
            or (e.status <> 'terminated'::public.employment_status and (e.status = 'active'::public.employment_status) <> coalesce(new.is_active, true)));
  end if;
  return new;
end $$;
notify pgrst, 'reload schema';;
