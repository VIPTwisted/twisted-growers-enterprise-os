-- DEFECT 3, same family as the first two: aggregating across a dimension that matters.
-- It counted every check that had EVER disagreed inside 30 days, so a check that failed
-- on Tuesday and has passed every run since still counted as disagreeing. Reported
-- "5 of 17 agree" when the current position is 10 of 17.
--
-- Checks flip. "Currently disagreeing" and "disagreed at some point this month" are
-- different questions and only the first belongs on a live compliance verdict. Now
-- takes the LATEST run per check.
do $$
declare src text; before_len int;
begin
  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'tg_auditor_pass';
  if src is null then raise exception 'tg_auditor_pass not found.'; end if;
  before_len := length(src);

  src := replace(src,
    'from (select count(distinct check_key) as total,
               count(distinct check_key) filter (where upper(verdict) <> ''AGREE'') as disagreeing
          from verification_runs
         where ran_at > now() - interval ''30 days'') v;',
    'from (select count(*) as total,
               count(*) filter (where upper(verdict) <> ''AGREE'') as disagreeing
          from (select distinct on (check_key) check_key, verdict
                  from verification_runs
                 order by check_key, ran_at desc) latest) v;');

  if length(src) = before_len then
    raise exception '%', 'No replacement took effect - source did not match. Refusing to recreate an unchanged function, which would look like a fix.';
  end if;

  execute 'create or replace function public.tg_auditor_pass() '
       || 'returns table(checker text, subject text, verdict text, detail text) '
       || 'language plpgsql security definer set search_path = public, pg_temp as '
       || quote_literal(src);
end $$;

revoke all on function public.tg_auditor_pass() from public, anon;
grant execute on function public.tg_auditor_pass() to authenticated;;
