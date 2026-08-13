/* The first run routed "room F4 is 31 days past its pull" to Agent W, because the
   runner used owner_agent — the agent who owns the CHECK — as the accountable
   party. Agent W cannot harvest a room. A finding without an owner dies, and a
   finding owned by the wrong party dies more quietly still, because it looks
   owned. owner_agent keeps the check; accountable_to gets the problem.
   Agent W, 13 Aug 2026. */

alter table data_assertion
  add column if not exists accountable_to text;

comment on column data_assertion.accountable_to is
  'Who fixes the PROBLEM when this assertion fails — not who owns the assertion. Those are '
  'different people and conflating them routes every finding back to the watchdog.';
comment on column data_assertion.owner_agent is
  'Who owns and maintains the CHECK itself. See accountable_to for who fixes what it finds.';

update data_assertion set accountable_to = 'Agent I (Database COO)'
 where assertion_key in ('harvest.flower_room_column_matches_its_generator',
                         'harvest.ordinal_match_in_step',
                         'harvest.no_unmatched_takedown',
                         'harvest.compliance_surfaces_agree',
                         'schema.one_definition_per_registered_primitive');

update data_assertion set accountable_to = 'Cultivation, and Vincent for the capacity decision'
 where assertion_key = 'harvest.no_room_stands_past_its_pull';

alter table data_assertion
  alter column accountable_to set not null;

create or replace function tg_run_data_assertions(
  p_only text default null,
  p_by   text default 'cron')
returns table (assertion_key text, violations integer, verdict text, detail text)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  a data_assertion%rowtype;
  v_n integer; v_sample jsonb; v_t0 timestamptz;
  v_verdict text; v_detail text; v_err text; v_stale boolean;
begin
  for a in select * from data_assertion d
            where d.enabled and (p_only is null or d.assertion_key = p_only)
            order by d.assertion_key
  loop
    v_t0 := clock_timestamp();
    v_err := null; v_n := null; v_sample := null;

    v_stale := a.fixture_proven_at is null
            or a.fixture_proven_at < now() - interval '7 days'
            or coalesce(a.fixture_last_result,'') <> 'both halves proved';

    begin
      select n, sample into v_n, v_sample from f_assertion_probe(a.violation_sql, null);
    exception when others then
      v_err := left(sqlerrm, 300);
    end;

    if v_err is not null then
      v_verdict := 'error';
      v_detail  := 'the assertion itself failed to run: ' || v_err;
    elsif v_stale then
      v_verdict := 'error';
      v_detail  := format(
        'found %s violation(s), but this assertion''s fixture was last proved %s. '
        'An unproven check reports nothing: a pass it has not earned is how '
        'tg_refresh_reports() returned "refreshed" through 13 statement timeouts.',
        v_n, coalesce(a.fixture_proven_at::text, 'NEVER'));
    elsif v_n > a.max_allowed then
      v_verdict := 'fail';
      v_detail  := format('%s violation(s), %s tolerated', v_n, a.max_allowed);
    else
      v_verdict := 'pass';
      v_detail  := format('%s violation(s), %s tolerated', v_n, a.max_allowed);
    end if;

    insert into data_assertion_run
      (assertion_key, ran_by, violations, max_allowed, verdict, duration_ms, evidence, error_text)
    values
      (a.assertion_key, p_by, v_n, a.max_allowed, v_verdict,
       (extract(epoch from clock_timestamp() - v_t0) * 1000)::int, v_sample, v_err);

    if v_verdict in ('fail','error') then
      insert into watchdog_findings
        (fingerprint, severity, what, where_it_is, who_is_accountable, why_it_matters,
         how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count)
      values
        ('data_assertion:' || a.assertion_key,
         case when v_verdict = 'error' then 'critical' else a.severity end,
         a.title, a.domain,
         a.accountable_to,                      -- who FIXES it, not who owns the check
         a.why_it_matters,
         'data_assertion ' || a.assertion_key || ' — ' || a.what_it_proves,
         coalesce(v_err, v_detail), v_detail, v_sample, v_n);
    end if;

    assertion_key := a.assertion_key; violations := v_n;
    verdict := v_verdict; detail := v_detail;
    return next;
  end loop;
end $$;

/* The finding already raised carries the wrong owner. Re-point it rather than
   leaving a correct finding addressed to someone who cannot act on it.
   UPDATE, not delete-and-reinsert: watchdog_findings is forensic (rule H2). */
update watchdog_findings
   set who_is_accountable = 'Cultivation, and Vincent for the capacity decision'
 where fingerprint = 'data_assertion:harvest.no_room_stands_past_its_pull';
;
