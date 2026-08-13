/* Supersedes the copy of tg_selftest_data_assertion_gate in migration
   20260813135924. That version wrote a one-line `why` into ratchet_exception and
   ratchet_exception has a check constraint demanding a real reason, so the
   function raised on its own door test. Fixed live with execute_sql, which left
   the repository holding a version that differs from production — the exact drift
   migration-drift.mjs exists to prevent. Recorded as a migration so what runs is
   what is on file. Agent W, 13 Aug 2026. */

create or replace function tg_selftest_data_assertion_gate(p_by text default 'tg_selftest')
returns table (case_name text, passed boolean, actual text)
language plpgsql
set search_path to 'public','pg_temp'
as $fn$
declare k text := 'selftest:assertion-gate'; xid bigint;
begin
  create temp table if not exists _ag(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _ag;
  delete from data_assertion where assertion_key like k || '%';
  delete from ratchet_exception where metric_key like 'data_assertion:' || k || '%';

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

  begin
    insert into data_assertion (assertion_key,title,domain,violation_sql,what_it_proves,
                                why_it_matters,accountable_to,enabled,max_allowed,allowance_reason)
    values (k||':off','switched off','selftest','select 1 as subject, 2 as detail','x','y',
            'nobody',false,5,'a throwaway selftest row carrying debt so the ratchet can be exercised');
    insert into _ag values ('a disabled assertion needs no fixture','allowed','allowed',true);
  exception when others then
    insert into _ag values ('a disabled assertion needs no fixture','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  begin
    update data_assertion set max_allowed = 4 where assertion_key = k||':off';
    insert into _ag values ('the violation allowance may FALL','allowed','5 -> 4 allowed',true);
  exception when others then
    insert into _ag values ('the violation allowance may FALL','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  begin
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';
    insert into _ag values ('the violation allowance may not RISE','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('the violation allowance may not RISE','refused',left(sqlerrm,60),true);
  end;

  /* The reason below is long ON PURPOSE: ratchet_exception constrains it, because a
     rise in recorded debt without a real explanation is how a ratchet quietly stops
     meaning anything. The first draft of this selftest wrote one line and was refused
     by that constraint — the guard was right and the test was wrong. */
  insert into ratchet_exception (metric_key, from_baseline, to_baseline, why, approved_by, must_fall_by)
  values ('data_assertion:'||k||':off', 4, 9,
          'Self-test of the recorded-decision door on the assertion allowance ratchet. This row '
          'is created and deleted inside tg_selftest_data_assertion_gate and never describes real '
          'debt; it exists so the platform can prove the only sanctioned way to raise a ratchet '
          'still works, and that a consumed exception cannot be used twice.',
          'tg_selftest', current_date + 1)
  returning id into xid;
  begin
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';
    insert into _ag values ('a recorded owner decision opens the door','allowed','allowed',true);
  exception when others then
    insert into _ag values ('a recorded owner decision opens the door','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  begin
    update data_assertion set max_allowed = 4 where assertion_key = k||':off';
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';
    insert into _ag values ('a consumed exception cannot be reused','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('a consumed exception cannot be reused','refused',left(sqlerrm,60),true);
  end;

  insert into guard_selftest (guard_key, case_name, expected, actual, passed, ran_by)
  select 'data_assertion_gate', s.case_name, s.expected, s.actual, s.passed, p_by from _ag s;

  delete from data_assertion where assertion_key like k || '%';
  delete from ratchet_exception where metric_key like 'data_assertion:' || k || '%';
  return query select s.case_name, s.passed, s.actual from _ag s;
end $fn$;
;
