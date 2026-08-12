create or replace function tg_backfill_sweep(p_by text default 'cron:backfill-sweep')
returns table(job_key text, remaining integer, previous integer, verdict text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  w        record;
  v_now    integer;
  v_prev   integer;
  v_oldest integer;
  v_verd   text;
begin
  for w in select * from backfill_watch where enabled order by job_key loop

    begin
      execute w.remaining_sql into v_now;
    exception when others then
      -- A counter that cannot run is itself a finding: we now know nothing.
      insert into agent_findings
        (agent, severity, headline, detail, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','elevated',
              'Backfill '||w.job_key||' cannot be measured - its remaining-count query failed',
              'The query that counts what is left threw: '||left(sqlerrm,200)
              ||'. Until it runs we cannot tell a finished backfill from a dead one, '
              ||'which is the whole reason this watch exists.',
              w.job_key, 'Fix backfill_watch.remaining_sql for '||w.job_key,
              'backfill_watch', 'backfill_uncountable:'||w.job_key)
      on conflict do nothing;
      continue;
    end;

    select r.remaining into v_prev from backfill_reading r
     where r.job_key = w.job_key order by r.read_at desc limit 1;

    select r.remaining into v_oldest from backfill_reading r
     where r.job_key = w.job_key and r.read_at > now() - interval '7 days'
     order by r.read_at asc limit 1;

    insert into backfill_reading(job_key, remaining, read_by)
    values (w.job_key, v_now, p_by);

    v_verd := case
      when v_now <= w.accepted_floor then 'COMPLETE'
      when v_prev is null            then 'FIRST READING'
      when v_now <  v_prev           then 'DRAINING'
      when v_oldest is not null and v_now >= v_oldest then 'STALLED'
      else 'FLAT'
    end;

    -- Stalled: running, achieving nothing, and above its own accepted floor.
    if v_verd = 'STALLED' then
      insert into agent_findings
        (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','elevated',
              'Backfill '||w.job_key||' has not reduced its backlog in seven days',
              'WHAT: '||w.what_it_drains||'. Remaining is '||v_now||', against '||v_oldest
              ||' seven days ago and an accepted floor of '||w.accepted_floor||'. '
              ||'WHY IT MATTERS: the job is running and achieving nothing, which looks '
              ||'identical to a finished job from outside. '
              ||'HOW DETECTED: tg_backfill_sweep, comparing readings over time. '
              ||'SOLUTIONS: (1) fix whatever is blocking it; (2) if the remainder is '
              ||'legitimately undrainable, raise accepted_floor AND write the reason, '
              ||'which the table requires; (3) retire the job. '
              ||'RECOMMENDATION: (1) or (2). Never leave it flat and unexplained.',
              v_now, 'items left', w.job_key,
              'Unblock the backfill, or record an evidenced floor',
              'backfill_watch', 'backfill_stalled:'||w.job_key)
      on conflict do nothing;
    end if;

    -- Complete but still hammering: not a fault, but real waste worth saying out loud.
    if v_verd = 'COMPLETE' and coalesce(w.cadence_note,'') <> '' then
      insert into agent_findings
        (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','watch',
              'Backfill '||w.job_key||' has drained but still runs at its catch-up cadence',
              'WHAT: '||w.what_it_drains||'. Remaining is '||v_now||', at or below the '
              ||'accepted floor of '||w.accepted_floor||'. Cadence: '||w.cadence_note||'. '
              ||'WHY IT MATTERS: this is waste rather than breakage, but a job hammering '
              ||'a finished queue also hides the day it genuinely has work again. '
              ||'RECOMMENDATION: drop it to a maintenance cadence. Do not delete it - '
              ||'new documents keep arriving.',
              v_now, 'items left', w.job_key,
              'Reduce the schedule to a maintenance cadence',
              'cron.job', 'backfill_overrunning:'||w.job_key)
      on conflict do nothing;
    end if;

    -- Drained and falling again: stand the old findings down, with the evidence.
    update agent_findings f
    set resolved_at = now(),
        resolution  = 'Remaining fell to '||v_now||' (was '||coalesce(v_prev::text,'?')
                      ||'). Stood down by '||p_by||'; re-derive with tg_backfill_sweep().'
    where f.fingerprint = 'backfill_stalled:'||w.job_key
      and f.resolved_at is null
      and v_verd in ('DRAINING','COMPLETE');

    job_key := w.job_key; remaining := v_now; previous := v_prev; verdict := v_verd;
    return next;
  end loop;
end;
$$;

comment on function tg_backfill_sweep(text) is
  'Asks every registered backfill the only question that matters: is the remaining work '
  'falling? Distinguishes COMPLETE from STALLED, which look identical from outside and '
  'are the backfill form of the false-green pattern.';;
