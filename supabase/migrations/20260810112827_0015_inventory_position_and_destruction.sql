-- ---------------------------------------------------------------------------
-- 0015 — The canonical inventory position, and the destruction ledger.
--
--   v_inventory_position_by_room  -- WHERE things are. Packages only, because a
--       package is the only object whose location moves. Harvest DryingLocationName
--       is a label on the harvest and stays put; treating it as a location is how
--       12,804 lb appeared to sit in the Fulfillment Vault and 8,462 lb in the
--       Cure Vault, which holds ZERO packages (85 rows, all finished, 0 lb).
--
--   v_held_unpackaged_flower      -- real product not yet in a package. OPEN
--       harvests only: a finished harvest declares nothing more comes off it, so
--       its residual can only be water plus unrecorded loss.
--
--   v_destruction_ledger          -- every channel by which mass legitimately left.
-- ---------------------------------------------------------------------------

create or replace view v_inventory_position_by_room as
select p.license                                                          as licence,
       coalesce(nullif(btrim(p.raw->>'LocationName'),''),'(no room)')     as room,
       r.role, r.stage, r.is_drying,
       (r.confirmed_by is not null)                                       as room_role_confirmed,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       count(*)                                                           as tags,
       round(sum(f_to_pounds((p.raw->>'Quantity')::numeric,
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))
             filter (where f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))::numeric,1) as lb,
       sum((p.raw->>'Quantity')::numeric)
             filter (where not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))) as units,
       count(*) filter (where p.raw->>'LabTestingState' = 'TestPassed')   as lab_passed,
       count(*) filter (where nullif(p.raw->>'SourceHarvestNames','') is not null) as tags_naming_a_harvest,
       count(*) filter (where nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','') is not null
                          and not f_is_ours(p.raw->>'ReceivedFromFacilityLicenseNumber')) as tags_bought_in,
       min((p.raw->>'PackagedDate')::date)                                as oldest_tag,
       max((p.raw->>'PackagedDate')::date)                                as newest_tag
from metrc_packages p
left join room_roles r on r.room_name = nullif(btrim(p.raw->>'LocationName'),'')
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false
group by 1,2,3,4,5,6,7;

comment on view v_inventory_position_by_room is
  'ON HAND, by room and category, from PACKAGES only. Packages carry a location '
  'that moves; harvest drying-location does not. Cure Vault correctly shows nothing.';

create or replace view v_held_unpackaged_flower as
select drying_room                              as room,
       count(*)                                 as open_harvests,
       round(sum(wet_lb),1)                     as wet_lb,
       round(sum(packaged_lb),1)                as packaged_off_lb,
       round(sum(old_figure_wet_minus_dry),1)   as metrc_residual_lb,
       round(sum(really_left_lb),1)             as really_held_lb,
       round(sum(old_figure_wet_minus_dry) - sum(really_left_lb),1) as water_not_product_lb,
       max(days_open)                           as longest_open_days
from v_harvest_still_in_room
group by 1;

comment on view v_held_unpackaged_flower is
  'Dried flower that is real but not yet packaged. OPEN harvests only, corrected '
  'by the company moisture rule. Metrc residual overstates it roughly 5x.';

create or replace view v_destruction_ledger as
select 'Harvest waste'::text                as channel,
       h.license                            as licence,
       (h.raw->>'HarvestStartDate')::date   as occurred_on,
       h.raw->>'Name'                       as reference,
       'Waste recorded when the plants were cut'::text as reason,
       f_to_pounds((h.raw->>'TotalWasteWeight')::numeric,'Grams') as lb
from metrc_harvests h
where coalesce((h.raw->>'TotalWasteWeight')::numeric,0) > 0
union all
select 'Package adjustment', a.licence, a.adjusted_on, a.package_tag,
       coalesce(nullif(a.reason,''),'(no reason given)'),
       abs(f_to_pounds(a.quantity, a.uom))
from metrc_rpt_adjustments a where a.quantity < 0
union all
select 'Plant waste', w.licence, w.waste_date, coalesce(w.plant_batch, w.waste_number),
       coalesce(nullif(w.reason,''),'(no reason given)'),
       f_to_pounds(w.waste_qty, w.uom)
from metrc_rpt_plant_waste w;

comment on view v_destruction_ledger is
  'Every channel by which mass legitimately left the count, one row per event. '
  'Plants destroyed are counted separately -- a plant count, not pounds; adding '
  'them to a weight total would be a unit error.';

grant select on v_inventory_position_by_room, v_held_unpackaged_flower,
                v_destruction_ledger to authenticated;
;
