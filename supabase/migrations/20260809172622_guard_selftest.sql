-- 31 of 43 registered checkers have no fixture proving they can fail. A guard nobody
-- has watched fail is a guard nobody knows works - that is the false-green pattern
-- pointed at our own safety net. This table holds the proof, and the proof re-runs.
create table if not exists guard_selftest (
  id         bigserial primary key,
  guard_key  text not null,
  case_name  text not null,
  expected   text not null,
  actual     text not null,
  passed     boolean not null,
  ran_at     timestamptz not null default now(),
  ran_by     text not null default 'tg_selftest'
);
alter table guard_selftest enable row level security;
create policy guard_selftest_read  on guard_selftest for select to authenticated using (true);
create policy guard_selftest_write on guard_selftest for insert to authenticated with check (true);

create or replace function tg_selftest_double_check(p_by text default 'tg_selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  k text := 'selftest:double-check';
  r record;
  function_result text;
begin
  create temp table if not exists _st(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _st;

  -- clean slate
  delete from finding_closure where finding_key = k;
  delete from finding_state   where finding_key = k;

  insert into finding_state(finding_key, state, source, changed_by, note)
  values (k, 'open', 'selftest', p_by, 'self-test row, deleted at the end of this function');

  -- 1. bare closure must be refused
  begin
    update finding_state set state='closed', note='trying to close with no proof at all', changed_by=p_by
    where finding_key=k;
    insert into _st values ('closing with no closure record','refused','ALLOWED IT',false);
  exception when others then
    insert into _st values ('closing with no closure record','refused',left(sqlerrm,60),true);
  end;

  insert into finding_closure(finding_key, proposed_by, claim, how_derived, proof_sql)
  values (k,'agent-alpha',
          'the self-test finding is no longer true and can be closed',
          'counted the underlying rows and found none remaining',
          'select count(*) from finding_state where finding_key = ''selftest:double-check''');

  -- 2. proposed but unverified must still be refused
  begin
    update finding_state set state='closed', note='proposed but nobody has checked it', changed_by=p_by
    where finding_key=k;
    insert into _st values ('closing on a proposal nobody verified','refused','ALLOWED IT',false);
  exception when others then
    insert into _st values ('closing on a proposal nobody verified','refused',left(sqlerrm,60),true);
  end;

  -- 3. the same agent cannot second its own work
  begin
    update finding_closure set second_by='agent-alpha', second_at=now(),
           second_how_derived='I checked my own work again and it still looks right',
           second_proof_sql='select 1 -- a different query', verdict='agrees'
    where finding_key=k;
    insert into _st values ('agent seconds its own closure','refused','ALLOWED IT',false);
  exception when others then
    insert into _st values ('agent seconds its own closure','refused',left(sqlerrm,60),true);
  end;

  -- 4. re-running the first agent's query is not an independent derivation
  begin
    update finding_closure set second_by='agent-beta', second_at=now(),
           second_how_derived='ran exactly the same query the first agent ran',
           second_proof_sql='select count(*) from finding_state where finding_key = ''selftest:double-check''',
           verdict='agrees'
    where finding_key=k;
    insert into _st values ('second agent re-runs the same SQL','refused','ALLOWED IT',false);
  exception when others then
    insert into _st values ('second agent re-runs the same SQL','refused',left(sqlerrm,60),true);
  end;

  -- 5. a genuine independent check, by someone else, another way
  begin
    update finding_closure set second_by='agent-beta', second_at=now(),
           second_how_derived='derived it from the history table instead of the state table',
           second_proof_sql='select count(*) from finding_state_history where finding_key = ''selftest:double-check''',
           second_value=0, verdict='agrees'
    where finding_key=k;
    update finding_state set state='closed', note='independently verified by agent-beta', changed_by=p_by
    where finding_key=k;
    select state into function_result from finding_state where finding_key=k;
    insert into _st values ('independently verified closure','allowed',coalesce(function_result,'(gone)'),
                            function_result = 'closed');
  exception when others then
    insert into _st values ('independently verified closure','allowed','REFUSED: '||left(sqlerrm,50),false);
  end;

  insert into guard_selftest(guard_key, case_name, expected, actual, passed, ran_by)
  select 'double_check_on_closure', s.case_name, s.expected, s.actual, s.passed, p_by from _st s;

  delete from finding_closure where finding_key = k;
  delete from finding_state   where finding_key = k;

  return query select s.case_name, s.passed, s.actual from _st s;
end;
$$;

comment on function tg_selftest_double_check(text) is
  'Proves the closure guard REFUSES the four ways round it and ALLOWS the one honest '
  'route. Records every run in guard_selftest so the proof has a date on it.';;
