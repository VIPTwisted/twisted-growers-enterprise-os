create or replace view public.v_xq_failed_no_disposition
with (security_invoker = true) as
with evidence as (
  select tag as package_tag, 'Metrc package state reads TestFailed'::text as signal
    from metrc_packages
   where provenance = 'metrc api' and lab_testing_state = 'TestFailed'
  union
  select package_tag, 'Metrc API lab result recorded a fail'
    from metrc_lab_results
   where passed is false
  union
  select package_tag, 'Metrc Lab Results report recorded overall_passed = No'
    from metrc_rpt_lab_results
   where overall_passed in ('No','False')
),
tags as (
  select package_tag,
         count(*)                                  as signals,
         string_agg(signal, ' + ' order by signal)  as evidence_sources
  from evidence group by 1
),
api as (
  select distinct on (tag) tag, item_name, quantity, uom, location, packaged_on,
         lab_testing_state, source_state, license, synced_at, raw
  from metrc_packages
  where provenance = 'metrc api'
  order by tag, synced_at desc nulls last
),
rpt as (
  select package_tag,
         max(test_date)                      as report_test_date,
         min(lab_facility)                   as report_lab,
         min(item)                           as report_item,
         min(licence)                        as report_licence,
         max(as_of_date)                     as report_as_of
  from metrc_rpt_lab_results
  where overall_passed in ('No','False')
  group by 1
),
disp as (
  select package_tag,
         min(disposition)                    as disposition,
         min(decided_by)                     as decided_by,
         min(decided_at)::date               as decided_on,
         bool_or(completed_at is not null)   as completed
  from failed_material_disposition
  where superseded_at is null
  group by 1
)
select
  'Failed test, no disposition'::text as queue,
  t.package_tag,
  coalesce(a.license, r.report_licence)                as licence,
  coalesce(a.item_name, r.report_item)                 as item,
  a.location                                           as metrc_room,
  a.lab_testing_state                                  as metrc_lab_state,
  a.source_state                                       as metrc_list,
  (a.raw->>'IsFinished')::boolean                      as finished,
  a.quantity                                           as quantity_number,
  a.uom                                                as quantity_unit,
  case when f_is_weight(a.uom) then round(f_to_pounds(a.quantity, a.uom), 2) end as pounds,
  a.packaged_on,
  r.report_test_date                                   as failed_on,
  r.report_lab                                         as laboratory,
  d.disposition, d.decided_by, d.decided_on, d.completed as disposition_completed,
  t.signals                                            as metrc_signals_agreeing,
  t.evidence_sources,
  case
    when d.package_tag is not null and d.completed then '5 DISPOSITION RECORDED AND COMPLETED'
    when d.package_tag is not null                 then '4 DISPOSITION PROMISED, NOT YET DONE - see v_remediation_owed'
    when a.tag is not null and a.source_state = 'active'
     and not coalesce((a.raw->>'IsFinished')::boolean,false)
                                                    then '1 FAILED, STILL LIVE IN METRC, NO DISPOSITION'
    when a.tag is not null and a.lab_testing_state is distinct from 'TestFailed'
                                                    then '2 FAILING RESULT BUT THE PACKAGE STATE DOES NOT SAY TestFailed'
    else                                                 '3 FAILED AND CLOSED OUT, NO DISPOSITION EVER RECORDED'
  end as severity,
  case
    when d.package_tag is not null and d.completed then
      'A disposition of ' || d.disposition || ' was recorded by ' || d.decided_by || ' on ' || d.decided_on || ' and marked complete. Listed for completeness.'
    when d.package_tag is not null then
      'A disposition of ' || d.disposition || ' was recorded by ' || d.decided_by || ' on ' || d.decided_on || ' and has not been completed. v_remediation_owed tracks the wait.'
    when a.tag is not null and a.source_state = 'active' and not coalesce((a.raw->>'IsFinished')::boolean,false) then
      'This package failed testing, is still live in Metrc, and nothing has been recorded about what will happen to it.'
    when a.tag is not null and a.lab_testing_state is distinct from 'TestFailed' then
      'A failing laboratory result exists for this tag but the Metrc package state reads ' || coalesce(a.lab_testing_state,'nothing') || ', not TestFailed. The two Metrc records disagree with each other.'
    when a.tag is not null then
      'This package failed testing and has since been finished in Metrc with no disposition ever recorded. The material is gone and the record does not say where it went.'
    else
      'The Metrc Lab Results report records a failing test for this tag' ||
      coalesce(' at ' || r.report_lab, '') || coalesce(' on ' || r.report_test_date, '') ||
      '. No disposition was recorded. Current state, room and quantity CANNOT be shown: the Metrc API package sync returns no row for this tag - it exists only as a Metrc report row, which carries no lab testing state, no location and no quantity. Re-running the package sync over this tag would make those fields appear.'
  end as what_is_wrong,
  case
    when d.package_tag is not null and d.completed then 'Nothing.'
    when d.package_tag is not null then 'Chase the disposition to completion and record the evidence.'
    when a.tag is not null and a.source_state = 'active' and not coalesce((a.raw->>'IsFinished')::boolean,false) then
      'Decide what happens to it - remediate, destroy, or hold - and record that decision against the tag in Failed Material Disposition before it moves.'
    when a.tag is not null and a.lab_testing_state is distinct from 'TestFailed' then
      'Open the tag in Metrc and check which record is right. This platform cannot change either one.'
    else
      'Record what was done with this material, or confirm that historical failures predating the disposition register are treated as closed.'
  end as what_to_do,
  case
    when a.tag is not null and r.package_tag is not null then 'metrc_packages + metrc_lab_results + metrc_rpt_lab_results'
    when a.tag is not null                               then 'metrc_packages / metrc_lab_results (Metrc API mirror)'
    else                                                      'metrc_rpt_lab_results (Metrc Lab Results report import)'
  end::text                                            as metrc_source,
  coalesce(a.synced_at::date, r.report_as_of)          as metrc_as_of,
  'no rule threshold - a failed test either has a disposition row or it does not'::text as rule_used
from tags t
left join api  a on a.tag        = t.package_tag
left join rpt  r on r.package_tag = t.package_tag
left join disp d on d.package_tag = t.package_tag
order by severity, r.report_test_date desc nulls last, t.package_tag;

comment on view public.v_xq_failed_no_disposition is
'TICKET C2 QUEUE 3. Every package Metrc says failed a test, from three independent Metrc signals, with whether a disposition was ever recorded against it. Tags that exist only as Metrc report rows say so on their face rather than showing blank state.';;
