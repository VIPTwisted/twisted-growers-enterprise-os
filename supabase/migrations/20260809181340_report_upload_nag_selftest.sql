-- A nag that double-raises trains people to ignore it; a nag that never stands down
-- does the same. Both directions are proven here, against real view data.
create or replace function tg_selftest_report_upload_nag(p_by text default 'tg_selftest')
returns table(case_name text, passed boolean, actual text)
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_before integer;
  v_after  integer;
  v_second integer;
  r        record;
  v_fp     text;
  v_state  text;
begin
  create temp table if not exists _rn(case_name text, expected text, actual text, passed boolean)
    on commit drop;
  delete from _rn;

  -- 1. IDEMPOTENCY: a second run must raise nothing new.
  select count(*) into v_before from agent_findings
   where fingerprint like 'report_upload_overdue:%' and resolved_at is null;
  perform tg_raise_report_upload_findings(p_by);
  select count(*) into v_after from agent_findings
   where fingerprint like 'report_upload_overdue:%' and resolved_at is null;
  insert into _rn values ('re-running raises no duplicates', 'no change',
                          v_before||' -> '||v_after, v_before = v_after);

  -- 2. COVERAGE: every overdue row in the view has an open finding.
  select count(*) into v_second
  from v_report_upload_due d
  where not d.received and d.days_late > 0
    and not exists (
      select 1 from agent_findings f
      where f.fingerprint = 'report_upload_overdue:'||d.report_key||':'||d.licence||':'||d.period_label
        and f.resolved_at is null);
  insert into _rn values ('every overdue upload has an open finding', '0 uncovered',
                          v_second||' uncovered', v_second = 0);

  -- 3. STAND-DOWN: plant a finding against an upload that HAS been received and
  --    prove the next run closes it. Uses a real received row, not a mock.
  select d.report_key, d.licence, d.period_label into r
  from v_report_upload_due d where d.received limit 1;

  if r.report_key is null then
    insert into _rn values ('a received upload stands the finding down',
                            'tested', 'SKIPPED - no received row to test against', false);
  else
    v_fp := 'report_upload_overdue:'||r.report_key||':'||r.licence||':'||r.period_label;
    delete from agent_findings where fingerprint = v_fp and detail like '%SELF-TEST%';
    insert into agent_findings
      (agent, severity, headline, detail, scope, action, drill_to, fingerprint)
    values ('Metrc & Compliance','watch',
            'SELF-TEST row for the report-upload stand-down path',
            'SELF-TEST. Planted against an upload that has already been received, to prove '
            || 'the nag stands down. Removed at the end of this function.',
            r.licence, 'none - self test', 'none', v_fp);

    perform tg_raise_report_upload_findings(p_by);

    select case when resolved_at is null then 'STILL OPEN' else 'resolved' end into v_state
    from agent_findings where fingerprint = v_fp and detail like '%SELF-TEST%';

    insert into _rn values ('a received upload stands the finding down', 'resolved',
                            coalesce(v_state,'(row vanished)'), coalesce(v_state,'') = 'resolved');

    delete from agent_findings where fingerprint = v_fp and detail like '%SELF-TEST%';
  end if;

  insert into guard_selftest(guard_key, case_name, expected, actual, passed, ran_by)
  select 'report_upload_nag', s.case_name, s.expected, s.actual, s.passed, p_by from _rn s;

  return query select s.case_name, s.passed, s.actual from _rn s;
end;
$$;

comment on function tg_selftest_report_upload_nag(text) is
  'Proves the upload nag raises once (not twice), covers every overdue row, and stands '
  'down when the file lands. The stand-down case is planted against a genuinely received '
  'upload rather than a mock, so it exercises the real view.';;
