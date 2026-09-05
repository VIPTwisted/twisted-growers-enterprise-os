-- Applied prod 20260904220452. All public TABLE triggers ENABLE ALWAYS.
-- Views cannot take ENABLE ALWAYS (v_payroll_forecast, v_employee_capacity remain O).
do $$
declare r record;
begin
  for r in
    select c.relname, t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not t.tgisinternal
      and t.tgenabled = 'O'
  loop
    execute format('alter table public.%I enable always trigger %I', r.relname, r.tgname);
  end loop;
end $$;
