-- CLIENT_ERROR_RECEIPT_CONTRACT
-- A browser may say "recorded" only after the database returns the durable finding ID.

create or replace function public.tg_log_client_error_receipt(
  p_view text,
  p_message text,
  p_stack text default null,
  p_component text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_run bigint;
  v_finding bigint;
  v_view text := coalesce(nullif(btrim(p_view), ''), 'unknown');
  v_message text := nullif(btrim(p_message), '');
  v_fingerprint text;
  v_recorded_at timestamptz := clock_timestamp();
begin
  if v_message is null then
    raise exception 'A client error receipt requires a non-empty message'
      using errcode = '22023';
  end if;

  v_fingerprint := 'clienterror:' || v_view || ':' || left(v_message, 80);

  insert into public.watchdog_runs (ran_at, ran_by, notes)
  values (v_recorded_at, 'browser', 'client-side render error reported by the error boundary')
  returning id into v_run;

  insert into public.watchdog_findings
    (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
     why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, drill)
  values (
    v_run,
    v_fingerprint,
    'critical',
    'The ' || v_view || ' page crashed in the browser',
    'Front end · ' || v_view,
    'Whoever owns the front end',
    'A render exception blanks the section for whoever hit it. Without this record the '
      || 'only person who knows is the one person who cannot fix it.',
    'Caught by the React error boundary and reported from the browser.',
    'Open the page named above and reproduce it. The message and component stack are on this finding.',
    left(v_message, 400),
    jsonb_build_object(
      'view', v_view,
      'message', v_message,
      'component', left(coalesce(p_component, ''), 2000),
      'stack', left(coalesce(p_stack, ''), 2000)),
    v_view)
  returning id into v_finding;

  -- trg_watchdog_upsert returns null when this fingerprint already exists.
  -- In that path INSERT RETURNING has no row, so prove the updated finding ID.
  if v_finding is null then
    select id into v_finding
    from public.watchdog_findings
    where fingerprint = v_fingerprint
    order by id
    limit 1;
  end if;

  if v_finding is null then
    raise exception 'The client error was not given a durable finding ID'
      using errcode = 'integrity_constraint_violation';
  end if;

  return jsonb_build_object(
    'finding_id', v_finding,
    'run_id', v_run,
    'recorded_at', v_recorded_at);
end
$$;

revoke all on function public.tg_log_client_error_receipt(text,text,text,text) from public, anon;
grant execute on function public.tg_log_client_error_receipt(text,text,text,text) to authenticated;

comment on function public.tg_log_client_error_receipt(text,text,text,text) is
  'Authenticated browser error logger. Returns a durable finding_id even when the fingerprint trigger updates an existing finding.';

create or replace function public.tg_log_client_error(
  p_view text,
  p_message text,
  p_stack text default null,
  p_component text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.tg_log_client_error_receipt(p_view, p_message, p_stack, p_component);
end
$$;

revoke all on function public.tg_log_client_error(text,text,text,text) from public, anon;
grant execute on function public.tg_log_client_error(text,text,text,text) to authenticated;

comment on function public.tg_log_client_error(text,text,text,text) is
  'Compatibility wrapper. New clients use tg_log_client_error_receipt and disclose the returned finding ID.';
