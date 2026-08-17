/* The heal loop catches query_canceled, and the cron job sets the timeout.
 *
 * Companion to the previous migration. f_heal_stale_matviews had the same blind spot:
 * its per-view handler said WHEN OTHERS, which does not catch a statement timeout, so
 * the first slow view aborted the entire watcher — the exact all-or-nothing failure the
 * watcher exists to prevent, reproduced inside the watcher.
 */

create or replace function public.f_heal_stale_matviews(p_by text default 'watcher')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  h         record;
  t0        timestamptz;
  v_healed  int := 0;
  v_failed  int := 0;
  v_chronic int := 0;
  v_names   text[] := '{}';
  v_err     text;
begin
  for h in select * from v_matview_health where is_stale order by matview loop
    t0 := clock_timestamp();
    v_err := null;

    begin
      execute format('select %I(%L)', h.refresh_fn, p_by);
    /* query_canceled EXPLICITLY — WHEN OTHERS does not catch a statement timeout, and a
       timeout is the failure this whole mechanism was built for. */
    exception when query_canceled or others then
      v_err := left(sqlerrm, 400);
    end;

    if v_err is null then
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
      values (h.matview, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
      v_healed := v_healed + 1;
      v_names := v_names || h.matview;

      if h.heals_last_24h + 1 > h.heals_per_day_ok then
        v_chronic := v_chronic + 1;
        insert into watchdog_findings (
          observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
          when_it_started, why_it_matters, how_it_was_detected, what_to_do,
          the_arithmetic, evidence, record_count, solutions, guard_recommendation)
        values (
          now(), 'matview_chronic_heal|' || h.matview, 'elevated',
          h.matview || ' has gone stale and been auto-healed ' || (h.heals_last_24h + 1)
            || ' times in 24 hours, against a normal of ' || h.heals_per_day_ok
            || '. The numbers on screen are current; the machinery producing them is not well.',
          'Materialised view ' || h.matview || ', refreshed by ' || h.refresh_fn || '.',
          'Agent I, Database COO.',
          'First heal in this window: ' || coalesce(
            (select to_char(min(started_at), 'DD Mon HH24:MI') from matview_refresh_run r
              where r.matview = h.matview and r.run_by = 'watcher'
                and r.started_at > now() - interval '24 hours'), 'unknown'),
          'Healing on repeat converts a visible outage into an invisible chronic one, and '
            || 'the underlying cause — a scheduled refresh that is not completing — goes '
            || 'unfixed because nothing ever surfaces it.',
          'f_heal_stale_matviews compared heals in the last 24h against '
            || 'matview_heal_policy.heals_per_day_ok.',
          'Find why the SCHEDULED refresh is not completing rather than leaving the watcher '
            || 'to carry it. matview_refresh_run holds this view''s durations and errors.',
          (h.heals_last_24h + 1) || ' heals in 24h against a normal of ' || h.heals_per_day_ok
            || '; policy max age ' || h.max_age,
          jsonb_build_object('matview', h.matview, 'heals_24h', h.heals_last_24h + 1,
                             'normal', h.heals_per_day_ok, 'max_age', h.max_age::text,
                             'refresh_fn', h.refresh_fn),
          h.heals_last_24h + 1,
          array[
            'Fix why the scheduled job is not completing — the durations in '
              || 'matview_refresh_run show whether it is slow or erroring.',
            'Give this view its own less frequent job with a longer timeout, as was done '
              || 'for mv_tag_evidence.',
            'Raise max_age in matview_heal_policy if the view genuinely does not need to be '
              || 'that fresh — a real answer, but say so in the why column.'],
          'Do not raise heals_per_day_ok to silence this. The count is the symptom. The '
            || 'watcher is holding this view up by hand and something should be doing it '
            || 'on schedule.');
      end if;

    else
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
      values (h.matview, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, false, v_err, p_by);
      v_failed := v_failed + 1;

      insert into watchdog_findings (
        observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
        when_it_started, why_it_matters, how_it_was_detected, what_to_do,
        the_arithmetic, evidence, record_count, solutions, guard_recommendation)
      values (
        now(), 'matview_heal_failed|' || h.matview, 'critical',
        h.matview || ' is stale and the watcher COULD NOT refresh it. The dashboards it '
          || 'feeds are showing old numbers right now.',
        'Materialised view ' || h.matview || ', refresh function ' || h.refresh_fn || '.',
        'Agent I, Database COO.',
        'Last successful computation: ' || coalesce(h.computed_at::text, 'never recorded')
          || '. Age at detection: ' || coalesce(h.age::text, 'unmeasurable') || '.',
        'Every tile fed by this view is presenting a stale figure as a current position — '
          || 'the exact failure found on 17 Aug 2026 when the Command dashboard read '
          || 'DATA 3 DAYS OLD after 477 silent refresh failures.',
        'f_heal_stale_matviews attempted the refresh and it errored.',
        'Read the error below and fix the refresh. Until it succeeds, every figure from '
          || 'this view must be treated as of ' || coalesce(h.computed_at::text, 'an unknown time') || '.',
        'Policy max age ' || h.max_age || ', actual age ' || coalesce(h.age::text, 'unmeasurable'),
        jsonb_build_object('matview', h.matview, 'error', v_err,
                           'refresh_fn', h.refresh_fn, 'age', h.age::text),
        1,
        array[
          'Fix the refresh — the error text is on this finding.',
          'If it is a timeout, give the view its own job with a longer statement_timeout '
            || 'SET BY THE JOB, not inside the function — it cannot extend a statement '
            || 'already running.',
          'If the view is no longer needed, retire it and remove its policy row rather than '
            || 'leaving a permanently failing heal.'],
        'Do not deactivate the policy row to stop the alert. A view nobody refreshes and '
          || 'nobody watches is how the dashboard came to be three days old.');
    end if;
  end loop;

  return jsonb_build_object(
    'checked', (select count(*) from v_matview_health),
    'healed', v_healed, 'healed_views', v_names,
    'heal_failed', v_failed, 'chronic', v_chronic,
    'note', case
      when v_failed > 0 then 'A refresh FAILED — a critical finding is open and the affected dashboards are stale.'
      when v_chronic > 0 then 'Healed, but this view is being healed too often. A finding is open.'
      when v_healed > 0 then 'Stale views were healed. Nothing is presenting old numbers as current.'
      else 'Nothing was stale.' end);
end $function$;

comment on function public.f_heal_stale_matviews(text) is
  'The watcher. Every 5 minutes: refresh any matview older than its policy, record the '
  'attempt, raise a CRITICAL finding if the refresh fails, and an ELEVATED finding if a '
  'view is healed more often than normal even when healing works. Catches query_canceled '
  'explicitly — WHEN OTHERS does not, and the first version was aborted by the first '
  'timeout it met. Agent I, 17 Aug 2026.';;
