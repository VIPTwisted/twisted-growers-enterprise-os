-- Every sweep the watchdog runs, permanently.
create table if not exists watchdog_runs (
  id bigserial primary key,
  ran_at timestamptz not null default now(),
  ran_by text not null default 'scheduled sweep',
  duration_ms int,
  findings_raised int,
  findings_repeated int,
  findings_resolved int,
  total_pounds_flagged numeric,
  total_dollars_flagged numeric,
  notes text
);
alter table watchdog_runs enable row level security;
drop policy if exists wr_all on watchdog_runs;
create policy wr_all on watchdog_runs for all to authenticated using (true) with check (true);

-- One immutable row per finding per sweep. Never updated, never deleted.
create table if not exists watchdog_findings (
  id bigserial primary key,
  run_id bigint references watchdog_runs(id),
  observed_at timestamptz not null default now(),
  fingerprint text not null,
  severity text not null,
  -- the six questions
  what text not null,
  where_it_is text,
  who_is_accountable text,
  when_it_started text,
  why_it_matters text not null,
  how_it_was_detected text not null,
  what_to_do text not null,
  -- the proof
  the_arithmetic text,
  evidence jsonb,
  record_count int,
  pounds numeric,
  dollars numeric,
  drill text,
  -- searchable
  search_text text
);
alter table watchdog_findings enable row level security;
drop policy if exists wf_read on watchdog_findings;
create policy wf_read on watchdog_findings for select to authenticated using (true);
drop policy if exists wf_insert on watchdog_findings;
create policy wf_insert on watchdog_findings for insert to authenticated with check (true);
-- deliberately NO update or delete policy: the forensic log is append-only.

create index if not exists wf_search on watchdog_findings using gin (to_tsvector('english', coalesce(search_text,'')));
create index if not exists wf_when on watchdog_findings (observed_at desc);
create index if not exists wf_fp on watchdog_findings (fingerprint, observed_at desc);

create or replace function tg_watchdog_forensic()
returns bigint language plpgsql security definer set search_path=public as $$
declare
  v_run bigint; v_start timestamptz := clock_timestamp(); v_cost numeric;
  v_raised int := 0; v_lb numeric := 0; v_usd numeric := 0;
