-- ═══ 1. THIRD PARTY: RECEIPT TO SALE, EVERY STEP ════════════════════
drop view if exists v_third_party_chain cascade;
create view v_third_party_chain as
with inc as (
  select
    p.tag, p.item_name, p.license as held_under, p.location, p.quantity, p.uom,
    p.packaged_on,
    p.raw->>'ItemFromFacilityLicenseNumber' as origin_license,
    coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'(supplier not recorded)') as supplier,
    p.raw->>'ReceivedFromManifestNumber' as inbound_manifest,
    (p.raw->>'ReceivedDateTime')::date as received_on,
    (p.raw->>'ReceivedQuantity')::numeric as received_qty,
    (p.raw->>'CreatedQuantity')::numeric as created_qty,
    p.raw->>'LabTestingState' as lab_state,
    (p.raw->>'LabTestingStateDate')::date as lab_state_on,
    p.raw#>>'{Item,ProductCategoryName}' as category,
    p.raw#>>'{Item,StrainName}' as strain,
    p.raw->>'SourcePackageLabels' as made_from,
    p.raw->>'SourceProductionBatchNumbers' as production_batch,
    (p.raw->>'IsFinished')::boolean as finished
  from metrc_packages p
  where coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') not in ('MC281714','MP281909')
    and coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') <> ''
)
select
  supplier, origin_license, inbound_manifest, received_on,
  tag, item_name, strain, category, held_under, location,
  received_qty, quantity as remaining_qty, uom,
  round(coalesce(received_qty,0) - coalesce(quantity,0)) as consumed_qty,
  case when coalesce(received_qty,0) > 0
       then round(100*(coalesce(received_qty,0)-coalesce(quantity,0))/received_qty,1) end as pct_consumed,
  lab_state, lab_state_on, production_batch, made_from, finished,
  (current_date - received_on) as days_since_received,
  case
    when quantity = 0 and finished then 'FULLY USED - consumed into product or sold'
    when quantity = 0 then 'Drawn to zero but not marked finished'
    when coalesce(received_qty,0) = coalesce(quantity,0) then 'UNTOUCHED - nothing drawn from it yet'
    else 'PARTLY USED - '||round(100*(coalesce(received_qty,0)-coalesce(quantity,0))/nullif(received_qty,0),1)||' percent drawn'
  end as position,
  case
    when lab_state = 'TestFailed' then 'FAILED TESTING - recover from '||supplier||' before writing anything off'
    when quantity > 0 and (current_date - received_on) > 90 then 'SITTING '||(current_date-received_on)||' DAYS - purchased material tying up cash'
    when lab_state = 'NotSubmitted' and quantity > 0 then 'NEVER SUBMITTED FOR TESTING'
    else 'Normal'
  end as flag
from inc
order by received_on desc nulls last, supplier;

-- What third party material turned INTO
drop view if exists v_third_party_downstream cascade;
create view v_third_party_downstream as
select
  src.supplier, src.tag as source_tag, src.item_name as source_item, src.strain,
  src.received_qty, src.uom as source_uom,
  child.tag as made_into_tag, child.item_name as made_into,
  child.raw#>>'{Item,ProductCategoryName}' as made_into_category,
  child.quantity as made_qty, child.uom as made_uom,
  child.packaged_on as made_on,
  child.raw->>'LabTestingState' as made_lab_state,
  child.license as made_under
from v_third_party_chain src
join metrc_packages child
  on child.raw->>'SourcePackageLabels' like '%'||src.tag||'%'
order by src.supplier, src.received_on desc nulls last;

