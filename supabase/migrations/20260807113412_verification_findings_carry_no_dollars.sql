/* My bug, found by reviewing my own work.
   ----------------------------------------
   tg_verify wrote the SIZE OF THE DISCREPANCY into the dollars column. That
   column means "money at risk" and is summed into the business total, so a
   finding reporting "$2.9m is double counted" added $2.9m to the total - the
   report inflating the number it was reporting on. Open value read $7.19m when
   it is $4.22m.

   A reconciliation gap is not money at risk. It belongs in the arithmetic,
   where it already is. Verification findings now carry no dollar figure. */

create or replace function tg_verify()
returns table (check_key text, verdict text, value_a numeric, value_b numeric, pct_apart numeric)
language plpgsql security definer set search_path = public
as $$
declare c record; a numeric; b numeric; diff numeric; pct numeric; v text; msg text; v_run bigint;
begin
  insert into watchdog_runs (ran_at, ran_by, notes)
  values (now(), 'tg_verify', 'independent verification: two derivations per fact')
  returning id into v_run;

  for c in select * from verification_checks where enabled order by check_key loop
    a := null; b := null; msg := null;
    begin
      execute c.source_a_sql into a;
      execute c.source_b_sql into b;
      diff := coalesce(a,0) - coalesce(b,0);
      pct  := case when coalesce(b,0)=0 and coalesce(a,0)=0 then 0
                   when coalesce(b,0)=0 then 100
                   else abs(diff)/abs(b)*100 end;
      v := case when pct <= c.tolerance_pct then 'agree' else 'DISAGREE' end;
    exception when others then
      v := 'error'; msg := left(sqlerrm,160); pct := null; diff := null;
    end;

    insert into verification_runs (check_key, value_a, value_b, difference, pct_apart, verdict, note)
    values (c.check_key, a, b, diff, pct, v, msg);

    if v <> 'agree' then
      insert into watchdog_findings
        (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
         why_it_matters, how_it_was_detected, what_to_do, the_arithmetic)
      values (v_run, 'verify:'||c.check_key,
        case when v='error' then 'elevated' else c.severity end,
        case when v='error' then c.title||' — the check itself failed to run'
             else c.title||' — the two sources disagree' end,
        'Verification · '||c.check_key, c.owner, c.what_it_proves,
        'Derived the same fact two independent ways and compared. '||c.source_a_label||' against '||c.source_b_label||'.',
        case when v='error'
          then 'The verification could not run: '||coalesce(msg,'?')||'. A check that cannot run proves nothing.'
          else 'Find out which source is right before anyone quotes either figure. Do not average them.' end,
        case when v='error' then 'check errored: '||coalesce(msg,'?')
             else c.source_a_label||' = '||coalesce(a::text,'null')||' · '
                  ||c.source_b_label||' = '||coalesce(b::text,'null')||' · apart by '
                  ||round(coalesce(pct,0),2)||'% (tolerance '||c.tolerance_pct||'%). '
                  ||'This is a reconciliation gap, NOT money at risk - it carries no dollar figure by design.' end)
      on conflict do nothing;
    end if;

    tg_verify.check_key := c.check_key; tg_verify.verdict := v;
    tg_verify.value_a := a; tg_verify.value_b := b;
    tg_verify.pct_apart := round(coalesce(pct,0),2);
    return next;
  end loop;

  update watchdog_runs w set findings_raised =
    (select count(*) from watchdog_findings f where f.run_id = v_run) where w.id = v_run;
end $$;

grant execute on function tg_verify() to authenticated;

/* Clear the figures already written by the old version. */
update watchdog_findings
set dollars = null,
    the_arithmetic = coalesce(the_arithmetic,'')
      || ' [Dollar figure removed 7 Aug 2026: a reconciliation gap is not money at risk, '
      || 'and counting it as such inflated the open total by the very amount it was reporting.]'
where fingerprint like 'verify:%' and dollars is not null;;
