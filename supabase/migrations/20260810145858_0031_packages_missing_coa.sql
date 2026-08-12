-- ---------------------------------------------------------------------------
-- 0031 — Tags with no COA on file, with dates. Owner: "what tags with dates do
-- not have coa".
--
-- THE FINDING IS NOT WHAT IT LOOKS LIKE. 685 active packages have no COA
-- document, but the great majority of them say TestPassed IN METRC. So the
-- product WAS tested and the certificate exists at the laboratory -- we simply
-- have not fetched the document.
--
-- And it is a CURRENT problem, not a historical one. metrc_documents was
-- populated in a SINGLE run on 6 Aug 2026; nothing has fetched a COA since.
-- 2024 accounts for only 48 of the 685.
--
-- 'metrc_says_passed_but_no_coa' is the compliance-relevant column: product we
-- are holding or selling as tested, with no certificate in our own system to
-- show for it.
-- ---------------------------------------------------------------------------

create or replace view v_packages_missing_coa as
select p.license                                                as licence,
       p.raw->>'Label'                                          as package_tag,
       p.raw#>>'{Item,Name}'                                    as item,
       f_strain_from_item(p.raw#>>'{Item,Name}')                as strain,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       nullif(p.raw->>'LocationName','')                        as room,
       (p.raw->>'PackagedDate')::date                           as packaged_on,
       extract(year from (p.raw->>'PackagedDate')::date)::int   as yr,
       (current_date - (p.raw->>'PackagedDate')::date)          as days_old,
       p.raw->>'LabTestingState'                                as metrc_lab_state,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then round(f_to_pounds((p.raw->>'Quantity')::numeric,
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as lb,
       case when not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then (p.raw->>'Quantity')::numeric end              as units,
       nullif(p.raw->>'SourceHarvestNames','')                  as source_harvest,
       nullif(p.raw->>'SourcePackageLabels','')                 as source_packages,
       (p.raw->>'LabTestingState' in ('TestPassed','RetestPassed'))  as metrc_says_passed_but_no_coa,
       case
         when p.raw->>'LabTestingState' in ('TestPassed','RetestPassed')
           then 'TESTED PER METRC, NO CERTIFICATE ON FILE — fetch the document'
         when p.raw->>'LabTestingState' = 'SubmittedForTesting'
           then 'at the laboratory now — no result yet'
         when p.raw->>'LabTestingState' = 'NotSubmitted'
           then 'never submitted for testing'
         else coalesce(p.raw->>'LabTestingState','(no state)')
       end                                                      as verdict
from metrc_packages p
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false
  and not exists (select 1 from coa_extract c where c.package_tag = p.raw->>'Label');

comment on view v_packages_missing_coa is
  'Every package we hold with no COA in coa_extract, with its date, age and what '
  'Metrc says about its testing. Most say TestPassed -- the certificate exists at '
  'the lab and has simply never been fetched. metrc_documents was populated in ONE '
  'run on 6 Aug 2026 and nothing has fetched a COA since.';

grant select on v_packages_missing_coa to authenticated;
;
