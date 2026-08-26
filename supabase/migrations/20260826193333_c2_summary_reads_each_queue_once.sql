-- The summary asked each queue for four separate figures with four separate
-- subselects, so it read every queue four times. One aggregate per queue now
-- serves all of them from a single scan.
create or replace view public.v_xq_summary
with (security_invoker = true) as
with q1 as (
  select count(*) items,
         count(*) filter (where severity like '1%' or severity like '2%') needs_now,
         round(sum(abs(metrc_current_weight_lb)),1) lb,
         max(metrc_as_of) as_of
  from v_xq_harvest_moisture
),
q1ff as (
  select count(*) n from metrc_harvests
  where f_harvest_weight_basis(name, raw->>'DryingLocationName', (raw->>'CurrentWeight')::numeric) = 'wet'
),
q2 as (
  select count(*) items,
         count(*) filter (where severity like '1%' or severity like '2%') needs_now,
         round(sum(pounds),2) lb,
         max(metrc_as_of) as_of
  from v_xq_never_submitted
),
q2pop as (
  select count(*) filter (where provenance <> 'metrc api') report_only,
         count(*) filter (where provenance = 'metrc api')  api_rows
  from metrc_packages
),
q3 as (
  select count(*) items,
         count(*) filter (where severity like '1%' or severity like '2%') needs_now,
         round(sum(pounds),2) lb,
         max(metrc_as_of) as_of,
         count(*) filter (where quantity_number is null) report_only
  from v_xq_failed_no_disposition
),
q4 as (
  select count(*) items,
         count(*) filter (where severity like '1%' or severity like '2%') needs_now,
         round(sum(packaged_lb),1) lb,
         max(metrc_as_of) as_of
  from v_xq_harvest_open_past_limit
)
select 1 as ord, 'Harvest moisture / residual'::text as queue,
       q1.items, q1.needs_now as needs_action_now, q1.lb as pounds_involved,
       'metrc_harvests, corroborated against metrc_rpt_harvest_moisture'::text as metrc_source,
       q1.as_of as metrc_as_of,
       'expected_moisture_pct_min/max, harvest_residual_outlier_min/max_pct, dry_window_max_days'::text as rules_used,
       q1ff.n || ' fresh-frozen harvests are excluded from the band tests: they are packaged wet and correctly show no moisture loss.' as not_assessed
from q1 cross join q1ff
union all
select 2, 'Never submitted for testing', q2.items, q2.needs_now, q2.lb,
       'metrc_packages (Metrc API mirror), via v_never_tested_proof', q2.as_of,
       'ageing_stock_days',
       q2pop.report_only || ' package rows came from a Metrc report import that carries no lab testing state column. They cannot be assessed for testing at all. Only the '
         || q2pop.api_rows || ' packages the Metrc API returns are in scope.'
from q2 cross join q2pop
union all
select 3, 'Failed test, no disposition', q3.items, q3.needs_now, q3.lb,
       'metrc_packages + metrc_lab_results + metrc_rpt_lab_results', q3.as_of,
       'none - a failed test either has a disposition row or it does not',
       q3.report_only || ' of these tags exist only as Metrc report rows, so their current state, room and quantity cannot be shown, and the failing analyte cannot be named because that report repeats the batch verdict on every analyte line. Re-running the Metrc package sync over them would fill the state, room and quantity.'
from q3
union all
select 4, 'Harvest open past the limit', q4.items, q4.needs_now, q4.lb,
       'metrc_harvests, via v_harvest_forensic and v_overdue_harvests', q4.as_of,
       'harvest_open_max_days',
       'None. Every harvest the Metrc API returns is assessed.'
from q4
order by 1;

comment on view public.v_xq_summary is
'TICKET C2. One row per Metrc exception queue: how many items, how many need action now (severity 1 or 2 in every queue), the pounds involved, the Metrc source, when that source was captured, the rule row used, and - required by rule A3 - what the queue could NOT assess and why. Each queue is read exactly once.';;
