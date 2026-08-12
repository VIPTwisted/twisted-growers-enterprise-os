/* A CRASH IN THE BROWSER MUST REACH THE FINDINGS LAYER
   ----------------------------------------------------
   The error boundary catches a render exception and shows the user a message -
   then the error dies in their browser. Nobody else ever learns it happened.
   That is the same failure shape as a page that silently renders empty: the
   only person who knows is the one person who cannot act on it.

   This lets the boundary report. It writes a finding like any agent, so a
   white-screened page is ranked next to a failing sync and a yield problem.

   The fingerprint is the view plus the error message, so the same crash on the
   same page updates one finding however many people hit it - the upsert
   trigger on watchdog_findings handles that. A crash hit by twelve staff is
   one finding seen twelve times, not twelve findings. */

create or replace function tg_log_client_error(
  p_view text,
  p_message text,
  p_stack text default null,
  p_component text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_run bigint;
begin
  if coalesce(btrim(p_message),'') = '' then return; end if;

  insert into watchdog_runs (ran_at, ran_by, notes)
  values (now(), 'browser', 'client-side render error reported by the error boundary')
  returning id into v_run;

  insert into watchdog_findings
    (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
     why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, drill)
  values (
    v_run,
    'clienterror:'||coalesce(p_view,'unknown')||':'||left(coalesce(p_message,''),80),
    'critical',
    'The '||coalesce(p_view,'unknown')||' page crashed in the browser',
    'Front end · '||coalesce(p_view,'unknown'),
    'Whoever owns the front end',
    'A render exception blanks the section for whoever hit it. Without this record the '
      || 'only person who knows is the one person who cannot fix it.',
    'Caught by the React error boundary and reported from the browser.',
    'Open the page named above and reproduce it. The message and component stack are on this finding.',
    left(coalesce(p_message,''), 400),
    to_jsonb(jsonb_build_object(
      'view', p_view,
      'message', p_message,
      'component', left(coalesce(p_component,''), 2000),
      'stack', left(coalesce(p_stack,''), 2000))),
    coalesce(p_view,'tower'));
end $$;

revoke all on function tg_log_client_error(text,text,text,text) from public, anon;
grant execute on function tg_log_client_error(text,text,text,text) to authenticated;

comment on function tg_log_client_error(text,text,text,text) is
  'Called by the browser error boundary. Turns a white screen into a ranked finding. Authenticated only.';;
