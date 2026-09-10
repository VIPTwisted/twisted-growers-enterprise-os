-- GROK-WHY: 10 Sep Metrc outage was invisible. tg_metrc_fire logged dispatched;
-- metrc-sync v24 hung; 32/32 calls 504; documents kept writing so the sentinel
-- stayed green. Nothing compared metrc_scan_log to metrc_sync_runs. Same gap
-- as 7 Aug, in the comment on tg_metrc_fire. This is that comparison.
-- Also files the live 120s soft deadline (must stay below the 150s gateway).
-- Does NOT touch metrc-sync source. Cycle 56.

-- ── 1. Soft deadline must sit below the gateway's hard 150s kill ──────────
-- Claude already set this live on 10 Sep after the outage. File it so git
-- matches production (P2). Do not raise above 140000.
update public.configurations
   set value = value || jsonb_build_object(
         'ms', 120000,
         'gateway_hard_limit_ms', 150000,
         'why', 'LOWERED 180000 -> 120000 on 10 Sep 2026 after a full-day Metrc outage. The Supabase gateway enforces a HARD 150s idle timeout. A soft deadline of 180000 is longer than the gateway will wait, so the function can never stop, close its run and answer before it is killed. 120000 leaves 30s to finish writing, close the run and respond. Do not raise this above 140000.')
 where key = 'metrc_sync_soft_deadline_ms'
   and coalesce((value->>'ms')::numeric, 0) > 140000;

do $$
declare v numeric;
begin
  select (value->>'ms')::numeric into v
    from public.configurations where key = 'metrc_sync_soft_deadline_ms';
  if v is null or v > 140000 then
    raise exception 'metrc_sync_soft_deadline_ms is % — must sit at or below 140000 (gateway hard 150s).',
      coalesce(v::text, 'NO ROW');
  end if;
end $$;

-- ── 2. Sentinel: watch a CLOSED metrc-sync worker run, not "any row" ──────
-- The previous probe was max(coalesce(finished_at, started_at)) across the
-- whole table. documents (both) writes every 15 minutes, so a dead metrc-sync
-- worker still looked healthy. A hang that inserted a running row also looked
-- healthy because started_at filled in for a missing finished_at.
create or replace function public.f_sentinel_check()
returns table(source_key text, label text, last_seen timestamptz, silent_minutes integer,
              allowed_minutes integer, verdict text, why_it_matters text)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare e record; seen timestamptz; mins integer;
begin
  for e in select * from sentinel_expectation where enabled order by source_key loop
    seen := null;
    begin
      if e.source_key = 'metrc_sync' then
        select max(finished_at) into seen
          from metrc_sync_runs
         where finished_at is not null
           and endpoint ~* '^(packages|plants|harvests|plantbatches|transfers|items|locations|strains)( |$)';
      elsif e.source_key = 'watchdog' then
        select max(ran_at) into seen from watchdog_runs;
      elsif e.source_key = 'platform_state' then
        select max(taken_at) into seen from platform_state;
      elsif e.source_key = 'page_canary' then
        select max(ran_at) into seen from canary_runs;
      elsif e.source_key = 'data_assertion' then
        select max(ran_at) into seen from data_assertion_run;
      end if;
    exception when others then
      source_key := e.source_key; label := e.label; last_seen := null;
      silent_minutes := null; allowed_minutes := e.max_silence_minutes;
      verdict := 'PROBE BROKEN: ' || sqlerrm;
      why_it_matters := e.why_it_matters;
      return next;
      continue;
    end;

    mins := case when seen is null then null
                 else floor(extract(epoch from (now() - seen)) / 60)::integer end;

    source_key := e.source_key;
    label := e.label;
    last_seen := seen;
    silent_minutes := mins;
    allowed_minutes := e.max_silence_minutes;
    why_it_matters := e.why_it_matters;
    verdict := case
      when seen is null then 'NEVER SPOKEN'
      when mins > e.max_silence_minutes then 'SILENT'
      else 'ok' end;
    return next;
  end loop;
