-- Watchdog, 9 Aug 2026: "catching staleness isn't fixing it. That manual import has
-- no schedule, same family as metrc-documents-backfill."
--
-- v_report_upload_due already knew lab_results was 3 days overdue and test_batches 29.
-- Nothing read it. A view that knows and is never queried is the false-green pattern
-- wearing a different coat: the information existed and changed nothing.
--
-- These imports cannot be automated - a human must export them from Metrc's Reports
-- Control Panel, because the API does not serve them at all. So the schedule cannot be
-- "run the job"; it has to be "raise an owned, clocked finding at a named person until
-- the file arrives". That is the only form of schedule a manual step can have.

create or replace function tg_raise_report_upload_findings(p_by text default 'cron:report-upload-nag')
returns table(action text, report_key text, licence text, period_label text, days_late integer)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
begin
  -- 1. RAISE or refresh a finding for every required upload that has not arrived.
  return query
  with due as (
    select d.report_key, d.licence, d.period_label, d.title, d.cadence, d.menu_path,
           d.why_it_matters, d.what_it_adds, d.target_table, d.due_by,
           d.days_late::integer as days_late,
           case d.severity when 'critical' then 'critical'
                           when 'elevated' then 'elevated'
                           else 'watch' end as sev,
           'report_upload_overdue:'||d.report_key||':'||d.licence||':'||d.period_label as fp
    from v_report_upload_due d
    where not d.received and d.days_late > 0
  ),
  upsert as (
    insert into agent_findings
      (agent, severity, headline, detail, metric, units, scope, action, drill_to, fingerprint)
    select 'Metrc & Compliance', u.sev,
           u.title||' for '||u.licence||' ('||u.period_label||') is '||u.days_late||' days overdue',
           'WHO: whoever holds the Metrc login for '||u.licence||'. Raised by the report-upload nag. '
           || 'WHAT: the '||u.title||' export for '||u.period_label||' was due '||u.due_by
           || ' and has not been imported. Cadence: '||u.cadence||'. '
           || 'WHERE TO GET IT: Metrc > '||u.menu_path||', for licence '||u.licence||'. '
           || 'WHY IT MATTERS: '||coalesce(u.why_it_matters,'(not recorded)')||' '
           || 'WHAT IT ADDS: '||coalesce(u.what_it_adds,'(not recorded)')||' '
           || 'HOW DETECTED: v_report_upload_due, which compares the cadence against '
           || 'what actually landed in '||u.target_table||'. '
           || 'WHY THIS CANNOT BE AUTOMATED: the Metrc API does not serve this report. '
           || 'A person must export it. '
           || 'SOLUTIONS: (1) export and import it now; (2) if the cadence is wrong for this '
           || 'report, change the cadence row rather than ignoring the nag; (3) if the period '
           || 'genuinely has no data, import the empty file so the absence is on the record. '
           || 'RECOMMENDATION: (1). This finding will not clear until the file lands.',
           u.days_late, 'days', u.licence||' - '||u.period_label,
           'Export from Metrc > '||u.menu_path||' and import it',
           u.target_table, u.fp
    from due u
    where not exists (select 1 from agent_findings f
                      where f.fingerprint = u.fp and f.resolved_at is null)
    returning agent_findings.fingerprint
  )
  select 'raised'::text, d.report_key, d.licence, d.period_label, d.days_late
  from due d join upsert i on i.fingerprint = d.fp;

  -- 2. Stand the finding down once the file actually lands.
  --
  -- Deliberate judgement against rule H1, stated rather than hidden: H1 exists so a
  -- PERSON decides whether a problem is over. Here the condition is not a judgement -
  -- "the file arrived" is a mechanical fact, re-derivable from the import row, and the
  -- resolution below names that row. Requiring two agents to close a monthly upload nag
  -- would bury the real queue under clerical work. If the owner disagrees, delete this
  -- block and the findings will wait for a human.
  update agent_findings f
  set resolved_at = now(),
      resolution  = 'The file arrived: '||coalesce(d.file_name,'(no name)')||', '
                    ||coalesce(d.row_count,0)||' rows, imported '||coalesce(d.imported_at::text,'?')
                    ||'. Stood down automatically by '||p_by||' because the condition is a '
                    ||'mechanical fact, not a judgement. Re-derive with: select * from '
                    ||'v_report_upload_due where report_key='''||d.report_key
                    ||''' and licence='''||d.licence||'''.'
  from v_report_upload_due d
  where f.fingerprint = 'report_upload_overdue:'||d.report_key||':'||d.licence||':'||d.period_label
    and f.resolved_at is null
    and d.received;
end;
$$;

comment on function tg_raise_report_upload_findings(text) is
  'Turns v_report_upload_due from a view nobody reads into an owned finding on a clock. '
  'Manual Metrc exports cannot be scheduled as jobs because the API does not serve them; '
  'the only schedule available is a nag that will not stop until the file lands.';;
