-- ---------------------------------------------------------------------------
-- 0048 — Classify every package event the way an accountant reads a schedule.
-- Mass we GREW is separated from mass merely RE-PACKAGED, because only the first
-- is new inventory. (f_product_line takes three arguments, not two.)
-- ---------------------------------------------------------------------------
create or replace view v_package_event_class as
select e.*,
       case
         when e.event = 'CREATED' and nullif(p.raw->>'SourcePackageLabels','') is not null
              then 'CREATED_FROM_PACKAGE'
         when e.event = 'CREATED' and nullif(p.raw->>'SourceHarvestNames','') is not null
              then 'PRODUCED_FROM_HARVEST'
         when e.event = 'CREATED' then 'CREATED_NO_SOURCE'
         else e.event
       end                                          as event_class,
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), e.licence)) as is_ours,
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)')  as origin_company,
       coalesce(nullif(p.raw->>'ProductCategoryName',''),'(uncategorised)') as category,
       f_strain_from_item(p.raw->>'ProductName')     as strain,
       f_product_line(p.raw->>'ProductName', p.raw->>'ProductCategoryName', null) as product_line,
       coalesce((p.raw->>'IsFinished')::boolean,false) as pkg_finished,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)') as current_room
from v_package_events e
left join metrc_packages p on p.raw->>'Label' = e.package_tag;

comment on view v_package_event_class is
  'v_package_events plus accountant classification. PRODUCED_FROM_HARVEST is new '
  'mass we grew; CREATED_FROM_PACKAGE is a conversion output and is NOT new mass -- '
  'netting it against CONSUMED INTO CHILD yields manufacturing process loss. '
  'is_ours distinguishes our own material from third-party purchased.';

grant select on v_package_event_class to authenticated;
;
