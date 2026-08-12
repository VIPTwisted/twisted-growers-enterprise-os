-- Immutable audit record. Once written, a run is never edited - only superseded
-- by the next run, so the trend is the accountability.
create table if not exists forensic_audits (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz default now(),
  run_type text default 'scheduled' check (run_type in ('scheduled','on_demand')),
  section text not null,
  metric text not null,
  value numeric,
  value_text text,
  unit text,
  responsible text,
  verdict text,
  evidence text
);
alter table forensic_audits enable row level security;
drop policy if exists fa_read on forensic_audits;
create policy fa_read on forensic_audits for select to authenticated using (true);
create index if not exists fa_run on forensic_audits (run_at desc, section);

create or replace function tg_forensic_audit(p_type text default 'scheduled') returns table(sections int, metrics int) as $$
declare rid timestamptz := now(); m int := 0;
begin
  -- 1. SCHEDULE DISCIPLINE
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Schedule discipline', 'Pull and dry violations',
    count(*) filter (where rule_verdict like 'VIOLATION%'), 'events', 'Cultivation lead',
    case when count(*) filter (where rule_verdict like 'VIOLATION%') = 0 then 'CLEAN'
         else 'FAIL - late is never acceptable under the standing rule' end,
    coalesce(string_agg(distinct room || ' ' || coalesce(scheduled_date::text,''), '; ')
      filter (where rule_verdict like 'VIOLATION%'), 'none')
  from v_late_violations;
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Schedule discipline', 'Average days late',
    round(avg(days_off_schedule) filter (where rule_verdict like 'VIOLATION%')::numeric,1), 'days',
    'Cultivation lead',
    case when coalesce(avg(days_off_schedule) filter (where rule_verdict like 'VIOLATION%'),0) = 0 then 'CLEAN' else 'FAIL' end,
    'Zero is the only acceptable figure'
  from v_late_violations;

  -- 2. WEIGHT REPORTING (the honesty test)
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Weight reporting', 'Harvests with no weights recorded',
    count(*), 'harvests', 'Cultivation lead',
    case when count(*) = 0 then 'CLEAN' else 'FAIL - weights not reported' end,
    coalesce(string_agg(harvest, '; '), 'none')
  from v_harvest_lifecycle where verdict = 'MISSING WEIGHTS';

  -- 3. YIELD AND CONVERSION (the number they cannot argue with)
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Yield', 'Wet to saleable conversion, latest month',
    wet_to_saleable_pct, 'percent', 'Cultivation and post-harvest',
    case when wet_to_saleable_pct >= 28 then 'ACCEPTABLE'
         when wet_to_saleable_pct >= 22 then 'BELOW PAR' else 'FAIL' end,
    month || ': ' || saleable_lbs || ' saleable lb from ' || plants_harvested || ' plants, ' || grams_per_plant || ' g per plant'
  from v_true_cost_per_pound order by month_date desc limit 1;
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Yield', 'Best conversion on record',
    max(wet_to_saleable_pct), 'percent', 'Cultivation and post-harvest', 'BENCHMARK',
    'The gap between this and the latest month is the recoverable loss'
  from v_true_cost_per_pound;

  -- 4. GENUINE LOSS
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Loss', loss_type, dollars_at_target_cost, 'dollars', 'Cultivation and Quality',
    case when coalesce(dollars_at_target_cost,0) = 0 then 'CLEAN' else 'LOSS RECORDED' end,
    occurrences || ' occurrences, ' || pounds_affected || ' pounds'
  from v_real_loss_summary;

  -- 5. COMPLIANCE
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Compliance', flag, count(*), 'items', 'Quality and Compliance',
    case when count(*) = 0 then 'CLEAN' else 'EXPOSURE' end,
    coalesce(string_agg(distinct item, '; '), '')
  from v_custody_alerts group by flag;
  insert into forensic_audits (run_at, run_type, section, metric, value, value_text, unit, responsible, verdict, evidence)
  select rid, p_type, 'Compliance', 'Custody proof', location_known_pct, compliance_status, 'percent',
    'Whole operation', case when location_known_pct = 100 then 'CLEAN' else 'FAIL' end,
    items || ' tracked items, ' || items_without_location || ' unlocated'
  from v_custody_compliance where category = 'ALL TRACKED INVENTORY';

  -- 6. CAPITAL
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Capital', 'Items aging beyond policy', count(*), 'items', 'Inventory and Fulfilment',
    case when count(*) = 0 then 'CLEAN' else 'CASH TIED UP' end,
    'Oldest ' || coalesce(max(days_here)::text,'0') || ' days'
  from v_inventory_aging where severity in ('critical','elevated');
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Capital', 'Material without approved allocation', count(*), 'items',
    'Approver and department leads',
    case when count(*) = 0 then 'CLEAN' else 'NO AUTHORITY RECORDED' end,
    'Every material must carry an approved allocation before it moves'
  from v_awaiting_allocation;

  -- 7. PAYROLL AGAINST OUTPUT
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Payroll versus output', department || ' labour cost per saleable pound',
    labour_cost_per_saleable_pound_90d, 'dollars per pound', highest_paid_people,
    case when labour_cost_per_saleable_pound_90d is null then 'NOT MEASURABLE - load real pay rates'
         else 'MEASURED' end,
    headcount || ' people, ' || annual_loaded_cost || ' dollars annual loaded cost'
  from v_leadership_cost_vs_output where department ilike '%cultivation%';

  -- 8. DATA INTEGRITY - is the record itself trustworthy
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Data integrity', 'Hours since last Metrc sync',
    round(extract(epoch from (now() - max(started_at)))/3600, 1), 'hours', 'Platform',
    case when max(started_at) > now() - interval '2 hours' then 'CLEAN' else 'STALE' end,
    'Automatic sync runs every fifteen minutes'
  from metrc_sync_runs;
  insert into forensic_audits (run_at, run_type, section, metric, value, unit, responsible, verdict, evidence)
  select rid, p_type, 'Data integrity', 'Employees without a real pay rate loaded',
    count(*), 'people', 'Human Resources',
    case when count(*) = 0 then 'CLEAN' else 'BLOCKS COST ANALYSIS' end,
    'Cost per pound cannot be attributed without real rates'
  from employees e where e.terminated_on is null
    and not exists (select 1 from employee_rates r where r.employee_id = e.id);

  get diagnostics m = row_count;
  select count(*) into m from forensic_audits where run_at = rid;
  sections := (select count(distinct section) from forensic_audits where run_at = rid);
  metrics := m;
  return next;
