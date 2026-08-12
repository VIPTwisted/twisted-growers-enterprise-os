-- FIX, same day it shipped. The first version compared the newest reading against the
-- oldest reading INSIDE a seven-day window, without requiring that reading to be old.
-- On day one the oldest reading is minutes old, so two equal readings taken minutes
-- apart were reported as "has not reduced its backlog in seven days".
--
-- This is the identical fault recorded hours earlier against packages-shipped-vs-received:
-- a difference judged with no age band. A verdict about seven days of history requires
-- seven days of history, and until it exists the honest answer is "too soon to say" -
-- which is not the same as "fine" and must not read like it.

create or replace function tg_backfill_sweep(p_by text default 'cron:backfill-sweep')
returns table(job_key text, remaining integer, previous integer, verdict text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  w           record;
  v_now       integer;
  v_prev      integer;
  v_oldest    integer;
  v_oldest_at timestamptz;
  v_min_days  constant integer := 3;   -- the shortest history that can support a verdict
  v_verd      text;
begin
  for w in select * from backfill_watch where enabled order by job_key loop

    begin
      execute w.remaining_sql into v_now;
    exception when others then
      insert into agent_findings
        (agent, severity, headline, detail, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','elevated',
              'Backfill '||w.job_key||' cannot be measured - its remaining-count query failed',
              'The query that counts what is left threw: '||left(sqlerrm,200)
              ||'. Until it runs we cannot tell a finished backfill from a dead one.',
              w.job_key, 'Fix backfill_watch.remaining_sql for '||w.job_key,
              'backfill_watch', 'backfill_uncountable:'||w.job_key)
      on conflict do nothing;
      continue;
    end;

    select r.remaining into v_prev from backfill_reading r
     where r.job_key = w.job_key order by r.read_at desc limit 1;

    select r.remaining, r.read_at into v_oldest, v_oldest_at
    from backfill_reading r
    where r.job_key = w.job_key and r.read_at > now() - interval '7 days'
    order by r.read_at asc limit 1;

    insert into backfill_reading(job_key, remaining, read_by)
    values (w.job_key, v_now, p_by);

    v_verd := case
      when v_now <= w.accepted_floor then 'COMPLETE'
      when v_prev is null            then 'FIRST READING'
      when v_now <  v_prev           then 'DRAINING'
      -- A stall verdict needs enough history to earn it.
      when v_oldest_at is null or v_oldest_at > now() - make_interval(days => v_min_days)
                                     then 'TOO SOON TO SAY'
      when v_now >= v_oldest         then 'STALLED'
      else 'FLAT'
    end;

    if v_verd = 'STALLED' then
      insert into agent_findings
        (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','elevated',
              'Backfill '||w.job_key||' has not reduced its backlog in seven days',
              'WHAT: '||w.what_it_drains||'. Remaining is '||v_now||', against '||v_oldest
              ||' recorded '||to_char(v_oldest_at,'DD Mon YYYY HH24:MI')
              ||', with an accepted floor of '||w.accepted_floor||'. '
              ||'WHY IT MATTERS: the job is running and achieving nothing, which looks '
              ||'identical to a finished job from outside. '
              ||'HOW DETECTED: tg_backfill_sweep, comparing readings at least '||v_min_days
              ||' days apart. '
              ||'SOLUTIONS: (1) fix whatever is blocking it; (2) if the remainder is '
              ||'legitimately undrainable, raise accepted_floor AND write the reason, which '
              ||'the table requires; (3) retire the job. '
              ||'RECOMMENDATION: (1) or (2). Never leave it flat and unexplained.',
              v_now, 'items left', w.job_key,
              'Unblock the backfill, or record an evidenced floor',
              'backfill_watch', 'backfill_stalled:'||w.job_key)
      on conflict do nothing;
    end if;

    if v_verd = 'COMPLETE' and coalesce(w.cadence_note,'') <> '' then
      insert into agent_findings
        (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
      values ('Metrc & Compliance','watch',
              'Backfill '||w.job_key||' has drained but still runs at its catch-up cadence',
              'WHAT: '||w.what_it_drains||'. Remaining is '||v_now||', at or below the accepted '
              ||'floor of '||w.accepted_floor||'. Cadence: '||w.cadence_note||'. '
              ||'WHY IT MATTERS: waste rather than breakage, but a job hammering a finished '
              ||'queue also hides the day it genuinely has work again. '
              ||'RECOMMENDATION: drop it to a maintenance cadence. Do not delete it.',
              v_now, 'items left', w.job_key,
              'Reduce the schedule to a maintenance cadence',
              'cron.job', 'backfill_overrunning:'||w.job_key)
      on conflict do nothing;
    end if;

    update agent_findings f
    set resolved_at = now(),
        resolution  = 'Remaining is '||v_now||' and the verdict is now '||v_verd
                      ||'. Stood down by '||p_by||'; re-derive with tg_backfill_sweep().'
    where f.fingerprint = 'backfill_stalled:'||w.job_key
      and f.resolved_at is null
      and v_verd in ('DRAINING','COMPLETE','TOO SOON TO SAY');

    job_key := w.job_key; remaining := v_now; previous := v_prev; verdict := v_verd;
    return next;
  end loop;
end;
$$;;