end $function$;

comment on function public.f_sentinel_check() is
  'Output probes for sentinel_expectation. metrc_sync watches a CLOSED packages/plants/harvests/transfers/items/locations/strains run — not documents, not a still-running row. POSIX regex uses ( |$) not \\b (backslash-b is BACKSPACE in Postgres). 10 Sep 2026: documents kept writing while metrc-sync hung 20 hours and this probe stayed green. Fixed 10 Sep 2026.';

-- ── 3. Assertion: latest dispatch per job has a matching closed run ───────
create schema if not exists tg_fx_pos_metrc_dispatch;
create schema if not exists tg_fx_neg_metrc_dispatch;

comment on schema tg_fx_pos_metrc_dispatch is
  'Fixture: a packages dispatch with no matching metrc_sync_runs row. The 10 Sep 2026 shape.';
comment on schema tg_fx_neg_metrc_dispatch is
  'Fixture: a packages dispatch whose matching packages run closed. Must stay quiet.';

drop table if exists tg_fx_pos_metrc_dispatch.metrc_scan_log;
create table tg_fx_pos_metrc_dispatch.metrc_scan_log (
  id bigint primary key,
  job_name text not null,
  trigger_type text not null,
  triggered_at timestamptz not null,
  outcome text
);
insert into tg_fx_pos_metrc_dispatch.metrc_scan_log
  (id, job_name, trigger_type, triggered_at, outcome) values
  (1, 'packages', 'scheduled', '2026-01-01 12:00:00+00', 'dispatched');
alter table tg_fx_pos_metrc_dispatch.metrc_scan_log enable row level security;
revoke all on tg_fx_pos_metrc_dispatch.metrc_scan_log from anon, authenticated;

drop table if exists tg_fx_pos_metrc_dispatch.metrc_sync_runs;
create table tg_fx_pos_metrc_dispatch.metrc_sync_runs (
  id bigint primary key,
  endpoint text not null,
  license text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  records int not null default 0
);
insert into tg_fx_pos_metrc_dispatch.metrc_sync_runs
  (id, endpoint, license, started_at, finished_at, status, records) values
  /* THE FALSE GREEN: documents kept writing. Must NOT count as the packages job. */
  (1, 'documents (both)', 'both', '2026-01-01 12:00:10+00', '2026-01-01 12:00:11+00', 'ok', 0),
  /* A hang that inserted a running row and never closed. Must NOT count. */
  (2, 'packages (delta)', 'MC281714', '2026-01-01 12:00:05+00', null, 'running', 0);
alter table tg_fx_pos_metrc_dispatch.metrc_sync_runs enable row level security;
revoke all on tg_fx_pos_metrc_dispatch.metrc_sync_runs from anon, authenticated;

drop table if exists tg_fx_neg_metrc_dispatch.metrc_scan_log;
create table tg_fx_neg_metrc_dispatch.metrc_scan_log (
  id bigint primary key,
  job_name text not null,
  trigger_type text not null,
  triggered_at timestamptz not null,
  outcome text
);
insert into tg_fx_neg_metrc_dispatch.metrc_scan_log
  (id, job_name, trigger_type, triggered_at, outcome) values
  (1, 'packages', 'scheduled', '2026-01-01 12:00:00+00', 'dispatched'),
  /* In-flight: newer than 5 minutes relative to now() would not apply here
     because this timestamp is in the past; a second row that DID finish. */
  (2, 'cultivation', 'scheduled', '2026-01-01 12:00:00+00', 'dispatched');
alter table tg_fx_neg_metrc_dispatch.metrc_scan_log enable row level security;
revoke all on tg_fx_neg_metrc_dispatch.metrc_scan_log from anon, authenticated;

