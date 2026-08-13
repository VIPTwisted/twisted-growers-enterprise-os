/* The gate on data_assertion refuses an assertion that cannot prove itself. Until
   this migration, nothing proved the GATE. That is the same shape as 8 Aug 2026,
   when the SQL guard passed all twenty of its own fixtures while DROP TABLE
   watchdog_findings walked straight through: the tests were green and the thing
   they were guarding was open. Agent W, 13 Aug 2026. */

create or replace function tg_selftest_data_assertion_gate(p_by text default 'tg_selftest')
returns table (case_name text, passed boolean, actual text)
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare k text := 'selftest:assertion-gate'; m int;
begin
  create temp table if not exists _ag(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _ag;
  delete from data_assertion where assertion_key like k || '%';

  -- 1. enabled with no positive fixture -> refused
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,fixture_negative_schema,
                                fixture_shadows,fixture_positive_case,fixture_negative_case)
    values (k,'no positive half','selftest','select 1 as subject, 2 as detail','x','y','nobody',
            'tg_fx_neg_gencol',array['metrc_harvests'],'pos','neg');
    insert into _ag values ('enabled with no POSITIVE fixture','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('enabled with no POSITIVE fixture','refused',left(sqlerrm,60),true);
  end;

  -- 2. enabled with no negative fixture -> refused. THE HALF THAT MATTERS:
  --    a wrong label costs more than no label, and only the negative half catches it.
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,fixture_positive_schema,
                                fixture_shadows,fixture_positive_case,fixture_negative_case)
    values (k||':noneg','no negative half','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody','tg_fx_pos_gencol',array['metrc_harvests'],'pos','neg');
    insert into _ag values ('enabled with no NEGATIVE fixture','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('enabled with no NEGATIVE fixture','refused',left(sqlerrm,60),true);
  end;

  -- 3. no shadowed relations named -> refused, because the fixture would then be
  --    reading production and proving nothing while looking green.
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,fixture_positive_schema,
                                fixture_negative_schema,fixture_positive_case,fixture_negative_case)
    values (k||':noshadow','names no shadows','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody','tg_fx_pos_gencol','tg_fx_neg_gencol','pos','neg');
    insert into _ag values ('names no shadowed relations','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('names no shadowed relations','refused',left(sqlerrm,60),true);
  end;

  -- 4. tolerating violations without a reason -> refused
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,fixture_positive_schema,
                                fixture_negative_schema,fixture_shadows,
                                fixture_positive_case,fixture_negative_case,max_allowed)
    values (k||':debt','tolerates debt silently','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody','tg_fx_pos_gencol','tg_fx_neg_gencol',array['metrc_harvests'],'pos','neg',5);
    insert into _ag values ('tolerates violations with no reason','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('tolerates violations with no reason','refused',left(sqlerrm,60),true);
  end;

  -- 5. NEGATIVE CASE: a properly evidenced assertion must be ALLOWED. A gate that
  --    blocks honest work gets switched off, and a switched-off gate is worse than none.
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,fixture_positive_schema,
                                fixture_negative_schema,fixture_shadows,
                                fixture_positive_case,fixture_negative_case)
    values (k||':good','both halves named','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody','tg_fx_pos_gencol','tg_fx_neg_gencol',array['metrc_harvests'],'pos','neg');
    insert into _ag values ('a fully evidenced assertion is ALLOWED','allowed','allowed',true);
  exception when others then
    insert into _ag values ('a fully evidenced assertion is ALLOWED','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- 6. NEGATIVE CASE: a DISABLED assertion needs no fixture and must be allowed.
  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,enabled)
    values (k||':off','switched off','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody',false);
    insert into _ag values ('a disabled assertion needs no fixture','allowed','allowed',true);
  exception when others then
    insert into _ag values ('a disabled assertion needs no fixture','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- 7. the allowance ratchet may fall but never rise
  select max_allowed into m from data_assertion
   where assertion_key = 'schema.one_definition_per_registered_primitive';
  begin
    update data_assertion set max_allowed = m + 1
     where assertion_key = 'schema.one_definition_per_registered_primitive';
    insert into _ag values ('the violation allowance may not RISE','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('the violation allowance may not RISE','refused',left(sqlerrm,60),true);
  end;

  -- 8. NEGATIVE CASE: and it must still be allowed to FALL, or debt can never be paid off.
  begin
    update data_assertion set max_allowed = greatest(m - 1, 0)
     where assertion_key = 'schema.one_definition_per_registered_primitive';
    update data_assertion set max_allowed = m
     where assertion_key = 'schema.one_definition_per_registered_primitive';
    insert into _ag values ('the violation allowance may FALL','allowed','allowed',true);
  exception when others then
    insert into _ag values ('the violation allowance may FALL','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  insert into guard_selftest (guard_key, case_name, expected, actual, passed, ran_by)
  select 'data_assertion_gate', s.case_name, s.expected, s.actual, s.passed, p_by from _ag s;

  delete from data_assertion where assertion_key like k || '%';
  return query select s.case_name, s.passed, s.actual from _ag s;
end $$;

insert into checker_registry
  (checker_key, title, tier, runs_where, subject_kind, fixture_proves_it_fails, enabled,
   fixture_selftest_fn, fixture_positive_case, fixture_negative_case, note)
values
('trigger.assertion_fixture_gate',
 'data_assertion refuses an assertion that cannot prove it can fail',
 'prevent', 'database trigger trg_require_assertion_fixture on data_assertion', 'checker',
 true, true, 'tg_selftest_data_assertion_gate',
 'An assertion enabled with no positive half, with no negative half, naming no shadowed '
 'relations, or tolerating violations with no written reason — all four refused.',
 'A fully evidenced assertion and a disabled one are both allowed through, and the violation '
 'allowance is still permitted to FALL. A gate that blocks honest work gets switched off, and '
 'debt that cannot be paid down is not a ratchet.',
 'Written 13 Aug 2026 because the gate itself had no fixture — the same shape as the SQL guard '
 'passing twenty fixtures on 8 Aug while DROP TABLE walked through it.')
on conflict (checker_key) do update set
  fixture_selftest_fn = excluded.fixture_selftest_fn,
  fixture_positive_case = excluded.fixture_positive_case,
  fixture_negative_case = excluded.fixture_negative_case;
;
