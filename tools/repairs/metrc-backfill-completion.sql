-- Candidate SQL, exercised against disposable Postgres before a stamped migration.
-- Existing window rows and imported business records are retained.
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table if not exists public.metrc_backfill_attempt (
  id uuid primary key default gen_random_uuid(),
  window_id bigint not null references public.metrc_backfill_window(id),
  attempt_number integer not null check (attempt_number > 0),
  run_id bigint not null unique,
  request_id bigint,
  endpoint text not null,
  licence text not null,
  win_start timestamptz not null,
  win_end timestamptz not null check (win_end > win_start),
  state text not null default 'queued'
    check (state in ('queued','claimed','ok','partial','error','uncertain')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz,
  records integer,
  detail text,
  unique (window_id, attempt_number)
);
alter table public.metrc_backfill_attempt enable row level security;
revoke all on public.metrc_backfill_attempt from public, anon, authenticated;
comment on table public.metrc_backfill_attempt is
 'Durable backfill attempt identity and outcome. A reserved run is not completion proof '
 'until the worker has atomically claimed the exact licence, endpoint and window. '
 'run_id remains an audit identifier if sync-log retention removes the original run.';

create or replace function public.tg_claim_metrc_backfill_attempt(
  p_attempt uuid, p_endpoint text, p_licence text,
  p_win_start timestamptz, p_win_end timestamptz
) returns bigint
language plpgsql security definer set search_path = public
as $function$
declare claimed_run bigint;
begin
  update public.metrc_backfill_attempt a
     set state='claimed', claimed_at=now()
   where a.id=p_attempt and a.state='queued'
     and a.created_at >= now()-interval '10 minutes'
     and a.endpoint=p_endpoint and a.licence=p_licence
     and a.win_start=p_win_start and a.win_end=p_win_end
     and exists (
       select 1 from public.metrc_backfill_window w
       where w.id=a.window_id and w.status='running'
         and w.attempts=a.attempt_number and w.sync_run_id=a.run_id
         and w.endpoint=a.endpoint and w.licence=a.licence
         and w.win_start=a.win_start and w.win_end=a.win_end
     )
     and exists (select 1 from public.metrc_sync_runs r where r.id=a.run_id
       and r.status='running' and r.finished_at is null
       and r.license=a.licence and r.endpoint=a.endpoint||' (delta)')
   returning a.run_id into claimed_run;
  if claimed_run is null then
    raise exception 'Backfill attempt is absent, already claimed, expired or mismatched';
  end if;
  return claimed_run;
end $function$;
revoke all on function public.tg_claim_metrc_backfill_attempt(uuid,text,text,timestamptz,timestamptz)
  from public, anon, authenticated;
grant execute on function public.tg_claim_metrc_backfill_attempt(uuid,text,text,timestamptz,timestamptz)
  to service_role;

create or replace function public.tg_metrc_backfill_next()
returns text language plpgsql security definer set search_path = public
as $function$
declare
  w public.metrc_backfill_window;
  a public.metrc_backfill_attempt;
  r public.metrc_sync_runs;
  outcome text;
  explanation text;
  reserved_run bigint;
  request_number bigint;
  attempt_id uuid;
  remaining bigint;
begin
  -- Serializes dispatchers, including the interval before an HTTP request starts.
  if not pg_try_advisory_xact_lock(hashtextextended('tg_metrc_backfill_next',0)) then
    return 'waiting - another backfill dispatcher owns this transaction';
  end if;

  for a in select * from public.metrc_backfill_attempt
           where state in ('queued','claimed') order by created_at for update loop
    select * into r from public.metrc_sync_runs where id=a.run_id;
    outcome := null;
    explanation := null;
    if not found then
      outcome := 'uncertain'; explanation := 'Reserved sync run is missing; manual investigation required';
    elsif r.finished_at is not null then
      if a.state <> 'claimed' or r.license is distinct from a.licence
         or r.endpoint is distinct from a.endpoint || ' (delta)'
         or r.finished_at < a.created_at
         or not coalesce(r.status in ('ok','partial','error'),false)
         or (r.status='ok' and (r.error is not null or r.records is null or r.records < 0)) then
        outcome := 'uncertain'; explanation := 'Run identity or claimed completion is invalid; manual investigation required';
      else
        outcome := r.status;
        explanation := coalesce(r.error,r.note,'Recorded outcome of the exact claimed run');
      end if;
    elsif a.created_at < now() - interval '10 minutes' then
      outcome := 'uncertain'; explanation := 'No terminal run receipt within the existing ten-minute in-flight allowance; automatic retry stopped';
    end if;

    if outcome is not null then
      select * into w from public.metrc_backfill_window where id=a.window_id for update;
      if not found or w.status is distinct from 'running'
         or w.attempts is distinct from a.attempt_number or w.sync_run_id is distinct from a.run_id
         or w.endpoint is distinct from a.endpoint or w.licence is distinct from a.licence
         or w.win_start is distinct from a.win_start or w.win_end is distinct from a.win_end then
        outcome := 'uncertain'; explanation := 'Window identity changed after dispatch; automatic completion and retry stopped';
      end if;
      update public.metrc_backfill_attempt
         set state=outcome, finished_at=now(), records=r.records, detail=explanation
       where id=a.id;
      update public.metrc_backfill_window
         set status=case when outcome='ok' then 'done' else 'failed' end,
             records=r.records, finished_at=now(), note=explanation
       where id=a.window_id and status='running'
         and attempts=a.attempt_number and sync_run_id=a.run_id;
    end if;
  end loop;

  -- Transport timeout is not proof that the remote worker stopped. Never retry
  -- uncertain ownership automatically; doing so could overlap a live writer.
  if exists (select 1 from public.metrc_backfill_attempt where state='uncertain') then
    return 'blocked - uncertain backfill attempt requires investigation; no automatic retry';
  end if;
  if exists (select 1 from public.metrc_backfill_window where status='running') then
    return 'waiting - a backfill window is running; an uncorrelated legacy run requires investigation';
  end if;

  select * into w from public.metrc_backfill_window
   where status in ('pending','failed') and attempts < 3
     and (status='pending' or coalesce(finished_at,attempted_at,created_at) <= now()-interval '3 minutes')
   order by win_start,id limit 1 for update;
  if not found then
    select count(*) into remaining from public.metrc_backfill_window
      where status in ('pending','failed','running');
    return case when remaining=0
      then 'no queued windows remain - stored completion is not source certification'
      else format('no retry eligible - %s windows remain incomplete (cooldown or attempt budget)',remaining) end;
  end if;

  if exists (select 1 from public.metrc_sync_runs
      where status='running' and endpoint like w.endpoint||'%'
        and started_at > now()-interval '10 minutes') then
    return 'waiting - an endpoint sync is still in flight';
  end if;

  -- Reserve the exact run BEFORE dispatch. pg_net sends only after commit.
  insert into public.metrc_sync_runs(endpoint,license,status,started_at,note)
    values(w.endpoint||' (delta)',w.licence,'running',now(),'Reserved for a correlated backfill attempt')
    returning id into reserved_run;
  insert into public.metrc_backfill_attempt(
    window_id,attempt_number,run_id,endpoint,licence,win_start,win_end
  ) values(w.id,w.attempts+1,reserved_run,w.endpoint,w.licence,w.win_start,w.win_end)
    returning id into attempt_id;
  update public.metrc_backfill_window
     set status='running',attempted_at=now(),attempts=attempts+1,
         sync_run_id=reserved_run,finished_at=null,note='Awaiting the exact worker claim and terminal receipt'
   where id=w.id;

  select public.tg_call_function(
    'metrc-sync?endpoints='||w.endpoint||'&license='||w.licence
    ||'&winStart='||to_char(w.win_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ||'&winEnd='||to_char(w.win_end at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ||'&backfillAttempt='||attempt_id::text
  ) into request_number;
  update public.metrc_backfill_attempt set request_id=request_number where id=attempt_id;
  return format('dispatched one correlated backfill attempt %s for run %s',attempt_id,reserved_run);
end $function$;
