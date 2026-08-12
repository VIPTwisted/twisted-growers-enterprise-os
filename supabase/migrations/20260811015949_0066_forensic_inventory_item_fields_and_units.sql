-- ---------------------------------------------------------------------------
-- 0066 — Same defect in v_forensic_inventory: item fields read from the wrong
-- level, so category / strain / product_line were empty on every row. `units` is
-- APPENDED (CREATE OR REPLACE cannot reorder columns) so vapes, edibles and seeds
-- stop being invisible in a pounds-only report.
-- ---------------------------------------------------------------------------
create or replace view v_forensic_inventory as
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
       null::text                                 as sold_to,
       0::numeric                                 as units
from metrc_plants pl
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(pl.room))

union all
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
       coalesce(nullif(p.raw->'Item'->>'ProductCategoryName',''),'(uncategorised)'),
       f_product_line(p.raw->'Item'->>'Name', p.raw->'Item'->>'ProductCategoryName', null),
       coalesce(nullif(p.raw->'Item'->>'StrainName',''), f_strain_from_item(p.raw->'Item'->>'Name')),
       f_is_ours(coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''), p.license)),
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(unknown)'),
       0,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')) else 0 end,
       (p.raw->>'PackagedDate')::date, null, null,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then 0 else coalesce((p.raw->>'Quantity')::numeric,0) end
from metrc_packages p
left join room_roles rr on upper(btrim(rr.room_name)) = upper(btrim(p.raw->>'LocationName'))
where not coalesce((p.raw->>'IsFinished')::boolean,false)
  and coalesce((p.raw->>'Quantity')::numeric,0) > 0

union all
select 'SOLD', 'SOLD - SHIPPED OUT', x.package_tag, 'PACKAGE',
       '(shipped)', 'shipped', x.origin_licence,
       coalesce(x.category,'(uncategorised)'),
       f_product_line(x.item, x.category, null), x.strain,
       true, 'Twisted Growers LLC', 0, coalesce(x.pounds,0),
       x.received_on, x.manifest_number, x.dest_facility, 0
from v_transfer_line x
where x.direction = 'OUTBOUND' and x.voided <> 'True';

comment on view v_forensic_inventory is
  'One row per tag across every state: live plants, packages on hand, material sold '
  'out. POUNDS and UNITS are separate measures and must never be summed: vapes, '
  'edibles and seeds are sold by the each and Item.UnitWeight is NULL on all of '
  'them, so they have no defensible pound equivalent.';

update report_registry
   set measures = array['pounds','plant_count','units']
 where report_key = 'inventory.forensic_position';
update report_registry
   set measures = array['plant_count','wet_lb','packaged_lb','units']
 where report_key = 'inventory.room_census';
;
