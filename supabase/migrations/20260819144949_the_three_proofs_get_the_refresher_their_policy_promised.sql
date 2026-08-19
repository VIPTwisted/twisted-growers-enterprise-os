/* ═══════════════════════════════════════════════════════════════════════════
   522 FAILED REFRESHES, ZERO SUCCESSES, AND A HEALER REPORTING SUCCESS.

   matview_heal_policy carries an active row for mv_stock_proof (max_age 10min),
   mv_ownership_verdict (1h) and mv_tag_documents (30min). All three have
   refresh_fn NULL, and no function in this database refreshes them — the
   policies were written pointing at a refresher that was never built.

   f_heal_stale_matviews runs `execute format('select %I(%L)', h.refresh_fn, ...)`
   and %I on NULL throws "null values cannot be formatted as an SQL identifier".
   Measured over 7 days: mv_ownership_verdict 282 runs / 282 failed,
   mv_stock_proof 171 / 171, mv_tag_documents 69 / 69. Not one success, ever.

   This matters beyond the log. mv_stock_proof is the MASS BALANCE SOURCE OF
   RECORD. Today's reconciliation found 90.00 lb of active dried flower — six
   tags in Cure Vault and Pre Trim Storage — present in Metrc and absent from
   the stock proof. A matview that has never refreshed cannot be expected to
   agree with anything; that 90 lb has to be re-measured after this lands, and
   may simply be the staleness rather than a stock discrepancy.

   All three carry a unique index, so CONCURRENTLY is available and readers are
   never blocked. Written to the same shape as tg_refresh_tag_evidence: no
   statement_timeout inside (it cannot work from within the running statement —
   the caller sets it), one matview_refresh_run row per matview, and a return
   value that reports failure as failure.
   ═══════════════════════════════════════════════════════════════════════════ */

create or replace function public.tg_refresh_proofs(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  m       text;
  t0      timestamptz;
  results jsonb := '[]'::jsonb;
  n_ok    int := 0;
  n_fail  int := 0;
begin
  /* One loop, one row logged per matview, and a failure in one never stops the
     next two. A single try/catch around all three would have refreshed the
     stock proof and then hidden that the ownership verdict died. */
  foreach m in array array['mv_stock_proof', 'mv_ownership_verdict', 'mv_tag_documents']
  loop
    t0 := clock_timestamp();
    begin
      execute format('refresh materialized view concurrently %I', m);
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, run_by)
      values (m, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int, true, p_by);
      n_ok := n_ok + 1;
      results := results || jsonb_build_object('matview', m, 'ok', true,
                   'ms', round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int);
    exception when query_canceled or others then
      insert into matview_refresh_run (matview, started_at, finished_at, ms, ok, error, run_by)
      values (m, t0, clock_timestamp(),
              round(extract(epoch from (clock_timestamp() - t0)) * 1000)::int,
              false, left(sqlerrm, 400), p_by);
      n_fail := n_fail + 1;
      results := results || jsonb_build_object('matview', m, 'ok', false,
                   'error', left(sqlerrm, 300));
    end;
  end loop;

  /* ok is false when ANY of the three failed. A caller that only reads `ok`
     must not be told everything worked because two of three did — that is the
     shape of the bug this migration exists to close. */
  return jsonb_build_object('ok', n_fail = 0, 'refreshed', n_ok, 'failed', n_fail,
                            'detail', results);
end
$function$;

comment on function public.tg_refresh_proofs(text) is
  'Refreshes the three proof matviews that matview_heal_policy has demanded since it was written and that no function existed to serve: mv_stock_proof, mv_ownership_verdict, mv_tag_documents. Returns ok=false if ANY one of them failed.';

/* Point the three orphaned policies at it. */
update matview_heal_policy
   set refresh_fn = 'tg_refresh_proofs'
 where matview in ('mv_stock_proof', 'mv_ownership_verdict', 'mv_tag_documents')
   and refresh_fn is null;

/* And make this specific mistake impossible to repeat. A heal policy whose
   refresher is NULL is not a policy — it is a five-minute alarm clock wired to
   an exception, which is exactly what it has been for a week. */
alter table matview_heal_policy
  alter column refresh_fn set not null;