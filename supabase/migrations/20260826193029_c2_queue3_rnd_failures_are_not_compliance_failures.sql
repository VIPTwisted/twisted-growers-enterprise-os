-- THIRD CORRECTION, and this one would have been a false finding.
--
-- Severity 4 read "a failing laboratory result exists but the Metrc package
-- state does not say TestFailed - the two Metrc records disagree." Three tags
-- sat in it. Checked one by one, the ONLY failing line on each is
-- "N-Butane (ppm) R&D Testing". An R&D test does not set a package's compliance
-- lab state in Metrc, so SubmittedForTesting or TestingInProgress alongside a
-- failed R&D line is Metrc behaving correctly, not two records disagreeing.
--
-- Measured across every failing line in metrc_lab_results: 128 tags fail a
-- COMPLIANCE test and every one of the 128 reads TestFailed. There is not a
-- single genuine state disagreement. 126 of the 128 fail Total Yeast and Mold.
-- Five tags fail only N-Butane R&D.
--
-- Severity 4 therefore now requires a COMPLIANCE failure, and R&D-only failures
-- get their own severity 7 that says plainly why the package state does not
-- move. Two columns are appended so the reader can see which test failed rather
-- than taking the classification on trust.
--
-- One thing this does NOT do: it does not try to name the failing analyte from
-- metrc_rpt_lab_results. In that report overall_passed is the TEST BATCH's
-- verdict repeated on every analyte line, so a No against "CBD (%)" means the
-- batch failed, not that CBD failed. Only the API's per-line passed flag names
-- an analyte, so only the API evidence is used for the R&D split.
create or replace view public.v_xq_failed_no_disposition
with (security_invoker = true) as
with api_fail as (
  select package_tag,
         bool_or(test_name not ilike '%R&D%')                     as has_compliance_fail,
         bool_or(test_name ilike '%R&D%')                         as has_rnd_fail,
         string_agg(distinct test_name, '; ' order by test_name)  as failing_tests,
         min(result_date)                                         as first_fail_on
  from metrc_lab_results
  where passed is false
  group by 1
),
evidence as (
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
         af.failing_tests, af.first_fail_on,
         (a.tag is not null
          and a.source_state = 'active'
          and not coalesce((a.raw->>'IsFinished')::boolean, false))   as still_live,
         (a.lab_testing_state = 'TestFailed'
          or coalesce(af.has_compliance_fail, false)
          or r.package_tag is not null)                               as compliance_fail,
         (coalesce(af.has_rnd_fail, false)
          and not coalesce(af.has_compliance_fail, false)
          and a.lab_testing_state is distinct from 'TestFailed'
          and r.package_tag is null)                                  as rnd_only
  from tags t
  left join api      a  on a.tag         = t.package_tag
  left join rpt      r  on r.package_tag = t.package_tag
  left join disp     d  on d.package_tag = t.package_tag
  left join api_fail af on af.package_tag = t.package_tag
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
  coalesce(report_test_date, first_fail_on)        as failed_on,
  report_lab                                       as laboratory,
  disposition, decided_by, decided_on, completed   as disposition_completed,
  signals                                          as metrc_signals_agreeing,
  evidence_sources,
  case
    when rnd_only                                          then '7 R&D TEST FAILURE ONLY - no compliance state is set by it'
    when still_live and disp_tag is null                   then '1 FAILED, STILL LIVE IN METRC, NO DISPOSITION'
    when disp_tag is not null and not completed            then '2 DISPOSITION PROMISED, NOT YET DONE - see v_remediation_owed'
    when disp_tag is not null and completed                then '6 DISPOSITION RECORDED AND COMPLETED'
    when lab_testing_state in ('RetestPassed','TestPassed') then '5 FAILED THEN PASSED A RETEST - resolved in Metrc'
    when compliance_fail and api_tag is not null
     and lab_testing_state is distinct from 'TestFailed'   then '4 COMPLIANCE FAILURE, PACKAGE STATE DOES NOT SAY TestFailed'
    else                                                        '3 FAILED AND CLOSED OUT, NO DISPOSITION EVER RECORDED'
  end as severity,
  case
    when rnd_only then
      'The only failing result on this tag is an R&D test' || coalesce(' (' || failing_tests || ')', '')
      || '. An R&D test does not set a package''s compliance lab state in Metrc, which is why the state reads '
      || coalesce(lab_testing_state, 'nothing') || ' rather than TestFailed. This is Metrc behaving correctly. '
      || 'It is listed so the failure count reconciles, and because an R&D result may still matter to the process.'
    when still_live and disp_tag is null then
      'This package failed testing, is still live in Metrc, and nothing has been recorded about what will happen to it.'
      || coalesce(' Failed: ' || failing_tests || '.', '')
    when disp_tag is not null and not completed then
      'A disposition of ' || disposition || ' was recorded by ' || decided_by || ' on ' || decided_on
      || ' and has not been completed. The material is still live. v_remediation_owed tracks the wait.'
    when disp_tag is not null and completed then
      'A disposition of ' || disposition || ' was recorded by ' || decided_by || ' on ' || decided_on || ' and marked complete. Listed for completeness.'
    when lab_testing_state in ('RetestPassed','TestPassed') then
      'This package failed a test and Metrc now reads ' || lab_testing_state || '. It was retested and passed. Nothing is owed; it is listed so the failure count reconciles.'
    when compliance_fail and api_tag is not null and lab_testing_state is distinct from 'TestFailed' then
      'A COMPLIANCE test failed on this tag' || coalesce(' (' || failing_tests || ')', '')
      || ' but the Metrc package state reads ' || coalesce(lab_testing_state,'nothing') || ', not TestFailed. The two Metrc records disagree.'
    when api_tag is not null then
      'This package failed testing and has since been finished in Metrc with no disposition ever recorded.'
      || coalesce(' Failed: ' || failing_tests || '.', '')
      || ' The material is gone and the record does not say where it went.'
    else
      'The Metrc Lab Results report records a failing test batch for this tag'
      || coalesce(' at ' || report_lab, '') || coalesce(' on ' || report_test_date, '')
      || '. No disposition was recorded. Current state, room and quantity CANNOT be shown: the Metrc API package sync returns no row for this tag - it exists only as a Metrc report row, which carries no lab testing state, no location and no quantity. Re-running the package sync over this tag would make those fields appear. The failing analyte is not named because the report repeats the batch verdict on every analyte line.'
  end as what_is_wrong,
  case
    when rnd_only then 'Nothing on the compliance side. Decide separately whether the R&D result matters to the process that made it.'
    when still_live and disp_tag is null then
      'Decide what happens to it - remediate, destroy, or hold - and record that decision against the tag in Failed Material Disposition before it moves.'
    when disp_tag is not null and not completed then 'Chase the disposition to completion and record the evidence.'
    when disp_tag is not null and completed then 'Nothing.'
    when lab_testing_state in ('RetestPassed','TestPassed') then 'Nothing. Keep the retest certificate filed against the tag.'
    when compliance_fail and api_tag is not null and lab_testing_state is distinct from 'TestFailed' then
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
  'no rule threshold - a failed test either has a disposition row or it does not'::text as rule_used,
  failing_tests,
  case
    when rnd_only         then 'R&D only'
    when compliance_fail  then 'Compliance'
    else                       'Not classified - no per-analyte evidence for this tag'
  end as test_kind
from f
order by severity, coalesce(report_test_date, first_fail_on) desc nulls last, package_tag;

comment on view public.v_xq_failed_no_disposition is
'TICKET C2 QUEUE 3. Every package Metrc says failed a test, from three independent Metrc signals, with whether a disposition was ever recorded against it. R&D test failures are separated from compliance failures because an R&D result does not set a package''s compliance lab state in Metrc - treating one as a state disagreement was a false finding, corrected 26 Aug 2026. Ranked by consequence: live material first. Tags that exist only as Metrc report rows say so on their face.';;
