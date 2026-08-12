-- A fixture gate with no fixture would be the joke that writes itself.
create or replace function tg_selftest_fixture_gate(p_by text default 'tg_selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql volatile security invoker set search_path = public, pg_temp
as $$
declare k text := 'selftest:fixture-gate'; ok boolean; b integer;
begin
  create temp table if not exists _fg(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _fg;
  delete from checker_registry where checker_key like k||'%';

  -- 1. enabled with nothing proving it → refused
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,fixture_proves_it_fails)
    values (k,'a self-test checker with no fixture at all','detect','nowhere',true,false);
    insert into _fg values ('enabled with no fixture','refused','ALLOWED IT',false);
  exception when others then
    insert into _fg values ('enabled with no fixture','refused',left(sqlerrm,55),true);
  end;

  -- 2. claiming a fixture but naming none → refused
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,fixture_proves_it_fails)
    values (k||':claims','a self-test checker that claims proof it cannot name','detect','nowhere',true,true);
    insert into _fg values ('claims a fixture but names none','refused','ALLOWED IT',false);
  exception when others then
    insert into _fg values ('claims a fixture but names none','refused',left(sqlerrm,55),true);
  end;

  -- 3. positive case only, no negative case → refused. THIS is the one that matters:
  --    all seven recorded defects were false alarms, which only a negative case catches.
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,
                                 fixture_proves_it_fails,fixture_selftest_fn,fixture_positive_case)
    values (k||':nonneg','a self-test checker proving only that it fires','detect','nowhere',
            true,true,'some_fn','it fires when the thing is wrong');
    insert into _fg values ('no negative case','refused','ALLOWED IT',false);
  exception when others then
    insert into _fg values ('no negative case','refused',left(sqlerrm,55),true);
  end;

  -- 4. grandfathered with no reason → refused
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,
                                 fixture_proves_it_fails,grandfathered)
    values (k||':nogf','a self-test checker grandfathered with a shrug','detect','nowhere',
            true,false,true);
    insert into _fg values ('grandfathered with no reason','refused','ALLOWED IT',false);
  exception when others then
    insert into _fg values ('grandfathered with no reason','refused',left(sqlerrm,55),true);
  end;

  -- 5. NEGATIVE CASE: a properly evidenced checker must be ALLOWED. A gate that blocks
  --    honest work gets switched off, and a switched-off gate is worse than none.
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,
                                 fixture_proves_it_fails,fixture_selftest_fn,
                                 fixture_positive_case,fixture_negative_case)
    values (k||':good','a self-test checker with both halves','detect','nowhere',true,true,
            'tg_selftest_fixture_gate','it fires on a real violation',
            'it stays quiet on a legitimate case');
    select true into ok;
    insert into _fg values ('a properly evidenced checker is ALLOWED','allowed','allowed',true);
  exception when others then
    insert into _fg values ('a properly evidenced checker is ALLOWED','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- 6. NEGATIVE CASE: a DISABLED checker needs no fixture and must be allowed.
  begin
    insert into checker_registry(checker_key,title,tier,runs_where,enabled,fixture_proves_it_fails)
    values (k||':off','a self-test checker that is switched off','detect','nowhere',false,false);
    insert into _fg values ('a disabled checker needs no fixture','allowed','allowed',true);
  exception when others then
    insert into _fg values ('a disabled checker needs no fixture','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- 7. the ratchet may not rise
  select baseline into b from ratchet_baseline where metric_key='checkers_without_a_fixture';
  begin
    update ratchet_baseline set baseline = b + 1 where metric_key='checkers_without_a_fixture';
    insert into _fg values ('the debt ratchet may not rise','refused','ALLOWED IT',false);
  exception when others then
    insert into _fg values ('the debt ratchet may not rise','refused',left(sqlerrm,55),true);
  end;

  insert into guard_selftest(guard_key, case_name, expected, actual, passed, ran_by)
  select 'fixture_gate', s.case_name, s.expected, s.actual, s.passed, p_by from _fg s;

  delete from checker_registry where checker_key like k||'%';
  return query select s.case_name, s.passed, s.actual from _fg s;
end;
$$;;
