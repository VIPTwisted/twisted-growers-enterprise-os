-- Agent I, 13 Aug 2026. DBI-098.
--
-- MY OWN WATCHER HAS NEVER RUN. Agent V measured it:
--   select prosrc ilike '%tile_drill%' from pg_proc where proname = 'tg_verify'  ->  FALSE
--
-- 89 tile-drill contracts are registered across all twelve dashboards and NOT ONE has ever been
-- swept. I built tile_drill_contract on 12 Aug, called it "the missing watcher", registered
-- contracts against it all evening, and never gave it a runner. Agent M told me the same thing
-- hours ago - "tg_check_tile_drill() has no cron job" - and I relayed that warning into three
-- agent briefs while leaving my own instrument unwired.
--
-- It is exactly the defect this platform exists to catch, and the exact shape of the two I
-- reported today: counterparty_role captured as data with no reader; column_semantics existing
-- while eleven copies of the list lived in JSX. A control nothing runs is decoration.
--
-- WHY IT LOOPS THE CONTRACTS DIRECTLY rather than copying them into verification_checks: two
-- registries of the same thing is the defect hold_the_ddc_discipline names. tile_drill_contract
-- stays the ONE definition of a tile's contract; tg_verify - which genuinely runs, at :20 past
-- every hour, 1,591 rows in 24h - becomes the ONE runner.
--
-- The first loop is unchanged, byte for byte. This appends a second.
--
-- UNDO: restore the previous body (it is in the baseline dump); the first loop is untouched.

create or replace function public.tg_verify()
returns table(check_key text, verdict text, value_a numeric, value_b numeric, pct_apart numeric)
language plpgsql security definer set search_path to 'public'
as $function$
declare c record; a numeric; b numeric; diff numeric; pct numeric; v text; msg text; v_run bigint;
        t record; tv numeric; dv numeric; gap numeric;
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

  -- ── SECOND LOOP: every tile against its own drill ──────────────────────────
  -- The owner found three of these with his own eyes before any of it existed:
  -- a tile reading "F1 — 1,022 plants" whose drill said "no plants recorded in F1",
  -- and then explained the nothing. This is what stops him being the detector.
  for t in select * from tile_drill_contract order by page, tile_label loop
    tv := null; dv := null; msg := null;
    begin
      execute t.tile_sql  into tv;
      execute t.drill_sql into dv;
      gap := coalesce(tv,0) - coalesce(dv,0);
      v := case
        when tv is null and dv is null           then 'agree'          -- both genuinely empty
        when tv is null or dv is null            then 'DISAGREE'       -- one side empty: the F1 shape
        when abs(gap) <= t.tolerance             then 'agree'
        else 'DISAGREE' end;
    exception when others then
      v := 'error'; msg := left(sqlerrm,160); gap := null;
    end;

    insert into verification_runs (check_key, value_a, value_b, difference, pct_apart, verdict, note)
    values ('tile:'||t.contract_key, tv, dv, gap,
            case when coalesce(dv,0) = 0 then null else round(abs(coalesce(gap,0))/abs(dv)*100, 2) end,
            v, msg);

    if v <> 'agree' then
      insert into watchdog_findings
        (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
         why_it_matters, how_it_was_detected, what_to_do, the_arithmetic)
      values (v_run, 'tile:'||t.contract_key,
        case when v = 'error' then 'elevated' else 'critical' end,
        case when v = 'error'
               then t.page||' · '||t.tile_label||' — the contract itself could not run'
             when tv is null or dv is null
               then t.page||' · '||t.tile_label||' — the tile and its drill disagree, and ONE SIDE IS EMPTY'
             else t.page||' · '||t.tile_label||' — the tile does not equal its own drill' end,
        t.page||' · '||t.tile_label, 'Agent I',
        'A figure a manager can open to, that opens to something else, is worse than no figure: '
        'the drill is what makes a number checkable, and a wrong number that opens to a confident '
        'explanation of itself stops the reader looking.',
        'Ran the SQL behind the tile and, independently, the SQL that re-derives it by summing the '
        'rows the drill opens.',
        case when v = 'error'
          then 'The contract errored: '||coalesce(msg,'?')||'. Fix the contract or the object it reads.'
          else 'Establish which side is right before the figure is quoted. Do not adjust the '
               'tolerance to make it agree.' end,
        case when v = 'error' then 'contract errored: '||coalesce(msg,'?')
             else 'tile = '||coalesce(tv::text,'null')||' · drill = '||coalesce(dv::text,'null')
                  ||' · gap '||coalesce(gap::text,'?')||' (tolerance '||t.tolerance||')' end)
      on conflict do nothing;
    end if;

    tg_verify.check_key := 'tile:'||t.contract_key; tg_verify.verdict := v;
    tg_verify.value_a := tv; tg_verify.value_b := dv;
    tg_verify.pct_apart := case when coalesce(dv,0) = 0 then null
                                else round(abs(coalesce(gap,0))/abs(dv)*100, 2) end;
    return next;
  end loop;

  update watchdog_runs w set findings_raised =
    (select count(*) from watchdog_findings f where f.run_id = v_run) where w.id = v_run;
end $function$;

comment on function public.tg_verify() is
 'The one runner. Loop 1 sweeps verification_checks — two independent derivations of a fact. '
 'Loop 2 sweeps tile_drill_contract — every tile against the rows its own drill opens, added '
 '13 Aug 2026 after Agent V measured that 89 registered contracts had NEVER been swept because '
 'nothing called tg_check_tile_drill. Scheduled at :20 past every hour, so a tile that stops '
 'matching its drill raises a finding within the hour instead of waiting for the owner to open '
 'the page.';;
