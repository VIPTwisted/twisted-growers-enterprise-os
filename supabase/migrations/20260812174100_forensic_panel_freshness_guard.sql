-- Agent W, 12 Aug 2026. The guard on mv_forensic_audit_panel.
--
-- Root cause, on the record: "Command Center numbers did not change for six days
-- while the header said Live from the records. The refresh job was monitored and
-- the VALUES were not. The job succeeded 144 times a day throughout."
-- So this guard reads the CLOCK ON THE DATA, not the exit status of a job.

-- ---------------------------------------------------------------------------
-- 1. The verdict, as a pure function.
--    Pure so a fixture can drive it with any timestamp and watch it fire, without
--    touching production. A check nobody has watched fail is a hypothesis.
-- ---------------------------------------------------------------------------
create or replace function f_matview_freshness_verdict(
  p_computed_at timestamptz,
  p_now         timestamptz,
  p_slo         interval
) returns text
language sql immutable
as $$
  select case
    when p_computed_at is null                then 'NEVER COMPUTED'
    when p_computed_at > p_now + interval '1 minute' then 'CLOCK SKEW'
    when p_now - p_computed_at > p_slo * 12   then 'DEAD'
    when p_now - p_computed_at > p_slo        then 'STALE'
    else 'ok'
  end;
$$;

comment on function f_matview_freshness_verdict is
  'Pure freshness verdict. Kept free of table reads so the fixture can prove it fires '
  'on a stale clock and stays quiet on a fresh one. Agent W, 12 Aug 2026.';

-- ---------------------------------------------------------------------------
-- 2. The surface. Cheap enough to read on a page.
--    It reports what it KNOWS and names what it CANNOT know. The panel refreshes
--    every 10 minutes, but two of its inputs (mv_tag_certificate, and mv_forensic_sales
--    behind v_forensic_sold_by_tag) carry no computed_at and are refreshed only by
--    snapshot-dashboards at 05:05 daily. A 10-minute computation over 24-hour inputs
--    is not a 10-minute figure, and this view refuses to imply that it is.
-- ---------------------------------------------------------------------------
create or replace view v_forensic_panel_freshness as
select
  'mv_forensic_audit_panel'::text                       as matview,
  m.computed_at,
  now() - m.computed_at                                 as computation_age,
  interval '30 minutes'                                 as computation_slo,
  f_matview_freshness_verdict(m.computed_at, now(), interval '30 minutes') as verdict,
  m.row_count,
  'refresh-forensic-panel, every 10 min at :04'::text   as refreshed_by,
  -- named, not hidden: the inputs whose age cannot be measured at all
  array['mv_tag_certificate','mv_forensic_sales']::text[] as inputs_without_a_clock,
  'Lines 11 and 12 derive from matviews that carry no computed_at and are refreshed '
  'only by snapshot-dashboards (05:05 daily). Their age is UNMEASURABLE, so the age '
  'above is the age of the COMPUTATION, not of the DATA.'::text as honesty_note
from (
  select max(computed_at) as computed_at, count(*)::int as row_count
  from mv_forensic_audit_panel
) m;

grant select on v_forensic_panel_freshness to authenticated, service_role, tg_desktop_reader;

comment on view v_forensic_panel_freshness is
  'Freshness of the forensic audit panel. Reports the age of the COMPUTATION and names '
  'the inputs whose age cannot be measured. Never reports a figure as fresher than its '
  'stalest measurable input. Agent W, 12 Aug 2026.';

-- ---------------------------------------------------------------------------
-- 3. The checker. Files a finding when breached, CLEARS it when it recovers.
--    p_slo is a parameter purely so the fixture can force a breach end to end
--    against the real objects without corrupting any data.
-- ---------------------------------------------------------------------------
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
    -- recovered: close it rather than leave a resolved problem sitting open
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
      'Watchdog & Silent Failures','W', v_sev,
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
    on conflict do nothing;   -- af_open_fp: one OPEN finding per fingerprint, recurrence allowed after close
  end if;

  return query select 'mv_forensic_audit_panel'::text, v_at, v_age, v_verdict;
end;
$function$;

comment on function tg_check_forensic_panel_freshness is
  'Guards mv_forensic_audit_panel freshness. Files agent_findings/forensic_panel_stale on '
  'breach and clears it on recovery. p_slo is a parameter so the fixture can force a real '
  'breach end to end. Agent W, 12 Aug 2026.';;