drop table if exists tg_fx_neg_metrc_dispatch.metrc_sync_runs;
create table tg_fx_neg_metrc_dispatch.metrc_sync_runs (
  id bigint primary key,
  endpoint text not null,
  license text not null,
  started_at timestamptz not null,
  finished_at timestamptz,
  status text not null,
  records int not null default 0
);
insert into tg_fx_neg_metrc_dispatch.metrc_sync_runs
  (id, endpoint, license, started_at, finished_at, status, records) values
  (1, 'packages (delta)', 'MP281909', '2026-01-01 12:00:08+00', '2026-01-01 12:01:40+00', 'ok', 290),
  (2, 'plants (delta)', 'MC281714', '2026-01-01 12:00:10+00', '2026-01-01 12:00:55+00', 'ok', 0);
alter table tg_fx_neg_metrc_dispatch.metrc_sync_runs enable row level security;
revoke all on tg_fx_neg_metrc_dispatch.metrc_sync_runs from anon, authenticated;

insert into public.data_assertion
  (assertion_key, title, domain, severity, violation_sql, max_allowed,
   what_it_proves, why_it_matters, enabled, owner_agent, added_by, accountable_to,
   fixture_shadows, fixture_positive_schema, fixture_negative_schema,
   fixture_positive_case, fixture_negative_case, fixture_positive_min_rows, note)
values
  ('metrc.dispatch_has_a_run',
   'A Metrc scan logged dispatched and no worker run closed',
   'metrc', 'critical',
$sql$
with latest as (
  select distinct on (l.job_name)
         l.id, l.job_name, l.trigger_type, l.triggered_at
    from metrc_scan_log l
   where l.outcome = 'dispatched'
     and l.job_name in ('packages','cultivation','manifests','reference','deliveries')
   order by l.job_name, l.triggered_at desc
),
map as (
  select * from (values
    ('packages',    '^(packages)'),
    ('cultivation', '^(plants|harvests|plantbatches)'),
    ('manifests',   '^(transfers)'),
    ('reference',   '^(locations|strains|items)'),
    ('deliveries',  '^(reference sync)')
  ) v(job_name, ep_re)
)
select l.job_name as subject,
       format('%s dispatched at %s (%s) and no matching metrc_sync_runs row closed in the next 5 minutes. Dashboards read dispatched as success. 7 Aug 2026 and 10 Sep 2026 both looked like this.',
              l.job_name, l.triggered_at, l.trigger_type) as detail
  from latest l
  join map m using (job_name)
 where l.triggered_at < now() - interval '5 minutes'
   and not exists (
     select 1
       from metrc_sync_runs r
      where r.started_at >= l.triggered_at - interval '15 seconds'
        and r.started_at <  l.triggered_at + interval '5 minutes'
        and r.finished_at is not null
        and r.endpoint ~* m.ep_re
   )
$sql$,
   0,
   'That the latest dispatch of each Metrc scan job produced a closed worker run for that job. documents, sheet-sync and a still-running row do not count.',
   'tg_metrc_fire writes dispatched before the worker answers. On 7 Aug the gateway returned 401 and no run was written. On 10 Sep metrc-sync v24 hung, 32 of 32 calls returned 504 IDLE_TIMEOUT, and documents kept writing so every dashboard stayed green while packages sat 20 hours stale. The comment on tg_metrc_fire already named this comparison. It was never built.',
   true, 'Grok', 'Grok', 'Owner',
   array['metrc_scan_log','metrc_sync_runs'],
   'tg_fx_pos_metrc_dispatch', 'tg_fx_neg_metrc_dispatch',
   'A packages dispatch whose only nearby rows are a documents write (the false green) and a packages run that is still running (the hang). Both must fire.',
   'A packages dispatch matched by a closed packages (delta) run, and a cultivation dispatch matched by a closed plants (delta) run.',
   1,
   'Added 10 Sep 2026 after Claude restored metrc-sync v22 as v25. v23/v24 were never committed. Do not redeploy metrc-sync from memory. Soft deadline stays at or below 140000 ms.');
