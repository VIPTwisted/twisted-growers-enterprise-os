/* MY OWN NEGATIVE FIXTURE CAUGHT THIS. Agent W, 13 Aug 2026.
 *
 * tg_assertion_allowance_ratchet refused a rise with no door at all — stricter
 * than every other ratchet in this database. tg_ratchet_guard on ratchet_baseline
 * has honoured a recorded owner decision since 13 Aug: a ratchet_exception naming
 * the exact rise, why it is unavoidable, who approved it and the date it must fall
 * by, consumed once and then gone.
 *
 * A guard with no door is not stricter in practice, it is weaker. When new debt is
 * genuinely unavoidable the absolute version leaves one option — switch the trigger
 * off — and a switched-off gate is worse than none. Worse, it diverges from the
 * house pattern, so the next person meets two ratchets that behave differently and
 * trusts neither.
 *
 * Found because the negative half of tg_selftest_data_assertion_gate asserted the
 * allowance must still be able to FALL, and the test could not restore the value it
 * had lowered. The half that stops a false alarm found a real design fault instead.
 * ========================================================================== */

create or replace function tg_assertion_allowance_ratchet()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
declare x ratchet_exception%rowtype; k text;
begin
  if new.max_allowed > old.max_allowed then
    /* Same table, same shape, namespaced so it cannot collide with a
       ratchet_baseline metric of the same name. */
    k := 'data_assertion:' || new.assertion_key;

    select * into x from ratchet_exception
     where metric_key = k
       and from_baseline = old.max_allowed
       and to_baseline = new.max_allowed
       and consumed_at is null
     order by approved_at limit 1;

    if not found then
      raise exception
        'Assertion %: tolerated violations may not rise from % to %.',
        new.assertion_key, old.max_allowed, new.max_allowed
        using hint = 'This number records debt. It may fall as debt is paid and may never rise. '
                     'If new debt is genuinely unavoidable, that is the owner''s decision and it '
                     'is recorded as one: insert a ratchet_exception with metric_key '
                     '''data_assertion:<assertion_key>'' naming this exact rise, why it is '
                     'unavoidable, who approved it and the date it must fall by. There is no '
                     'other door, and disabling this trigger is not one.';
    end if;

    update ratchet_exception set consumed_at = now() where id = x.id;
    raise notice 'Assertion % allowance rose % -> % on exception #% approved by %, must fall by %.',
      new.assertion_key, old.max_allowed, new.max_allowed, x.id, x.approved_by, x.must_fall_by;
  end if;
  return new;
end $$;

/* The selftest was wrong too: it proved "may fall" by lowering the LIVE assertion
   and then restoring it, and the restore is a rise. Testing a ratchet by moving the
   production number is the wrong instrument whether or not it passes. It now falls
   on a throwaway row, and two new cases cover the door itself — that it opens on a
   recorded decision, and that it is the only one. */
create or replace function tg_selftest_data_assertion_gate(p_by text default 'tg_selftest')
returns table (case_name text, passed boolean, actual text)
language plpgsql
set search_path to 'public','pg_temp'
as $$
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

  -- the allowance may FALL, proved on the throwaway row, never on a live one
  begin
    update data_assertion set max_allowed = 4 where assertion_key = k||':off';
    insert into _ag values ('the violation allowance may FALL','allowed','5 -> 4 allowed',true);
  exception when others then
    insert into _ag values ('the violation allowance may FALL','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- and may NOT rise
  begin
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';
    insert into _ag values ('the violation allowance may not RISE','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('the violation allowance may not RISE','refused',left(sqlerrm,60),true);
  end;

  -- THE DOOR: a recorded owner decision naming this exact rise lets it through once
  insert into ratchet_exception (metric_key, from_baseline, to_baseline, why, approved_by, must_fall_by)
  values ('data_assertion:'||k||':off', 4, 9, 'selftest of the recorded-decision door',
          'tg_selftest', current_date + 1)
  returning id into xid;
  begin
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';
    insert into _ag values ('a recorded owner decision opens the door','allowed','allowed',true);
  exception when others then
    insert into _ag values ('a recorded owner decision opens the door','allowed',
                            'REFUSED: '||left(sqlerrm,45),false);
  end;

  -- and the door closes behind it: the exception is consumed, not reusable
  begin
    update data_assertion set max_allowed = 4 where assertion_key = k||':off';   -- fall, fine
    update data_assertion set max_allowed = 9 where assertion_key = k||':off';   -- rise again
    insert into _ag values ('a consumed exception cannot be reused','refused','ALLOWED IT',false);
  exception when others then
    insert into _ag values ('a consumed exception cannot be reused','refused',left(sqlerrm,60),true);
  end;

  insert into guard_selftest (guard_key, case_name, expected, actual, passed, ran_by)
  select 'data_assertion_gate', s.case_name, s.expected, s.actual, s.passed, p_by from _ag s;

  delete from data_assertion where assertion_key like k || '%';
  delete from ratchet_exception where metric_key like 'data_assertion:' || k || '%';
  return query select s.case_name, s.passed, s.actual from _ag s;
end $$;
;
