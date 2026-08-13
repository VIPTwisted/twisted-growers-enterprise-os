/* ============================================================================
 * The runner and the fixture prover for data_assertion. Agent W, 13 Aug 2026.
 *
 * SECURITY_INVOKER, DELIBERATELY. These execute SQL text stored in a table.
 * SECURITY DEFINER would make anyone who can write a row able to run arbitrary
 * SQL as the owner. Writes to data_assertion are revoked from authenticated and
 * anon; cron runs as postgres and is the only writer.
 *
 * EVERY FUNCTION CARRIES `SET search_path`. That is not decoration: Postgres
 * reverts a function's configuration settings — INCLUDING a `set local` made
 * inside it — when the function exits. That is what makes the schema-shadowing
 * trick safe: the fixture's search_path cannot leak out into the caller.
 * ========================================================================== */

/* Run one assertion's SQL, optionally against a shadowing schema.
   Returns the true violation count and up to 20 rows of evidence. */
create or replace function f_assertion_probe(p_sql text, p_schema text default null)
returns table (n integer, sample jsonb)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare v_n integer; v_sample jsonb;
begin
  if p_schema is not null then
    execute format('set local search_path = %I, public, pg_temp', p_schema);
  end if;

  execute format('select count(*)::int from (%s) q', p_sql) into v_n;
  execute format(
    'select coalesce(jsonb_agg(to_jsonb(v)), ''[]''::jsonb) from (select * from (%s) q limit 20) v',
    p_sql) into v_sample;

  return query select v_n, v_sample;
end $$;

comment on function f_assertion_probe(text,text) is
  'Executes an assertion''s violation_sql verbatim, optionally with a schema shadowing '
  'production relations by name. The SAME TEXT runs live and in both fixtures — that is '
  'the whole point, and why the fixture cannot drift from the check.';

/* ---------------------------------------------------------------------------
 * THE PROVER. Runs both halves and refuses to accept a claim it cannot verify.
 * ------------------------------------------------------------------------- */
create or replace function f_prove_data_assertion(p_key text, p_by text default 'Agent W')
returns table (case_name text, passed boolean, actual text)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  a           data_assertion%rowtype;
  v_missing   text;
  v_pos       integer;
  v_neg       integer;
  v_pos_ok    boolean := false;
  v_neg_ok    boolean := false;
  v_err       text;
begin
  select * into a from data_assertion where assertion_key = p_key;
  if not found then
    return query select 'assertion exists'::text, false, format('no row for %L', p_key);
    return;
  end if;

  /* GUARD ONE: a fixture schema that forgets to shadow a relation silently tests
     production. Refuse rather than report a result that means nothing. */
  select string_agg(format('%s missing from %s', rel, sch), '; ')
    into v_missing
  from (
    select r.rel, s.sch
    from unnest(a.fixture_shadows) r(rel)
    cross join (values (a.fixture_positive_schema), (a.fixture_negative_schema)) s(sch)
    where not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = s.sch and c.relname = r.rel)
  ) x;

  if v_missing is not null then
    return query select 'fixture shadows every named relation'::text, false,
      'NOT PROVEN — ' || v_missing ||
      '. The unshadowed name falls through to public, so the fixture would have tested production.';
    update data_assertion set fixture_last_result = 'unproven: shadow missing'
     where assertion_key = p_key;
    return;
  end if;

  /* POSITIVE HALF — the planted defect must make it fire. */
  begin
    select n into v_pos from f_assertion_probe(a.violation_sql, a.fixture_positive_schema);
    v_pos_ok := coalesce(v_pos,0) > 0;
  exception when others then
    v_err := left(sqlerrm, 140); v_pos_ok := false;
  end;
  return query select 'FIRES on the planted violation'::text, v_pos_ok,
    coalesce(
      case when v_err is not null then 'ERROR: ' || v_err end,
      format('%s violation row(s) — %s', v_pos,
             case when v_pos_ok then 'fired, correct'
                  else 'STAYED QUIET. Either the check is broken, or the fixture schema fell '
                       'through to production (which is clean) and proved nothing.' end));

  v_err := null;

  /* NEGATIVE HALF — the legitimate case must not be labelled broken.
     This is the half that stops a false alarm, and every defect in the 9 Aug
     register was a false alarm. */
  begin
    select n into v_neg from f_assertion_probe(a.violation_sql, a.fixture_negative_schema);
    v_neg_ok := coalesce(v_neg,0) = 0;
  exception when others then
    v_err := left(sqlerrm, 140); v_neg_ok := false;
  end;
  return query select 'QUIET on the legitimate case'::text, v_neg_ok,
    coalesce(
      case when v_err is not null then 'ERROR: ' || v_err end,
      format('%s violation row(s) — %s', v_neg,
             case when v_neg_ok then 'quiet, correct'
                  else 'CRIED WOLF. A check that calls a healthy thing broken gets ignored, '
                       'and then it is not a check.' end));

  update data_assertion
     set fixture_proven_at  = case when v_pos_ok and v_neg_ok then now() else fixture_proven_at end,
         fixture_last_result = case when v_pos_ok and v_neg_ok then 'both halves proved'
                                    when v_pos_ok then 'negative half FAILED — cries wolf'
                                    when v_neg_ok then 'positive half FAILED — cannot fire'
                                    else 'both halves FAILED' end
   where assertion_key = p_key;

  insert into guard_selftest (guard_key, case_name, expected, actual, passed, ran_by)
  values ('data_assertion:'||p_key, 'FIRES on the planted violation', '>0 rows',
          coalesce(v_pos,-1)||' rows', v_pos_ok, p_by),
         ('data_assertion:'||p_key, 'QUIET on the legitimate case', '0 rows',
          coalesce(v_neg,-1)||' rows', v_neg_ok, p_by);