begin
  select value into v_cost from conversion_factors where key='target_cost_per_lb';
  insert into watchdog_runs (ran_by) values ('scheduled sweep') returning id into v_run;

  -- ── Never submitted for testing ──────────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count, pounds, dollars, drill, search_text)
  select v_run, 'untested:'||s.stream, 'critical',
    round(sum(s.pounds),1)||' lb of '||lower(s.stream)||' has never been submitted for laboratory testing',
    string_agg(distinct s.location||' ('||s.license||')', '; '),
    'Quality and Compliance',
    'Oldest package was created '||max(s.oldest_packaged)::text||', '||max(s.oldest_days)||' days ago',
    'Untested product cannot legally be sold. It is capital that cannot move and an inspection exposure.',
    'Swept every package in Metrc where LabTestingState is NotSubmitted and quantity is above zero.',
    'Submit it for testing, or record a disposition against it in Metrc.',
    sum(s.packages)||' packages x '||round(sum(s.pounds),1)||' lb x $'||v_cost||' per lb = $'||round(sum(s.pounds)*v_cost),
    jsonb_agg(jsonb_build_object('stream',s.stream,'license',s.license,'location',s.location,
      'packages',s.packages,'pounds',s.pounds,'oldest_days',s.oldest_days,'oldest_packaged',s.oldest_packaged)),
    sum(s.packages)::int, round(sum(s.pounds),1), round(sum(s.pounds)*v_cost), 'lab_results',
    'never submitted testing untested '||s.stream||' '||string_agg(distinct s.location,' ')||' '||string_agg(distinct s.license,' ')
  from v_stock_on_hand s where s.lab_state='NotSubmitted' group by s.stream having sum(s.pounds) > 0.5;

  -- ── Our own material that failed ─────────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count, pounds, dollars, drill, search_text)
  select v_run, 'ourfail:'||s.stream, 'critical',
    round(sum(s.pounds),1)||' lb of '||lower(s.stream)||' we grew ourselves failed laboratory testing',
    string_agg(distinct s.location||' ('||s.license||')', '; '),
    'Cultivation and Quality',
    'Oldest failed package '||max(s.oldest_days)||' days old, created '||max(s.oldest_packaged)::text,
    'We grew it, packaged it and it failed. This is a genuine loss and a process failure to trace back to a room, a dry time or a handling step.',
    'Swept every package where LabTestingState is TestFailed and the originating licence is one of ours.',
    'Find the root cause, then decide remediate or destroy and record the disposition in Metrc.',
    sum(s.packages)||' packages x '||round(sum(s.pounds),1)||' lb x $'||v_cost||' = $'||round(sum(s.pounds)*v_cost),
    jsonb_agg(jsonb_build_object('stream',s.stream,'location',s.location,'strains',s.strains,
      'packages',s.packages,'pounds',s.pounds,'oldest_days',s.oldest_days)),
    sum(s.packages)::int, round(sum(s.pounds),1), round(sum(s.pounds)*v_cost), 'failed_testing_by_origin',
    'failed testing our own '||s.stream||' '||string_agg(distinct s.location,' ')
  from v_stock_on_hand s where s.lab_state='TestFailed' and s.origin='Grown by us' group by s.stream;

  -- ── Harvests that do not reconcile ───────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count, pounds, drill, search_text)
  select v_run, 'massbal:'||m.harvest, 'critical',
    'Harvest '||m.harvest||' does not reconcile - '||abs(m.reconciliation_gap_lb)||' lb unexplained',
    m.room, 'Cultivation - whoever recorded the weights',
    'Harvest cut '||m.harvest_start::text||coalesce(', closed '||m.finished::text,''),
    'Wet weight must equal packaged plus recorded waste plus evaporated moisture. A gap means a weight was entered wrong or product left without being recorded.',
    'Compared wet minus packaged minus waste against the current weight Metrc holds independently, flagging any gap over two percent.',
    'Find which of the four figures is wrong and correct it in Metrc.',
    m.the_arithmetic, to_jsonb(m), 1, abs(m.reconciliation_gap_lb), 'moisture_accounting',
    'mass balance reconcile '||m.harvest||' '||m.room||' '||coalesce(m.strain,'')
  from v_moisture_accounting m
  where m.finished is not null and abs(coalesce(m.reconciliation_gap_lb,0)) > greatest(2, m.wet_lb*0.02);

  -- ── Storage limits breached ──────────────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, pounds, dollars, drill, search_text)
  select v_run, 'limit:'||l.stream, 'elevated',
    l.stream||' is '||lower(l.status),
    coalesce(l.location,'all locations'), 'Vincent - limits are his to set and enforce',
    'Oldest package '||l.oldest_days||' days old',
    'Without a ceiling nothing warns us we are over-stocked or holding material past its useful life. Capital sits and quality falls.',
    'Compared live pounds on hand and oldest package age against the ceilings set on the Storage Limits page.',
    'Move it, sell it, process it, or raise the limit deliberately and record who decided.',
    coalesce(l.on_hand_lb,0)||' lb on hand'||coalesce(' against a '||l.max_lb||' lb ceiling','')||
      coalesce(', oldest '||l.oldest_days||' days against a '||l.max_age_days||' day limit',''),
    to_jsonb(l), l.on_hand_lb, round(l.on_hand_lb*v_cost), 'storage_limit_status',
    'storage limit '||l.stream||' '||l.status
  from v_storage_limit_status l
  where l.status in ('OVER THE STORAGE LIMIT','MATERIAL OLDER THAN THE LIMIT','APPROACHING THE LIMIT');

  -- ── Purchased material sitting untouched ─────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, evidence, record_count, drill, search_text)
  select v_run, 'tpsitting:'||t.supplier, 'elevated',
    count(*)||' purchased packages from '||t.supplier||' received and never drawn from',
    string_agg(distinct t.location, '; '), 'Purchasing and Manufacturing',
    'Oldest received '||max(t.received_on)::text||', '||max(t.days_since_received)||' days ago',
    'Purchased material sitting still is cash already spent and not yet earned back, and it ages while it waits.',
    'Traced every purchased package from its inbound manifest and checked whether any quantity has been drawn.',
    'Process it or sell it, or explain why it is being held.',
    jsonb_agg(jsonb_build_object('tag',t.tag,'item',t.item_name,'received_on',t.received_on,
      'qty',t.qty_received,'remaining',t.qty_remaining,'days',t.days_since_received)),
    count(*)::int, 'third_party_lifecycle',
    'third party sitting untouched '||t.supplier
  from v_third_party_lifecycle t where t.position like 'SITTING%' group by t.supplier;

  -- ── Laboratory turnaround ────────────────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, evidence, record_count, drill, search_text)
  select v_run, 'labslow:'||coalesce(t.category,'unknown'), 'watch',
    'Laboratory turnaround on '||t.category||' reached '||t.slowest_turnaround_days||' days',
    'External laboratory', 'Quality - whoever manages the laboratory relationship',
    'Measured across '||t.packages||' packages on record',
    'Every day waiting on a result is a day the product cannot be sold. Slow turnaround is working capital sitting idle.',
    'Measured the gap between the date each package was submitted and the date its result was recorded in Metrc.',
    'Chase the laboratory, and consider a second laboratory for overflow.',
    'average '||coalesce(t.avg_turnaround_days,0)||' days, worst '||t.slowest_turnaround_days||', '||t.took_over_14_days||' over 14 days',
    to_jsonb(t), t.packages, 'lab_turnaround_summary',
    'laboratory turnaround slow '||t.category
  from v_lab_turnaround_summary t where coalesce(t.slowest_turnaround_days,0) > 14;

  -- ── Questions left unanswered ────────────────────────────────────
  insert into watchdog_findings (run_id, fingerprint, severity, what, where_it_is, who_is_accountable,
    when_it_started, why_it_matters, how_it_was_detected, what_to_do, evidence, pounds, dollars, drill, search_text)
  select v_run, 'question:'||q.question_key, 'elevated',
    'Unanswered '||q.days_open||' days: '||q.question,
    q.area, 'Vinny or Vincent', 'First raised '||q.first_raised::text,
    coalesce(q.why_it_matters,'Blocks reporting'), 'Raised automatically when the platform found a fact nobody had recorded.',
    'Answer it. Until then every figure it feeds is unreliable.',
    to_jsonb(q), q.exposure_lb, q.exposure_dollars, 'open_questions',
    'unanswered question '||q.area||' '||q.question
  from v_open_questions q where q.days_open > 3;

  select count(*), coalesce(sum(pounds),0), coalesce(sum(dollars),0)
    into v_raised, v_lb, v_usd
  from watchdog_findings where run_id = v_run;

  update watchdog_runs
     set duration_ms = extract(milliseconds from (clock_timestamp() - v_start))::int,
         findings_raised = v_raised, total_pounds_flagged = v_lb, total_dollars_flagged = v_usd
   where id = v_run;

  perform tg_inventory_watch();
  return v_run;
end $$;

select tg_watchdog_forensic() as run_id;;