end $$ language plpgsql;

-- The latest audit, and how it moved since the one before it.
create or replace view v_forensic_audit_latest as
with runs as (select distinct run_at from forensic_audits order by run_at desc limit 2),
cur as (select * from forensic_audits where run_at = (select max(run_at) from runs)),
prev as (select * from forensic_audits where run_at = (select min(run_at) from runs) and (select count(*) from runs) > 1)
select c.section, c.metric, c.value, c.value_text, c.unit, c.responsible, c.verdict, c.evidence,
  p.value as previous_value,
  case when p.value is null then 'first audit'
       when c.value is null then '—'
       when c.value < p.value then 'improved by ' || round((p.value - c.value)::numeric,1)
       when c.value > p.value then 'WORSE by ' || round((c.value - p.value)::numeric,1)
       else 'unchanged' end as movement,
  c.run_at
from cur c left join prev p on p.section = c.section and p.metric = c.metric
order by case c.verdict when 'FAIL' then 0 when 'EXPOSURE' then 1 when 'BELOW PAR' then 2
  when 'CASH TIED UP' then 3 when 'NO AUTHORITY RECORDED' then 4 else 9 end, c.section, c.metric;

create or replace view v_forensic_audit_history as
select run_at::date as audit_date, run_type,
  count(*) filter (where verdict in ('FAIL','EXPOSURE')) as failures,
  count(*) filter (where verdict = 'CLEAN') as clean,
  count(*) as metrics_checked,
  round(sum(value) filter (where unit = 'dollars')::numeric,0) as dollars_identified,
  string_agg(distinct section, ', ') filter (where verdict in ('FAIL','EXPOSURE')) as failing_sections
from forensic_audits group by run_at::date, run_type order by audit_date desc;

select cron.unschedule(jobid) from cron.job where jobname = 'forensic-audit';
select cron.schedule('forensic-audit', '0 6 * * 1', $$ select tg_forensic_audit('scheduled') $$);

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Forensic Audit (latest)', 6, 'shield', 'forensic_audit', 'v_forensic_audit_latest', 'The full forensic audit: every measured metric with who is responsible, the verdict, the evidence behind it, and whether it improved or got worse since the last audit. Failures are listed first.'),
  ('Forensic Audit History', 7, 'clock', 'forensic_audit_history', 'v_forensic_audit_history', 'Every audit ever run: date, how many metrics failed, how many were clean, the dollars identified and which sections failed - the permanent record that cannot be revised.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_role_visibility (view_key, role, visible)
select vk, r.role, r.role in ('owner','executive')
from (values ('forensic_audit'),('forensic_audit_history')) k(vk)
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do update set visible = excluded.visible;;
