-- ---------------------------------------------------------------------------
-- 0032 — COA COMPLIANCE REPORT. Owner: "build this report with date range and all
-- filters this is important for inventory management."
--
-- One row per package we HOLD, saying whether a certificate exists and, when it
-- does not, WHY. Every dimension a person would filter on is a column: date, year,
-- quarter, month, licence, room, category, product line, strain, ownership,
-- supplier, verdict, age band, hold state.
--
-- WHY THE VERDICT MATTERS MORE THAN THE COUNT. "No COA" is four different
-- situations and they need opposite responses:
--   TESTED, NO CERTIFICATE   the lab has it, we never fetched it -> a sync job
--   NEVER SUBMITTED          intermediate stock, tested later    -> usually fine
--   AT THE LABORATORY        in flight                            -> wait
--   FAILED                   do not sell                          -> a decision
-- A single "685 packages missing COA" number hides all four and reads like a
-- compliance crisis when most of it is a document fetch.
--
-- OURS vs THIRD PARTY is on every row: of ten failed packages held today, EIGHT
-- are bought-in (LC Square five, Gibby's Garden two) and two are ours.
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

       case when nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','') is null then 'OURS — made here'
            when f_is_ours(p.raw->>'ReceivedFromFacilityLicenseNumber')        then 'OURS — our other licence'
            else 'THIRD PARTY — bought in' end                    as ownership,
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

       /* The one column an inventory manager acts on. */
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
       end                                                        as action
from metrc_packages p
left join coa_extract c on c.package_tag = p.raw->>'Label'
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false;

comment on view v_rpt_coa_compliance is
  'COA compliance per held package, with every filter dimension: packaged_on, yr, '
  'quarter, month, age_band, licence, room, category, product_line, strain, '
  'ownership, supplier, verdict, action, on_hold. "No COA" is FOUR different '
  'situations needing opposite responses -- fetch, wait, review, block -- and the '
  'verdict column separates them so a document-fetch backlog is never mistaken for '
  'a compliance failure. Filter by date range on packaged_on.';

grant select on v_rpt_coa_compliance to authenticated;


-- Summary at any grain, over any date range.
create or replace function f_coa_compliance_summary(
  p_from date default '2000-01-01',
  p_to   date default '2999-12-31',
  p_group_by text default 'yr'          -- yr | month | quarter | category | product_line
                                        -- room | licence | ownership | supplier | strain | age_band
) returns table (
  grouping_value text, verdict text, action text,
  tags bigint, lb numeric, units numeric,
  oldest date, newest date, oldest_days integer
) language plpgsql stable as $$
begin
  return query execute format($f$
    select coalesce(%I::text,'(none)') as grouping_value,
           verdict, action,
           count(*)::bigint,
           round(sum(lb),1),
           sum(units),
           min(packaged_on), max(packaged_on), max(days_old)::integer
    from v_rpt_coa_compliance
    where packaged_on between $1 and $2
    group by 1,2,3
    order by 1, 2
  $f$, p_group_by) using p_from, p_to;
end $$;

comment on function f_coa_compliance_summary(date,date,text) is
  'COA compliance summarised over a DATE RANGE at any grain. '
  'select * from f_coa_compliance_summary(''2024-01-01'',''2024-12-31'',''category'');';

grant execute on function f_coa_compliance_summary(date,date,text) to authenticated;
;
