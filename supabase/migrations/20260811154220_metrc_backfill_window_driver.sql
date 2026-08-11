-- Agent: I (Database COO), 11 Aug 2026. Owner countersigned under the rule 4 transition.
-- Filed for review as DBI-002 (reviewers V, X, W).
--
-- WHY: metrc-sync v19 states its own limitation in its header - "a partial sweep does NOT
-- resume. Each run re-walks from page 1." With PAGE_SIZE 20 and a 110s soft deadline, the
-- plants/v2/inactive path runs LAST of four and never reaches the end of the list, so whole
-- harvests are absent from the mirror.
--
-- MEASURED BEFORE: 15,595 plants; 290 of 380 harvests with ZERO plant records; earliest
-- harvested plant 2025-12-15 against a first harvest of 2024-05-15; 49,240 plants on the
-- harvest records against 12,515 in the mirror (25%).
--
-- PROVEN BY TWO HAND-RUN WINDOWS BEFORE BUILDING THIS:
--   two months -> status partial, 980 records, 152s (overran the deadline)
--   two weeks  -> status ok,      452 records,  37s (clean)
-- Together they recovered 1,364 plants, pushed the earliest harvested plant back to
-- 2024-05-15, and took harvests-with-zero from 290 to 273.
--
-- CHANGES NO SYNC CODE. Resumption lives OUT HERE deliberately: v18 tried to fix it inside
-- the function, was deployed unverified, left a run open 183 seconds and was rolled back.
--
-- NOTE FOR THE NEXT AGENT: this migration is recorded TWICE in
-- supabase_migrations.schema_migrations (20260811154152 and 20260811154220), 28 seconds
-- apart, from a single apply_migration call - the tool retried. It caused no harm ONLY
-- because every statement here is idempotent. Write migrations that survive being applied
-- twice; on this platform they sometimes are.
--
-- UNDO: select cron.unschedule('metrc-backfill');
--       drop function tg_metrc_backfill_next();
--       drop table metrc_backfill_window;
--       No existing table is altered and no row outside this table is written. Plant rows
--       already recovered stay, and are correct - they are upserts of Metrc's own records.

create table if not exists metrc_backfill_window (
  id            bigserial primary key,
  endpoint      text        not null,
  licence       text        not null,
  win_start     timestamptz not null,
  win_end       timestamptz not null,
  status        text        not null default 'pending'
                check (status in ('pending','running','done','failed','skipped')),
  records       integer,
  sync_run_id   bigint,
  attempted_at  timestamptz,
  finished_at   timestamptz,
  attempts      integer     not null default 0,
  note          text,
  created_at    timestamptz not null default now(),
  unique (endpoint, licence, win_start, win_end)
);

alter table metrc_backfill_window enable row level security;

comment on table metrc_backfill_window is
 'Backfill queue for metrc-sync. One row per narrow time window. Exists because the sync '
 'cannot resume a partial sweep (its own v19 header says so) and a two-month window overruns '
 'the 110s deadline while a two-week window completes in ~37s. Driven by tg_metrc_backfill_next(), '
 'one window at a time, never overlapping a run already in flight.';

create index if not exists mbw_pending on metrc_backfill_window (status, win_start);

create or replace function public.tg_metrc_backfill_next()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare w metrc_backfill_window; req bigint; inflight int;
begin
  -- Never overlap. A plants run already open means the previous window is still working.
  select count(*) into inflight from metrc_sync_runs
   where status = 'running' and endpoint like 'plants%' and started_at > now() - interval '10 minutes';
  if inflight > 0 then
    return 'waiting - a plants sync is still in flight';
  end if;

  -- Close out the window that the last run belonged to, using that run's own outcome.
  update metrc_backfill_window b
     set status = case when r.status in ('ok','partial') then 'done' else 'failed' end,
         records = r.records, finished_at = r.finished_at,
         note = coalesce(r.error, 'closed from run '||r.id)
    from metrc_sync_runs r
   where b.sync_run_id = r.id and b.status = 'running' and r.finished_at is not null;

  select * into w from metrc_backfill_window
   where status = 'pending' and attempts < 3
   order by win_start limit 1;

  if not found then
    return 'nothing pending - backfill complete or exhausted';
  end if;

  select tg_call_function(
    'metrc-sync?endpoints='||w.endpoint||'&license='||w.licence
    ||'&winStart='||to_char(w.win_start at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ||'&winEnd='  ||to_char(w.win_end   at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"')
  ) into req;

  update metrc_backfill_window
     set status='running', attempted_at=now(), attempts=attempts+1,
         sync_run_id=(select max(id) from metrc_sync_runs where endpoint like w.endpoint||'%')
   where id=w.id;

  return format('fired %s %s %s to %s (request %s)', w.endpoint, w.licence,
                w.win_start::date, w.win_end::date, req);
end $function$;

comment on function public.tg_metrc_backfill_next() is
 'Fires ONE backfill window if no plants sync is in flight. Returns what it did in words - '
 'never a bare success. "nothing pending" is a distinct answer from "waiting", so a stalled '
 'backfill cannot look like a finished one.';

-- Seed fortnightly windows from the first harvest on record to now.
insert into metrc_backfill_window (endpoint, licence, win_start, win_end)
select 'plants', 'MC281714', d, d + interval '14 days'
from generate_series(timestamptz '2024-05-01', timestamptz '2026-08-11', interval '14 days') d
on conflict do nothing;

-- The window already run by hand today is done; do not repeat it.
update metrc_backfill_window
   set status='done', note='run by hand 11 Aug 2026 before the driver existed'
 where endpoint='plants' and licence='MC281714' and win_start = timestamptz '2024-05-01';
