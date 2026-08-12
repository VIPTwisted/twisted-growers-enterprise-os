-- A backfill has one honest question: is the remaining work FALLING?
--
-- Nothing asked it. parse-documents-backfill fires roughly 360 times a night against
-- 12 remaining documents, 11 of which need a person or OCR - so its silence is correct.
-- metrc-documents-backfill is genuinely draining. Both look identical from outside:
-- a job that ran and produced nothing. That is the false-green pattern pointed at
-- backfills, and it is the automated twin of the manual-import problem.
--
-- A floor is allowed, but it must carry its REASON. "163 safety screens legitimately
-- have no potency" is a floor; "we gave up" is not, and must not be written as one.

create table if not exists backfill_watch (
  job_key        text primary key,
  what_it_drains text not null check (length(btrim(what_it_drains)) >= 20),
  remaining_sql  text not null check (remaining_sql ~* '^\s*select\s'),
  accepted_floor integer not null default 0 check (accepted_floor >= 0),
  floor_reason   text,
  cadence_note   text,
  enabled        boolean not null default true,
  added_on       date not null default current_date,
  -- A floor above zero is a claim that some of the backlog is legitimately undrainable.
  -- That claim needs its evidence on the row, or it is just an excuse with a number.
  constraint floor_needs_its_reason check (
    accepted_floor = 0 or length(btrim(coalesce(floor_reason,''))) >= 25
  )
);
alter table backfill_watch enable row level security;
create policy backfill_watch_read  on backfill_watch for select to authenticated using (true);
create policy backfill_watch_write on backfill_watch for all to authenticated
  using (f_caller_is_admin()) with check (f_caller_is_admin());

create table if not exists backfill_reading (
  id        bigserial primary key,
  job_key   text not null references backfill_watch(job_key) on delete cascade,
  remaining integer not null,
  read_at   timestamptz not null default now(),
  read_by   text not null default 'tg_backfill_sweep'
);
alter table backfill_reading enable row level security;
create policy backfill_reading_read  on backfill_reading for select to authenticated using (true);
create policy backfill_reading_write on backfill_reading for insert to authenticated with check (true);
create index if not exists backfill_reading_job_idx on backfill_reading (job_key, read_at desc);

comment on table backfill_watch is
  'Backfill jobs and how to count what is left. remaining_sql must be a SELECT returning '
  'one integer. Only an administrator may write rows, because the SQL is executed.';;