end $$;

comment on function f_prove_data_assertion(text,text) is
  'Re-proves both halves of an assertion''s fixture by running its violation_sql against a '
  'planted-defect schema (must fire) and a legitimate schema (must stay quiet). Refuses to '
  'report anything if a named shadow relation is missing, because the fixture would then have '
  'silently read production.';

create or replace function f_prove_all_data_assertions(p_by text default 'Agent W')
returns table (assertion_key text, case_name text, passed boolean, actual text)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare r record;
begin
  for r in select d.assertion_key from data_assertion d where d.enabled order by 1 loop
    return query
      select r.assertion_key, p.case_name, p.passed, p.actual
      from f_prove_data_assertion(r.assertion_key, p_by) p;
  end loop;
end $$;

/* ---------------------------------------------------------------------------
 * THE RUNNER.
 *
 * It will NOT report a pass for an assertion whose fixture has not been proved
 * within 7 days. That is the tg_refresh_reports() lesson applied here:
 * `exception when others then return 'refreshed (non-concurrent)'` turned every
 * failure into a success-shaped value, and refresh-tower-inventory hit statement
 * timeout 13 times in 7 days while reporting success. A pass from an unproven
 * check is the same lie in a different costume, so it is recorded as 'error'.
 * ------------------------------------------------------------------------- */
create or replace function tg_run_data_assertions(
  p_only text default null,
  p_by   text default 'cron')
returns table (assertion_key text, violations integer, verdict text, detail text)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  a          data_assertion%rowtype;
  v_n        integer;
  v_sample   jsonb;
  v_t0       timestamptz;
  v_verdict  text;
  v_detail   text;
  v_err      text;
  v_stale    boolean;
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
      /* Not a pass and not a fail. An unproven check has earned neither verdict. */
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
       (extract(epoch from clock_timestamp() - v_t0) * 1000)::int,
       v_sample, v_err);

    if v_verdict in ('fail','error') then
      insert into watchdog_findings
        (fingerprint, severity, what, where_it_is, who_is_accountable, why_it_matters,
         how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count)
      values
        ('data_assertion:' || a.assertion_key,
         case when v_verdict = 'error' then 'critical' else a.severity end,
         a.title,
         a.domain,
         a.owner_agent,
         a.why_it_matters,
         'data_assertion ' || a.assertion_key || ' — ' || a.what_it_proves,
         coalesce(v_err, v_detail),
         v_detail,
         v_sample,
         v_n);
    end if;

    assertion_key := a.assertion_key;
    violations    := v_n;
    verdict       := v_verdict;
    detail        := v_detail;
    return next;
  end loop;
end $$;

comment on function tg_run_data_assertions(text,text) is
  'Runs every enabled data assertion against production, records the run either way, and '
  'raises a watchdog finding on fail or error. Refuses to report PASS for an assertion whose '
  'fixture has not been proved in 7 days — an unproven check has earned no verdict.';
;
