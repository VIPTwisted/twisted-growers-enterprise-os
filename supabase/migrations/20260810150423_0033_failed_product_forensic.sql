-- ---------------------------------------------------------------------------
-- 0033 — FAILED PRODUCT, traced to every source tag, harvest and strain.
--
-- WHY THIS EXISTS, and it is a correction on the record. The 56.84 lb "Failed
-- Flower" package was reported to the owner as "OURS — made here" because
-- ReceivedFromFacilityName is NULL on it. That was READING A PACKAGE ONE LEVEL
-- DEEP -- the exact failure the house rules already name. Exploding its 17 source
-- tags shows 10 of them, 81.54 lb of 129.90 lb, are GREATER GOODS material.
-- The package is 63% third party by input weight.
--
-- A repackaged child NEVER inherits ReceivedFromFacilityName. It carries only a
-- pointer in SourcePackageLabels. Ownership of a consolidated package has to be
-- resolved through the lineage, every time.
--
-- WHAT IT FOUND. Strawberry Glue is 6 of the 17 failed inputs and 52.68 lb -- 41%
-- of everything in that package -- across F2 and F3 and from BOTH Greater Goods
-- and our own grow. A strain problem, not a supplier problem.
-- ---------------------------------------------------------------------------

create or replace view v_failed_product_lineage as
with failed as (
  select p.raw->>'Label'                            as failed_tag,
         p.license                                  as licence,
         p.raw#>>'{Item,Name}'                      as failed_item,
         p.raw#>>'{Item,ProductCategoryName}'       as failed_category,
         nullif(p.raw->>'LocationName','')          as room,
         (p.raw->>'PackagedDate')::date             as failed_packaged_on,
         (current_date - (p.raw->>'PackagedDate')::date) as days_held,
         coalesce((p.raw->>'IsOnHold')::boolean,false)   as on_hold,
         round(f_to_pounds((p.raw->>'Quantity')::numeric,
               coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,2) as remaining_lb,
         nullif(p.raw->>'SourceHarvestNames','')    as source_harvests,
         string_to_array(nullif(p.raw->>'SourcePackageLabels',''), ', ') as src
  from metrc_packages p
  where coalesce((p.raw->>'Quantity')::numeric,0) > 0
    and p.raw->>'LabTestingState' ilike '%fail%'
)
select f.failed_tag, f.licence, f.failed_item, f.failed_category, f.room,
       f.failed_packaged_on, f.days_held, f.on_hold, f.remaining_lb, f.source_harvests,
       btrim(s.src_tag)                                as source_tag,
       sp.raw#>>'{Item,Name}'                          as source_item,
       f_strain_from_item(sp.raw#>>'{Item,Name}')      as source_strain,
       nullif(sp.raw->>'SourceHarvestNames','')        as source_harvest,
       (sp.raw->>'PackagedDate')::date                 as source_packaged_on,
       nullif(sp.raw->>'LocationName','')              as source_room,
       sp.raw->>'LabTestingState'                      as source_lab_state,
       round(f_to_pounds(coalesce((sp.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(sp.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,2) as source_created_lb,
       /* OWNERSHIP RESOLVED THROUGH THE LINEAGE, never from the child alone. */
       case when sp.raw is null then '(source package not in our mirror)'
            when nullif(sp.raw->>'ReceivedFromFacilityLicenseNumber','') is null then 'OURS — made here'
            when f_is_ours(sp.raw->>'ReceivedFromFacilityLicenseNumber')         then 'OURS — our other licence'
            else 'THIRD PARTY — ' || coalesce(nullif(sp.raw->>'ReceivedFromFacilityName',''),'?')
       end                                             as source_ownership,
       coalesce(nullif(sp.raw->>'ReceivedFromFacilityName',''),'—') as source_supplier
from failed f
left join lateral unnest(coalesce(f.src, array[]::text[])) as s(src_tag) on true
left join metrc_packages sp on sp.raw->>'Label' = btrim(s.src_tag);

comment on view v_failed_product_lineage is
  'Every failed package on hand, exploded to its source tags, harvests and strains, '
  'with ownership resolved THROUGH THE LINEAGE. A repackaged child never inherits '
  'ReceivedFromFacilityName, so reading the child alone books third-party material '
  'as our own -- which is exactly what happened with the 56.84 lb Failed Flower '
  'package (63% Greater Goods by input weight).';


-- Which strains actually fail, by input weight rather than by tag count.
create or replace view v_failed_by_strain as
select coalesce(source_strain,'(unknown)')            as strain,
       count(*)                                       as failed_source_tags,
       round(sum(source_created_lb),2)                as failed_lb_in,
       count(distinct failed_tag)                     as consolidated_into,
       count(distinct source_harvest)                 as harvests_affected,
       count(*) filter (where source_ownership like 'THIRD PARTY%')  as third_party_tags,
       count(*) filter (where source_ownership like 'OURS%')         as our_tags,
       round(sum(source_created_lb) filter (where source_ownership like 'THIRD PARTY%'),2) as third_party_lb,
       round(sum(source_created_lb) filter (where source_ownership like 'OURS%'),2)        as our_lb,
       string_agg(distinct source_supplier, ', ')     as suppliers,
       min(source_packaged_on)                        as first_failed,
       max(source_packaged_on)                        as last_failed
from v_failed_product_lineage
where source_tag is not null
group by 1;

comment on view v_failed_by_strain is
  'Which strains fail, weighted by POUNDS IN rather than tag count, split ours vs '
  'third party. Strawberry Glue is 41% of the failed input across both sources -- a '
  'strain problem, not a supplier problem.';

grant select on v_failed_product_lineage, v_failed_by_strain to authenticated;
;
