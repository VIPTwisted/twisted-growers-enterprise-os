-- Postgres refuses `set local role` inside a SECURITY DEFINER function: "cannot set parameter
-- role within security-definer function". This check exists precisely to drop privilege and
-- compare, so definer is the wrong mode for it.
--
-- SECURITY INVOKER instead, with EXECUTE restricted. Run by cron the invoker is the superuser that
-- owns the schema, so the privileged read is real. A staff caller could otherwise run it and write
-- a ledger row from their own limited view — a check that can be made to lie about itself is worse
-- than no check, so EXECUTE is revoked from PUBLIC and granted only to the roles that already hold
-- everything.
create or replace function public.tg_all_clear_falsifier(p_selftest_extra int default null)
returns text
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v         record;
  as_owner  jsonb;
  as_staff  jsonb;
  hazards   int := 0;
  examined  int := 0;
  offenders text[] := '{}';
begin
  for v in
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'v'
       and pg_get_viewdef(c.oid, true) ~* '\y(count|sum|avg|bool_and|bool_or)\s*\('
       and pg_get_viewdef(c.oid, true) !~* '\ygroup\s+by\y'
       and pg_get_viewdef(c.oid, true) ~* '=\s*0\y|\ycase\y'
       and pg_get_viewdef(c.oid, true) !~* '=\s*0\s+then'
     order by c.relname
  loop
    examined := examined + 1;

    begin
      execute format('select to_jsonb(t) from (select * from public.%I limit 1) t', v.relname)
        into as_owner;
    exception when others then continue;
    end;

    begin
      set local role authenticated;
      begin
        execute format('select to_jsonb(t) from (select * from public.%I limit 1) t', v.relname)
          into as_staff;
      exception when others then
        as_staff := null;
      end;
      reset role;
    exception when others then
      reset role;   /* never leave the session wearing a borrowed role */
      as_staff := null;
    end;

    if as_staff is not null and as_owner is not null and as_staff <> as_owner then
      hazards := hazards + 1;
      offenders := offenders || v.relname;
    end if;
  end loop;

  if p_selftest_extra is not null then
    hazards := hazards + greatest(p_selftest_extra, 0);
    offenders := offenders || format('SELF-TEST(+%s)', greatest(p_selftest_extra, 0));
  end if;

  insert into conformance_ledger
    (checker_key, subject_kind, subject_ref, verdict, numerator, denominator,
     the_arithmetic, drill, note)
  values
    ('detect.all_clear_falsifier', 'metric', 'views_that_reassure_when_blind',
     case when hazards = 0 then 'PASS' else 'FAIL' end,
     examined - hazards, examined,
     format('%s of %s ungrouped-aggregate views tell a signed-in user a DIFFERENT story than they '
            || 'tell the owner, while carrying no explicit zero-case to say they are blind. A view '
            || 'like this gets quieter as it gets worse. %s',
            hazards, examined,
            case when hazards = 0 then 'None found.'
                 else 'Found: ' || array_to_string(offenders, ', ') end),
     'Read the view as owner, then: set local role authenticated; select * from <view>; — if the '
     || 'answer changes and nothing in the output admits the caller is blind, that is the defect.',
     case when p_selftest_extra is not null then 'SELF-TEST: count inflated. Not a measurement.' end);

  return format('%s — %s hazard(s) of %s ungrouped-aggregate views examined%s',
                case when hazards = 0 then 'PASS' else 'FAIL' end, hazards, examined,
                case when hazards = 0 then '' else ': ' || array_to_string(offenders, ', ') end);
end $fn$;

revoke execute on function public.tg_all_clear_falsifier(int) from public;
grant  execute on function public.tg_all_clear_falsifier(int) to postgres, service_role;;