-- ═══ 2. LABORATORY TURNAROUND AND RESULTS ═══════════════════════════
drop view if exists v_lab_results cascade;
create view v_lab_results as
select
  p.license, p.tag, p.item_name,
  p.raw#>>'{Item,StrainName}' as strain,
  p.raw#>>'{Item,ProductCategoryName}' as category,
  case
    when coalesce(p.raw->>'ItemFromFacilityLicenseNumber','') in ('MC281714','MP281909') then 'Grown by us'
    else 'Bought in' end as origin,
  coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'Twisted Growers') as supplier,
  p.quantity, p.uom, p.location,
  p.raw->>'LabTestingState' as result,
  (p.raw->>'LabTestingStateDate')::date as submitted_on,
  (p.raw->>'LabTestingRecordedDate')::date as result_on,
  ((p.raw->>'LabTestingRecordedDate')::date - (p.raw->>'LabTestingStateDate')::date) as turnaround_days,
  (p.raw->>'LabTestResultExpirationDateTime')::date as coa_expires,
  ((p.raw->>'LabTestResultExpirationDateTime')::date - current_date) as days_until_expiry,
  p.raw->>'ProductRequiresRemediation' as needs_remediation,
  case
    when p.raw->>'LabTestingState' = 'TestFailed' then 'FAILED'
    when p.raw->>'LabTestingState' = 'TestPassed' then 'Passed'
    when p.raw->>'LabTestingState' = 'NotSubmitted' then 'NEVER SUBMITTED'
    else 'Awaiting result'
  end as verdict,
  case
    when (p.raw->>'LabTestingRecordedDate') is null and (p.raw->>'LabTestingStateDate') is not null
         and p.raw->>'LabTestingState' not in ('TestPassed','TestFailed','NotSubmitted')
      then 'OUT '||(current_date - (p.raw->>'LabTestingStateDate')::date)||' DAYS with no result yet'
    when ((p.raw->>'LabTestingRecordedDate')::date - (p.raw->>'LabTestingStateDate')::date) > 14
      then 'SLOW - laboratory took '||((p.raw->>'LabTestingRecordedDate')::date - (p.raw->>'LabTestingStateDate')::date)||' days'
    else null
  end as turnaround_flag
from metrc_packages p
where p.raw->>'LabTestingState' is not null;

drop view if exists v_lab_turnaround_summary cascade;
create view v_lab_turnaround_summary as
select
  coalesce(nullif(l.category,''),'(uncategorised)') as category,
  count(*) as packages,
  count(*) filter (where result='TestPassed') as passed,
  count(*) filter (where result='TestFailed') as failed,
  count(*) filter (where result='NotSubmitted') as never_submitted,
  count(*) filter (where verdict='Awaiting result') as awaiting,
  round(100.0*count(*) filter (where result='TestFailed')
        / nullif(count(*) filter (where result in ('TestPassed','TestFailed')),0),1) as fail_rate_pct,
  round(avg(turnaround_days) filter (where turnaround_days >= 0),1) as avg_turnaround_days,
  max(turnaround_days) as slowest_turnaround_days,
  count(*) filter (where turnaround_days > 14) as took_over_14_days
from v_lab_results l group by 1 order by 2 desc;

drop view if exists v_lab_fail_rate_by_origin cascade;
create view v_lab_fail_rate_by_origin as
select origin, supplier,
  count(*) filter (where result in ('TestPassed','TestFailed')) as tested,
  count(*) filter (where result='TestPassed') as passed,
  count(*) filter (where result='TestFailed') as failed,
  round(100.0*count(*) filter (where result='TestFailed')
        / nullif(count(*) filter (where result in ('TestPassed','TestFailed')),0),1) as fail_rate_pct,
  round(sum(quantity) filter (where result='TestFailed')/453.592,1) as failed_lb,
  round(avg(turnaround_days) filter (where turnaround_days >= 0),1) as avg_turnaround_days
from v_lab_results
group by 1,2 having count(*) filter (where result in ('TestPassed','TestFailed')) > 0
order by failed_lb desc nulls last;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Third Party — Receipt to Sale', 19, 'truck', 'third_party_chain', 'v_third_party_chain',
  'Every purchased package from the moment it arrived: supplier, inbound manifest, received date, quantity in, quantity left, how much has been drawn, what it became, its testing state and how long it has been sitting.'),
 ('Third Party — What It Became', 20, 'git-merge', 'third_party_downstream', 'v_third_party_downstream',
  'Purchased material traced forward into the vapes, pre-rolls and concentrates made from it, with the child package tag, quantity and testing state.'),
 ('Laboratory Results', 21, 'flask', 'lab_results', 'v_lab_results',
  'Every package tested: pass or fail, when it was submitted, when the result came back, how many days the laboratory took, when the certificate expires, and whether it came from us or a supplier.'),
 ('Laboratory Turnaround', 22, 'clock', 'lab_turnaround_summary', 'v_lab_turnaround_summary',
  'By product category: how many passed, failed, are still awaiting a result or were never submitted, the fail rate, and how long the laboratory takes on average and at worst.'),
 ('Fail Rate by Supplier', 23, 'bar-chart-2', 'lab_fail_rate_by_origin', 'v_lab_fail_rate_by_origin',
  'Fail rate and failed pounds by origin and supplier, so a supplier sending material that fails can be identified and charged back.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from
 (values ('third_party_chain'),('third_party_downstream'),('lab_results'),('lab_turnaround_summary'),('lab_fail_rate_by_origin')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;;
