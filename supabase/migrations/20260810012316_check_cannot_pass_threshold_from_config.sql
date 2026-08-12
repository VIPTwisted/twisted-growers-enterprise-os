-- Rule G1, owner "NO HARDWIRING". The CANNOT PASS threshold was the literal 10 frozen inside
-- the auditor. Ten runs of a 20-minute check is a few hours; ten runs of a nightly check is a
-- fortnight. The right number depends on cadence, so it belongs in a row.
-- Rewritten in place from the live definition so nothing else in the body can drift.
do $$
declare v_def text;
begin
  select replace(
           pg_get_functiondef(p.oid),
           'if v_runs >= 10 then',
           'if v_runs >= coalesce(f_rule(''check_cannot_pass_min_runs''), 10)::int then')
    into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'tg_verification_checks_sane';

  if v_def is null then
    raise exception 'tg_verification_checks_sane not found';
  end if;
  if v_def !~ 'check_cannot_pass_min_runs' then
    raise exception 'substitution did not apply - the literal was not found where expected';
  end if;

  execute v_def;
end $$;;
