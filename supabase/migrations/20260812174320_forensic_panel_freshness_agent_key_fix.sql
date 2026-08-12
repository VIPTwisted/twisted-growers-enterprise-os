-- Agent W, 12 Aug 2026. agent_key must be 'lane:W' -- 'W' is not in agent_registry and the
-- FK correctly refused it. The end-to-end half of the fixture caught this before it shipped;
-- the pure-function cases all passed while the checker could not write a single row.
create or replace function tg_check_forensic_panel_freshness(
  p_by  text     default 'cron:forensic-panel-freshness',
  p_slo interval default interval '30 minutes'
) returns table(matview text, computed_at timestamptz, age interval, verdict text)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_at   timestamptz;
  v_age  interval;
  v_verdict text;
  v_sev  text;
begin
  select max(m.computed_at) into v_at from mv_forensic_audit_panel m;
  v_age     := now() - v_at;
  v_verdict := f_matview_freshness_verdict(v_at, now(), p_slo);

  if v_verdict = 'ok' then
    update agent_findings
       set resolved_at = now(),
           resolution  = 'Panel refreshed '||coalesce(v_age::text,'?')||' ago, inside the '
                         ||p_slo::text||' SLO. Cleared by '||p_by||'.'
     where fingerprint = 'forensic_panel_stale' and resolved_at is null;
  else
    v_sev := case when v_verdict in ('DEAD','NEVER COMPUTED') then 'critical' else 'elevated' end;

    insert into agent_findings
      (agent, agent_key, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    values (
      'Watchdog & Silent Failures','lane:W', v_sev,
      'Forensic audit panel is '||v_verdict||' - last computed '
        ||coalesce(round(extract(epoch from v_age)/60)::text||' min ago','never'),
      'WHAT: mv_forensic_audit_panel backs the forensic tile on every Command Center page '
      ||'load. Its computed_at is '||coalesce(v_at::text,'NULL')||', which is '
      ||coalesce(v_age::text,'unmeasurable')||' old against an SLO of '||p_slo::text||'. '
      ||'WHY IT MATTERS: the tile keeps rendering numbers and gives no sign they have '
      ||'stopped moving. Command Center numbers once sat frozen for six days under a '
      ||'"Live from the records" header because the refresh JOB was watched and the '
      ||'VALUES were not. HOW DETECTED: mv_forensic_audit_panel.computed_at against now(), '
      ||'by '||p_by||'. RECOMMENDATION: check cron job refresh-forensic-panel in '
      ||'cron.job_run_details; a statement timeout there is the likely cause.',
      round(extract(epoch from v_age)/60), 'minutes stale',
      'mv_forensic_audit_panel',
      'Investigate cron job refresh-forensic-panel, then refresh the matview',
      'v_forensic_panel_freshness','forensic_panel_stale')
    on conflict do nothing;   -- af_open_fp: one OPEN finding per fingerprint; recurrence allowed after close
  end if;

  return query select 'mv_forensic_audit_panel'::text, v_at, v_age, v_verdict;
end;
$function$;;
