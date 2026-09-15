-- BP-13: employee_rates.provisional is GENERATED as (approved_by is null) — so a wage saved in the HR platform is
-- approved by the person who saved it (changed_by); saved with no actor it stays provisional, which is the truth.
set search_path = public;
create or replace function hr.f_wage_to_os_trigger() returns trigger
language plpgsql security definer set search_path = hr, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.new_wage is null or new.new_wage <= 0 then return new; end if;
  if not exists (select 1 from public.employees e where e.id = new.person_id) then return new; end if;
  update public.employee_rates r set effective_to = coalesce(new.effective_date, current_date) - 1
   where r.employee_id = new.person_id and r.effective_to is null and r.effective_from < coalesce(new.effective_date, current_date);
  -- a same-day row is replaced rather than stacked
  delete from public.employee_rates r where r.employee_id = new.person_id and r.effective_to is null and r.effective_from = coalesce(new.effective_date, current_date);
  insert into public.employee_rates (employee_id, basis, rate, effective_from, approved_by, note, is_placeholder)
  values (new.person_id, 'hourly', new.new_wage, coalesce(new.effective_date, current_date), new.changed_by,
          'HR platform wage change' || coalesce(': ' || new.note, '') || case when new.changed_by is null then ' (saved with no actor — provisional until approved)' else '' end, false);
  return new;
end $$;;
