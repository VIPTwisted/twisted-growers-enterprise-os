/* The assertions now watch the harvest data. Nothing watched the assertions.
 *
 * If the assert-run cron job dies, every assertion stops and the platform looks
 * calm precisely because nothing is looking — which is the sentence already
 * written on the watchdog's own sentinel row, and it applies here identically.
 * The runner's 7-day fixture-staleness rule catches a dead PROVER; it cannot
 * catch a dead RUNNER, because a runner that never runs never evaluates anything.
 *
 * Both halves go in together on purpose. f_sentinel_check keeps its probes in
 * code rather than in the config table, so an expectation row with no matching
 * probe branch reports NEVER SPOKEN forever — a permanent false alarm, and a
 * false alarm on a dead-man's switch is worse than not having one, because it
 * trains people to scroll past the one row that means the lights went out.
 * Agent W, 13 Aug 2026.
 * ========================================================================== */

insert into sentinel_expectation (source_key, label, max_silence_minutes, why_it_matters, set_by)
values ('data_assertion',
        'The data assertion sweep',
        180,
        'Runs hourly and is the only thing in the platform that asserts anything about '
        'production DATA rather than about code. Its silence would hide a stale generated '
        'column, an ordinal match slipped out of step, and a flower room standing weeks past '
        'its pull — all of which read as healthy when nothing is asking. Three missed runs '
        'is the limit.',
        'agent-w, 13 Aug 2026')
on conflict (source_key) do nothing;

create or replace function f_sentinel_check()
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
      elsif e.source_key = 'data_assertion' then
        select max(ran_at) into seen from data_assertion_run;
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
end $function$;
;
