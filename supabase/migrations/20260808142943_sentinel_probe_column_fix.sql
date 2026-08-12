-- Column names verified against information_schema rather than assumed: watchdog_runs
-- and canary_runs use ran_at, not started_at. A sentinel that errors is a sentinel that
-- is silent, which is the exact failure it exists to detect.
create or replace function public.f_sentinel_check()
returns table(source_key text, label text, last_seen timestamptz, silent_minutes integer,
              allowed_minutes integer, verdict text, why_it_matters text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare e record; seen timestamptz; mins integer;
begin
  for e in select * from sentinel_expectation where enabled order by source_key loop
    seen := null;

    /* Probes are fixed here rather than stored as SQL in the config table: a threshold
       is configuration, an executable query is code, and putting code in a config table
       is how a config table becomes an attack surface. */
    begin
      if e.source_key = 'metrc_sync' then
        select max(coalesce(finished_at, started_at)) into seen from metrc_sync_runs;
      elsif e.source_key = 'watchdog' then
        select max(ran_at) into seen from watchdog_runs;
      elsif e.source_key = 'platform_state' then
        select max(taken_at) into seen from platform_state;
      elsif e.source_key = 'page_canary' then
        select max(ran_at) into seen from canary_runs;
      end if;
    exception when others then
      /* A probe that cannot run must SAY SO, never pass quietly. A sentinel that
         swallows its own error reports silence as health - the precise failure it
         exists to catch, wearing the costume of a working check. */
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
end $$;

grant execute on function public.f_sentinel_check() to tg_desktop_reader;;
