-- ---------------------------------------------------------------------------
-- 0053 — TAG-LEVEL inventory with every filter dimension. One row per tag so the
-- UI can filter, group and drill to a single tag without a second query.
-- ---------------------------------------------------------------------------
create or replace view v_forensic_inventory as
-- LIVE PLANTS (counts, never pounds -- a growing plant has no packaged weight)
select 'NOT FINISHED'::text                       as stage_group,
       case when pl.phase = 'Flowering' then 'GROWING - FLOWERING'
            when pl.room ilike '%mother%'  then 'GROWING - MOTHER STOCK'
            else 'GROWING - ' || upper(coalesce(pl.phase,'UNKNOWN')) end as stage,
       pl.tag                                     as tag,
       'PLANT'::text                              as unit_type,
       coalesce(nullif(pl.room,''),'(NO ROOM RECORDED)') as room,
       coalesce(rr.role,'unmapped')               as room_role,
       pl.license                                 as licence,
       'Live plant'::text                         as category,
       null::text                                 as product_line,
       pl.strain                                  as strain,
       true                                       as is_ours,
       'Twisted Growers LLC'::text                as grown_or_processed_by,
       1::numeric                                 as plant_count,
       0::numeric                                 as pounds,
       pl.planted_on                              as dated_on,
       null::text                                 as manifest_number,
       null::text                                 as sold_to
from metrc_plants pl
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(pl.room))

union all
-- PACKAGES ON HAND
select case when coalesce(rr.role,'') in ('Drying','Dried, awaiting trim') then 'NOT FINISHED'
            else 'FINISHED' end,
       case coalesce(rr.role,'unmapped')
         when 'Drying'                    then 'DRYING'
         when 'Dried, awaiting trim'      then 'DRIED - AWAITING TRIM'
         when 'Curing / bulk storage'     then 'DRIED BULK FLOWER'
         when 'Bulk flower and outbound'  then 'DRIED BULK FLOWER'
         when 'Staged for packaging'      then 'READY FOR PACKAGING'
         when 'Finished goods'            then 'FINISHED GOODS - PACKAGED'
         when 'Fresh frozen and biomass'  then 'FRESH FROZEN / BIOMASS'
         when 'Extraction — hydrocarbon'  then 'IN MANUFACTURING'
         when 'Extraction — solventless'  then 'IN MANUFACTURING'
         when 'Production / infusion'     then 'IN MANUFACTURING'
         when 'Biomass preparation'       then 'IN MANUFACTURING'
         when 'Quarantine hold'           then 'QUARANTINE'
         when 'In transit'                then 'IN TRANSIT'
         else 'OTHER STORAGE' end,
       p.raw->>'Label', 'PACKAGE',
       coalesce(nullif(p.raw->>'LocationName',''),'(NO ROOM RECORDED)'),
       coalesce(rr.role,'unmapped'), p.license,
       coalesce(nullif(p.raw->>'ProductCategoryName',''),'(uncategorised)'),
       f_product_line(p.raw->>'ProductName', p.raw->>'ProductCategoryName', null),
       f_strain_from_item(p.raw->>'ProductName'),
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)),
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)'),
       0,
       f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')),
       (p.raw->>'PackagedDate')::date, null, null
from metrc_packages p
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0

union all
-- SOLD / SHIPPED OUT (no longer on hand, but must be filterable in the same pull)
select 'SOLD', 'SOLD - SHIPPED OUT', x.package_tag, 'PACKAGE',
       '(shipped)', 'shipped', x.origin_licence,
       coalesce(x.category,'(uncategorised)'),
       f_product_line(x.item, x.category, null), x.strain,
       true, 'Twisted Growers LLC', 0, x.pounds,
       x.received_on, x.manifest_number, x.dest_facility
from v_transfer_line x
where x.direction = 'OUTBOUND' and x.voided <> 'True' and x.pounds is not null;

comment on view v_forensic_inventory is
  'One row per tag across every state: live plants, packages on hand, and material '
  'sold out. stage_group splits NOT FINISHED (growing, drying) from FINISHED (dried '
  'bulk, ready for packaging, packaged finished goods) and SOLD. Plants are counted, '
  'never weighed -- plant_count and pounds are separate columns so the two can never '
  'be summed together by accident.';

grant select on v_forensic_inventory to authenticated;
;
