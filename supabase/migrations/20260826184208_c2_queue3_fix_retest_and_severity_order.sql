-- Correction found in verification. The old severity 2 - "failing result but the
-- package state does not say TestFailed" - collected 4 tags and called them all a
-- disagreement needing action. Checked one by one:
--   1 reads RetestPassed. It failed and then passed a retest. That is the correct
--     sequence, not a defect, and it must not sit in a queue of open work.
--   3 read SubmittedForTesting or TestingInProgress on packages Metrc has since
--     finished. Those are a real record gap, but the material is gone and the
--     quantity is zero, so they do not outrank live material.
-- All 4 are inactive and finished. Meanwhile the 10 packages with a disposition
-- promised and not completed hold 150.43 lb of live material, and were ranked
-- below both. The ladder now runs by consequence: live material first.
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
),
f as (
  select t.package_tag, t.signals, t.evidence_sources,
         a.tag as api_tag, a.item_name, a.quantity, a.uom, a.location, a.packaged_on,
         a.lab_testing_state, a.source_state, a.license, a.synced_at, a.raw,
         r.package_tag as rpt_tag, r.report_test_date, r.report_lab, r.report_item,
         r.report_licence, r.report_as_of,
         d.package_tag as disp_tag, d.disposition, d.decided_by, d.decided_on, d.completed,
         (a.tag is not null
          and a.source_state = 'active'
          and not coalesce((a.raw->>'IsFinished')::boolean, false)) as still_live
  from tags t
  left join api  a on a.tag        = t.package_tag
  left join rpt  r on r.package_tag = t.package_tag
  left join disp d on d.package_tag = t.package_tag
)
select
  'Failed test, no disposition'::text as queue,
  package_tag,
  coalesce(license, report_licence)                as licence,
  coalesce(item_name, report_item)                 as item,
  location                                         as metrc_room,
  lab_testing_state                                as metrc_lab_state,
  source_state                                     as metrc_list,
  (raw->>'IsFinished')::boolean                    as finished,
  quantity                                         as quantity_number,
  uom                                              as quantity_unit,
  case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end as pounds,
  packaged_on,
  report_test_date                                 as failed_on,
  report_lab                                       as laboratory,
  disposition, decided_by, decided_on, completed   as disposition_completed,
  signals                                          as metrc_signals_agreeing,
  evidence_sources,
  case
    when still_live and disp_tag is null                   then '1 FAILED, STILL LIVE IN METRC, NO DISPOSITION'
    when disp_tag is not null and not completed            then '2 DISPOSITION PROMISED, NOT YET DONE - see v_remediation_owed'
    when disp_tag is not null and completed                then '6 DISPOSITION RECORDED AND COMPLETED'
    when lab_testing_state in ('RetestPassed','TestPassed') then '5 FAILED THEN PASSED A RETEST - resolved in Metrc'
    when api_tag is not null
     and lab_testing_state is distinct from 'TestFailed'   then '4 FAILING RESULT, PACKAGE FINISHED, METRC STATE NEVER UPDATED'
    else                                                        '3 FAILED AND CLOSED OUT, NO DISPOSITION EVER RECORDED'
  end as severity,
  case
    when still_live and disp_tag is null then
      'This package failed testing, is still live in Metrc, and nothing has been recorded about what will happen to it.'
    when disp_tag is not null and not completed then
      'A disposition of ' || disposition || ' was recorded by ' || decided_by || ' on ' || decided_on || ' and has not been completed. The material is still live. v_remediation_owed tracks the wait.'
    when disp_tag is not null and completed then
      'A disposition of ' || disposition || ' was recorded by ' || decided_by || ' on ' || decided_on || ' and marked complete. Listed for completeness.'
    when lab_testing_state in ('RetestPassed','TestPassed') then
      'This package failed a test and Metrc now reads ' || lab_testing_state || '. It was retested and passed. Nothing is owed; it is listed so the failure count reconciles.'
    when api_tag is not null and lab_testing_state is distinct from 'TestFailed' then
      'A failing laboratory result exists for this tag but the Metrc package state reads ' || coalesce(lab_testing_state,'nothing') || ', not TestFailed, and the package has since been finished. The two Metrc records disagree and the material is already gone.'
    when api_tag is not null then
      'This package failed testing and has since been finished in Metrc with no disposition ever recorded. The material is gone and the record does not say where it went.'
    else
      'The Metrc Lab Results report records a failing test for this tag' ||
      coalesce(' at ' || report_lab, '') || coalesce(' on ' || report_test_date, '') ||
      '. No disposition was recorded. Current state, room and quantity CANNOT be shown: the Metrc API package sync returns no row for this tag - it exists only as a Metrc report row, which carries no lab testing state, no location and no quantity. Re-running the package sync over this tag would make those fields appear.'
  end as what_is_wrong,
  case
    when still_live and disp_tag is null then
      'Decide what happens to it - remediate, destroy, or hold - and record that decision against the tag in Failed Material Disposition before it moves.'
    when disp_tag is not null and not completed then 'Chase the disposition to completion and record the evidence.'
    when disp_tag is not null and completed then 'Nothing.'
    when lab_testing_state in ('RetestPassed','TestPassed') then 'Nothing. Keep the retest certificate filed against the tag.'
    when api_tag is not null and lab_testing_state is distinct from 'TestFailed' then
      'Open the tag in Metrc and check which record is right. This platform cannot change either one.'
    else
      'Record what was done with this material, or confirm that historical failures predating the disposition register are treated as closed.'
  end as what_to_do,
  case
    when api_tag is not null and rpt_tag is not null then 'metrc_packages + metrc_lab_results + metrc_rpt_lab_results'
    when api_tag is not null                         then 'metrc_packages / metrc_lab_results (Metrc API mirror)'
    else                                                  'metrc_rpt_lab_results (Metrc Lab Results report import)'
  end::text                                          as metrc_source,
  coalesce(synced_at::date, report_as_of)            as metrc_as_of,
  'no rule threshold - a failed test either has a disposition row or it does not'::text as rule_used
from f
order by severity, report_test_date desc nulls last, package_tag;

comment on view public.v_xq_failed_no_disposition is
'TICKET C2 QUEUE 3. Every package Metrc says failed a test, from three independent Metrc signals, with whether a disposition was ever recorded against it. Ranked by consequence: live material first, then historical record gaps. A failure later resolved by a passing retest is separated out rather than left in the queue. Tags that exist only as Metrc report rows say so on their face rather than showing blank state.';;
