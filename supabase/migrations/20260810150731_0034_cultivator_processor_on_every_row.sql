-- ---------------------------------------------------------------------------
-- 0034 — WHO CULTIVATED IT, WHO PROCESSED IT, and OURS vs THIRD PARTY, on every row.
--
-- Owner, 10 Aug 2026: "always add name of company that cultivated and processed
-- goods", "third party must always be marked 3rd party", and "you must be sure
-- that confusion from ours and 3rd party never happens for any reason anywhere on
-- the OS".
--
-- THREE DIFFERENT COMPANIES CAN TOUCH ONE PACKAGE. Conflating them is exactly how
-- third-party material books as our production -- it did on 7 Aug 2026 ($25,027 of
-- Holyoke Wilds material reported as ours) and again today, when the 56.84 lb
-- Failed Flower package was reported as "OURS" while 63% of its input by weight
-- was Greater Goods.
--
--   cultivated_by  ItemFromFacilityName -- WHERE THE ITEM ORIGINATED. This is the
--                  reliable one: it SURVIVES REPACKAGING. ReceivedFromFacilityName
--                  is NULL on every child package, which is what made the Failed
--                  Flower look like ours.
--   processed_by   the licence holding this tag -- who made it
--   supplier       who SHIPPED it to us -- neither of the above
--
-- is_third_party is a BOOLEAN so it cannot be lost in a string comparison, and
-- ownership_label always reads THIRD PARTY in capitals.
-- ---------------------------------------------------------------------------

create or replace view v_rpt_coa_compliance as
select p.raw->>'Label'                                            as package_tag,
       p.license                                                  as licence,
       (p.raw->>'PackagedDate')::date                             as packaged_on,
       extract(year    from (p.raw->>'PackagedDate')::date)::int  as yr,
       extract(quarter from (p.raw->>'PackagedDate')::date)::int  as quarter,
       to_char((p.raw->>'PackagedDate')::date,'YYYY-MM')          as month,
       (current_date - (p.raw->>'PackagedDate')::date)            as days_old,
       case when (current_date - (p.raw->>'PackagedDate')::date) > 365 then '4 · over a year'
            when (current_date - (p.raw->>'PackagedDate')::date) > 180 then '3 · 6-12 months'
            when (current_date - (p.raw->>'PackagedDate')::date) >  90 then '2 · 3-6 months'
            else '1 · under 90 days' end                          as age_band,
       p.raw#>>'{Item,Name}'                                      as item,
       f_strain_from_item(p.raw#>>'{Item,Name}')                  as strain,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       f_product_line(p.raw#>>'{Item,Name}',
                      p.raw#>>'{Item,ProductCategoryName}', '')    as product_line,
       nullif(p.raw->>'LocationName','')                          as room,
       case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'OURS'
            when nullif(p.raw->>'ItemFromFacilityName','') is null
              then 'UNKNOWN — no originating facility recorded'
            else 'THIRD PARTY — ' || (p.raw->>'ItemFromFacilityName') end as ownership,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'—') as supplier,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityLicenseNumber',''),'—') as supplier_licence,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then round(f_to_pounds((p.raw->>'Quantity')::numeric,
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as lb,
       case when not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then (p.raw->>'Quantity')::numeric end                as units,
       p.raw->>'LabTestingState'                                  as metrc_lab_state,
       coalesce((p.raw->>'IsOnHold')::boolean,false)              as on_hold,
       (c.package_tag is not null)                                as has_coa,
       c.total_thc                                                as coa_total_thc,
       c.total_cannabinoids                                       as coa_tac,
       c.total_terpenes                                           as coa_terpenes,
       c.document_id                                              as coa_document_id,
       nullif(p.raw->>'SourceHarvestNames','')                    as source_harvest,
       case
         when c.package_tag is not null                            then '0 · COA ON FILE'
         when p.raw->>'LabTestingState' ilike '%fail%'             then '5 · FAILED — do not sell, decide'
         when p.raw->>'LabTestingState' in ('TestPassed','RetestPassed')
                                                                   then '1 · TESTED, NO CERTIFICATE — fetch the document'
         when p.raw->>'LabTestingState' = 'SubmittedForTesting'    then '2 · AT THE LABORATORY — awaiting result'
         when p.raw->>'LabTestingState' = 'NotSubmitted'           then '3 · NEVER SUBMITTED — intermediate stock'
         when p.raw->>'LabTestingState' = 'NotRequired'            then '4 · TESTING NOT REQUIRED'
         else '6 · ' || coalesce(p.raw->>'LabTestingState','no state recorded')
       end                                                        as verdict,
       case
         when p.raw->>'LabTestingState' ilike '%fail%'             then 'BLOCK — failed product on hand'
         when c.package_tag is null
          and p.raw->>'LabTestingState' in ('TestPassed','RetestPassed')
                                                                   then 'FETCH — certificate exists at the lab'
         when c.package_tag is null
          and p.raw->>'LabTestingState' = 'NotSubmitted'
          and (current_date - (p.raw->>'PackagedDate')::date) > 180 then 'REVIEW — untested over six months'
         when c.package_tag is null then 'monitor'
         else 'ok'
       end                                                        as action,
       /* ---------- appended: who did what ---------- */
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(not recorded)')     as cultivated_by,
       coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'—')         as cultivated_by_licence,
       coalesce((select cl.label from company_licenses cl where cl.license = p.license limit 1),
                p.license)                                                      as processed_by,
       p.license                                                                as processed_by_licence,
       (not f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')))    as is_third_party,
       case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'OURS'
            else 'THIRD PARTY' end                                              as ownership_label,
       nullif(p.raw->>'SourcePackageLabels','')                                 as source_packages,
       nullif(p.raw->>'ReceivedFromManifestNumber','')                          as inbound_manifest
from metrc_packages p
left join coa_extract c on c.package_tag = p.raw->>'Label'
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false;

comment on view v_rpt_coa_compliance is
  'COA compliance per held package, with WHO CULTIVATED and WHO PROCESSED on every '
  'row. cultivated_by comes from ItemFromFacilityName because it SURVIVES '
  'REPACKAGING -- ReceivedFromFacilityName is NULL on every child, which is what '
  'made a 63%-third-party package look like ours. is_third_party is a BOOLEAN so it '
  'cannot be lost in a string comparison.';

grant select on v_rpt_coa_compliance to authenticated;
;
