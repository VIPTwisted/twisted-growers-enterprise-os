-- Agent I, 13 Aug 2026. DBI-102. Correcting my own DBI-098 within the hour, on Agent V's finding.
--
-- WHAT I DID WRONG. DBI-098 was meant to close proposal 40: 89 tile-drill contracts registered
-- and never swept, because tg_verify did not call tg_check_tile_drill. I fixed the symptom by
-- INLINING a second loop into tg_verify's body. It sweeps, so the contracts run - but
-- tg_check_tile_drill() still has zero cron jobs, zero callers and backs no trigger, while
-- v_tile_drill_status still reads it.
--
-- So the platform now holds TWO definitions of "does a tile equal its drill": the function, and a
-- copy of its logic inside tg_verify. hold_the_ddc_discipline is countable and unambiguous -
-- count the definitions of any primitive, more than one is the defect. I closed a
-- registered-but-never-run defect by creating a duplicate-definition defect, having spent the
-- evening finding eleven copies of a column list and reducing them to one.
--
-- THE FIX. tg_verify CALLS the function and loops its result. One definition, one runner. The
-- verdict strings and the finding text stay in the function, where v_tile_drill_status already
-- reads them, so the screen and the sweep can no longer drift apart - which was the point of the
-- contracts in the first place.
--
-- NOT FIXED HERE, and it is the sharper half of Agent V's finding: the contract's drill_sql is a
-- HAND-WRITTEN CLAIM about the drill, not a reading of it. Nothing compares
-- tile_drill_contract.drill_sql to mv_department_dashboard.drill, so six Cultivation contracts
-- read "agree" tonight while the published drill column still points at the pages their own notes
-- describe as wrong. That is the logged root cause - guards watched the database, not the screen -
-- one layer up, and it needs the check V specified (drill.published_target_matches_the_contract).
-- Filed, not smuggled in here.
--
-- UNDO: restore the DBI-098 body, which carries the inlined loop.

create or replace function public.tg_verify()
returns table(check_key text, verdict text, value_a numeric, value_b numeric, pct_apart numeric)
language plpgsql security definer set search_path to 'public'
as $function$
declare c record; a numeric; b numeric; diff numeric; pct numeric; v text; msg text; v_run bigint;
        t record;
begin
  insert into watchdog_runs (ran_at, ran_by, notes)
  values (now(), 'tg_verify', 'independent verification: two derivations per fact, plus every tile against its own drill')
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

  -- ── EVERY TILE AGAINST ITS OWN DRILL — by CALLING the one definition ──────────
  -- Not a second copy of the logic. tg_check_tile_drill() owns the comparison and the
  -- verdict wording; v_tile_drill_status reads the same function, so the sweep and the
  -- screen cannot drift apart.
  for t in select * from tg_check_tile_drill() loop
    insert into verification_runs (check_key, value_a, value_b, difference, pct_apart, verdict, note)
    values ('tile:'||t.contract_key, t.tile_value, t.drill_value, t.gap,
            case when coalesce(t.drill_value,0) = 0 then null
                 else round(abs(coalesce(t.gap,0))/abs(t.drill_value)*100, 2) end,
            case when t.verdict like 'AGREE%' then 'agree'
                 when t.verdict like 'BROKEN%' then 'error' else 'DISAGREE' end,
            t.verdict);

    if t.verdict not like 'AGREE%' then
      insert into watchdog_findings
        (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
         why_it_matters, how_it_was_detected, what_to_do, the_arithmetic)
      values (v_run, 'tile:'||t.contract_key,
        case when t.verdict like 'BROKEN%' then 'elevated' else 'critical' end,
        t.page||' · '||t.tile_label||' — '||t.verdict,
        t.page||' · '||t.tile_label, 'Agent I',
        'A figure a manager can open to, that opens to something else, is worse than no figure: '
        'the drill is what makes a number checkable, and a wrong number that opens to a confident '
        'explanation of itself stops the reader looking.',
        'Ran the SQL behind the tile and, independently, the SQL that re-derives it by summing the '
        'rows the drill opens. NOTE: the drill side is the contract''s WRITTEN CLAIM about the '
        'drill, not a reading of the shipped page — see drill.published_target_matches_the_contract.',
        'Establish which side is right before the figure is quoted. Do not adjust the tolerance to '
        'make it agree.',
        'tile = '||coalesce(t.tile_value::text,'null')||' · drill = '
          ||coalesce(t.drill_value::text,'null')||' · gap '||coalesce(t.gap::text,'?'))
      on conflict do nothing;
    end if;

    tg_verify.check_key := 'tile:'||t.contract_key;
    tg_verify.verdict := case when t.verdict like 'AGREE%' then 'agree'
                              when t.verdict like 'BROKEN%' then 'error' else 'DISAGREE' end;
    tg_verify.value_a := t.tile_value; tg_verify.value_b := t.drill_value;
    tg_verify.pct_apart := case when coalesce(t.drill_value,0) = 0 then null
                                else round(abs(coalesce(t.gap,0))/abs(t.drill_value)*100, 2) end;
    return next;
  end loop;

  update watchdog_runs w set findings_raised =
    (select count(*) from watchdog_findings f where f.run_id = v_run) where w.id = v_run;
end $function$;

comment on function public.tg_verify() is
 'The one runner. Loop 1 sweeps verification_checks. Loop 2 CALLS tg_check_tile_drill() — it does '
 'not reimplement it. DBI-098 inlined that logic and thereby created a second definition of the '
 'tile-drill check while the function itself stayed orphaned; Agent V caught it within the hour '
 'and this restores one definition, one runner. v_tile_drill_status reads the same function, so '
 'the hourly sweep and the on-screen status cannot disagree.';;
