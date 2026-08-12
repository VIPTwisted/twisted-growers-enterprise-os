create or replace function tg_selftest_backfill_sweep(p_by text default 'tg_selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  k text := 'selftest:backfill';
  j text := 'selftest:backfill-fresh';
  v text;
  n integer;
begin
  create temp table if not exists _bf(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _bf;

  delete from agent_findings where fingerprint in
    ('backfill_stalled:'||k,'backfill_uncountable:'||k,'backfill_overrunning:'||k,
     'backfill_stalled:'||j,'backfill_uncountable:'||j,'backfill_overrunning:'||j);
  delete from backfill_watch where job_key in (k, j, k||':nofloorreason');

  -- CASE 1-3: a backlog genuinely flat for eight days
  insert into backfill_watch(job_key, what_it_drains, remaining_sql, accepted_floor)
  values (k, 'a self-test backlog that deliberately never drains', 'select 5', 0);
  insert into backfill_reading(job_key, remaining, read_at, read_by)
  values (k, 5, now() - interval '8 days', p_by), (k, 5, now() - interval '4 days', p_by);

  select s.verdict into v from tg_backfill_sweep(p_by) s where s.job_key = k;
  insert into _bf values ('a backlog flat for eight days reads STALLED','STALLED',coalesce(v,'(none)'), v='STALLED');

  select count(*) into n from agent_findings where fingerprint='backfill_stalled:'||k and resolved_at is null;
  insert into _bf values ('STALLED raises a finding','1 finding', n||' findings', n=1);

  update backfill_watch set remaining_sql='select 1' where job_key=k;
  select s.verdict into v from tg_backfill_sweep(p_by) s where s.job_key = k;
  select count(*) into n from agent_findings where fingerprint='backfill_stalled:'||k and resolved_at is null;
  insert into _bf values ('once it drains the finding stands down','DRAINING and 0 open',
                          coalesce(v,'?')||' and '||n||' open', v='DRAINING' and n=0);

  -- CASE 4: THE REGRESSION. Two equal readings minutes apart are NOT a seven-day stall.
  -- This is the defect that shipped on 9 Aug 2026 and was fixed the same hour: a verdict
  -- about seven days of history being drawn from minutes of it.
  insert into backfill_watch(job_key, what_it_drains, remaining_sql, accepted_floor)
  values (j, 'a self-test backlog with no history behind it yet', 'select 4', 0);
  perform tg_backfill_sweep(p_by);                       -- first reading
  select s.verdict into v from tg_backfill_sweep(p_by) s where s.job_key = j;   -- second, seconds later
  select count(*) into n from agent_findings where fingerprint='backfill_stalled:'||j and resolved_at is null;
  insert into _bf values ('two equal readings minutes apart are NOT a stall',
                          'TOO SOON TO SAY and 0 findings',
                          coalesce(v,'?')||' and '||n||' findings',
                          v='TOO SOON TO SAY' and n=0);

  -- CASE 5: a floor above zero without evidence is refused
  begin
    insert into backfill_watch(job_key, what_it_drains, remaining_sql, accepted_floor)
    values (k||':nofloorreason','a self-test backlog with an unexplained floor','select 9', 9);
    insert into _bf values ('an unexplained floor is refused','refused','ALLOWED IT',false);
  exception when others then
    insert into _bf values ('an unexplained floor is refused','refused',left(sqlerrm,55),true);
  end;

  insert into guard_selftest(guard_key, case_name, expected, actual, passed, ran_by)
  select 'backfill_sweep', s.case_name, s.expected, s.actual, s.passed, p_by from _bf s;

  delete from agent_findings where fingerprint in
    ('backfill_stalled:'||k,'backfill_uncountable:'||k,'backfill_overrunning:'||k,
     'backfill_stalled:'||j,'backfill_uncountable:'||j,'backfill_overrunning:'||j);
  delete from backfill_watch where job_key in (k, j, k||':nofloorreason');

  return query select s.case_name, s.passed, s.actual from _bf s;
end;
$$;;
