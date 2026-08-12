-- ---------------------------------------------------------------------------
-- 0065 — DEFECT I SHIPPED: item fields are nested under raw->'Item', not top level.
--
-- Every forensic view read raw->>'ProductName' and raw->>'ProductCategoryName'.
-- Neither key exists. The real keys are raw->'Item'->>'Name' and
-- raw->'Item'->>'ProductCategoryName'. Consequence: category, strain and
-- product_line came back NULL or '(uncategorised)' on EVERY row of every report
-- registered in 0059, so those filters silently returned nothing. Same class of
-- fault as the phantom destroyed_on column: an always-null field answers, it does
-- not error.
--
-- raw->'Item'->>'StrainName' also carries the strain DIRECTLY, so f_strain_from_item
-- (which parses it out of the item name) is now only a fallback.
--
-- UNITS are added as a first-class measure. 23,950 units of vapes, edibles and seeds
-- were invisible in a pounds-only report. They are NOT convertible to pounds:
-- Item.UnitWeight is NULL on all 223 of those packages, and a vape is sold by the
-- each. Units and pounds stay in separate columns and are never added together.
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
       coalesce(nullif(p.raw->'Item'->>'ProductCategoryName',''),'(uncategorised)') as category,
       coalesce(nullif(p.raw->'Item'->>'StrainName',''),
                f_strain_from_item(p.raw->'Item'->>'Name'))              as strain,
       f_product_line(p.raw->'Item'->>'Name',
                      p.raw->'Item'->>'ProductCategoryName', null)       as product_line,
       coalesce((p.raw->>'IsFinished')::boolean,false)                   as pkg_finished,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)')           as current_room
from v_package_events e
left join metrc_packages p on p.raw->>'Label' = e.package_tag;

create or replace view v_forensic_onhand_by_location as
select coalesce(nullif(p.raw->>'LocationName',''),'(NO ROOM RECORDED)') as room,
       coalesce(r.role,'unmapped')                                       as room_role,
       p.license                                                          as licence,
       coalesce(nullif(p.raw->'Item'->>'ProductCategoryName',''),'(uncategorised)') as category,
       f_product_line(p.raw->'Item'->>'Name', p.raw->'Item'->>'ProductCategoryName', null) as product_line,
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)) as is_ours,
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)')    as grown_or_processed_by,
       count(*)                                                          as packages,
       round(sum(case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
                 then f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
                      coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')) else 0 end)::numeric,3) as pounds
from metrc_packages p
left join room_roles r on upper(btrim(r.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0
group by 1,2,3,4,5,6,7;

create or replace view v_forensic_room_census as
select 'GROWING'::text                                   as stage,
       coalesce(nullif(pl.room,''),'(NO ROOM RECORDED)')  as room,
       coalesce(rr.role,'unmapped')                       as room_role,
       pl.license                                         as licence,
       pl.phase                                           as detail,
       pl.strain                                          as strain,
       count(*)::numeric                                  as plant_count,
       0::numeric                                         as wet_lb,
       0::numeric                                         as packaged_lb,
       true                                               as is_ours,
       'Twisted Growers LLC'::text                        as grown_or_processed_by,
       0::numeric                                         as units
from metrc_plants pl
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(pl.room))
group by 1,2,3,4,5,6
union all
select 'DRYING / CURING',
       coalesce(nullif(hm.room,''),'(NO ROOM RECORDED)'),
       coalesce(rr.role,'unmapped'), hm.licence,
       'Harvest ' || hm.harvest_batch, hm.strain,
       coalesce(sum(hm.plants),0)::numeric, coalesce(sum(hm.wet_lb),0)::numeric, 0,
       true, 'Twisted Growers LLC', 0
from metrc_rpt_harvest_moisture hm
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(hm.room))
where hm.finished_on is null
group by 1,2,3,4,5,6
union all
select 'PACKAGED',
       coalesce(nullif(p.raw->>'LocationName',''),'(NO ROOM RECORDED)'),
       coalesce(rr.role,'unmapped'), p.license,
       coalesce(nullif(p.raw->'Item'->>'ProductCategoryName',''),'(uncategorised)'),
       coalesce(nullif(p.raw->'Item'->>'StrainName',''), f_strain_from_item(p.raw->'Item'->>'Name')),
       0, 0,
       sum(case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
           then f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
                coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')) else 0 end),
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)),
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)'),
       sum(case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
           then 0 else coalesce((p.raw->>'Quantity')::numeric,0) end)
from metrc_packages p
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0
group by 1,2,3,4,5,6,10,11;

comment on view v_forensic_room_census is
  'Every room and every form of inventory as at the pull: live plants (counts), '
  'drying harvests (WET lb), packages (current lb) and unit-denominated finished '
  'goods (UNITS). Four measures, never summed together -- a wet pound, a cured '
  'pound, a plant and a vape cartridge are different things.';
;
