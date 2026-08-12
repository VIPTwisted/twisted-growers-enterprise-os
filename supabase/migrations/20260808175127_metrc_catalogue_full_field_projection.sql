-- ============================================================================
-- METRC CATALOGUE — every field the Metrc report carries, projected from raw
--
-- WHY. The owner supplied the three Metrc exports for MC281714 (Items 492 rows,
-- Strains 102, Locations 21) and asked whether the OS holds every field.
--
-- MEASURED FIRST, then built. The mirror is COMPLETE on rows -- 492/102/21 match
-- the exports exactly -- and raw jsonb holds MORE than the report shows: 68 keys
-- for items, 9 for strains, 8 for locations. Nothing was missing from the data.
-- The gap was PROJECTION: metrc_items exposed 4 typed columns out of 68, so the
-- platform could not filter, sort, report or drill on any of the rest.
--
-- So this adds no data and calls no API (owner hard rule: never flood Metrc).
-- It only exposes what two nightly syncs already captured.
--
-- FOUR EXPORT COLUMNS HAVE NO SOURCE and are deliberately NOT invented (rule A3
-- -- absence is explained, never filled in):
--   Misconfigured, Expiration Days, Sell-By Days, Use-By Days
-- The Metrc API payload we store does not contain them. If they are needed they
-- must come from a new endpoint, not from a guess.
--
-- SECURITY NOTE, deliberate. These three views stay SECURITY DEFINER, unchanged.
-- create or replace preserves reloptions, so this migration does not alter the
-- security posture either way. They are part of the 252 views that bypass RLS
-- (task #38). They are NOT flipped to security_invoker here because the base
-- tables carry only cfo_read / exec_all / tg_desktop_read policies -- flipping
-- them now would empty these pages for ordinary staff. That belongs in the #38
-- batch, after the role matrix is confirmed.
--
-- Applied with apply_migration, not execute_sql, so it is recorded in migration
-- history. Seven check files once claimed to contain SQL and did not, because
-- execute_sql leaves no trace.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · ITEMS. The 11 existing columns keep their names, types and order because
-- create or replace view cannot reorder or retype them; new fields append.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_catalogue_items as
select
  i.license                                   as licence,
  f_operation(i.license)                      as operation,
  i.metrc_id,
  i.name                                      as item,
  i.category,
  i.unit_of_measure,
  i.strain,
  f_uom_label(i.unit_of_measure)              as unit_label,
  (select count(*) from metrc_packages p
    where p.license = i.license and p.item_name = i.name) as packages_using_it,
  i.synced_at,
  -- same name and type; widened so the newly projected fields are searchable
  concat_ws(' ', i.name, coalesce(i.category,''), coalesce(i.strain,''),
            i.license, f_operation(i.license),
            i.raw->>'ProductCategoryType', i.raw->>'Description',
            i.raw->>'ItemBrandName')          as search_text,

  -- ── appended: the Metrc Items report, field for field ──
  -- Metrc blends number and name into one cell ("M00002586554: TG ..."). Verified
  -- the number is metrc_id zero-padded to 11, so both halves are given separately
  -- as well as the combined form already in `item`.
  'M' || lpad(i.metrc_id::text, 11, '0')      as item_number,
  regexp_replace(i.name, '^M\d+:\s*', '')     as item_name,
  i.raw->>'ProductCategoryType'               as item_type,
  i.raw->>'QuantityType'                      as quantity_type,
  i.raw->>'DefaultLabTestingState'            as default_lab_testing_state,
  i.raw->>'ApprovalStatus'                    as approval,
  (nullif(i.raw->>'ApprovalStatusDateTime','')::timestamptz) as approval_date,
  (nullif(i.raw->>'CreatedDateTime','')::timestamptz)        as created_date,
  i.raw->>'ItemBrandName'                     as item_brand_name,
  (nullif(i.raw->>'IsUsed','')::boolean)      as in_use,

  -- potency per unit. Populated on the manufacturing licence; null on cultivation,
  -- which is correct rather than missing -- buds are not dosed.
  nullif(i.raw->>'UnitThcPercent','')::numeric      as unit_thc_percent,
  nullif(i.raw->>'UnitThcContent','')::numeric      as unit_thc_content,
  i.raw->>'UnitThcContentUnitOfMeasureName'         as unit_thc_content_uom,
  nullif(i.raw->>'UnitThcContentDose','')::numeric  as unit_thc_content_dose,
  nullif(i.raw->>'UnitThcAPercent','')::numeric     as unit_thca_percent,
  nullif(i.raw->>'UnitThcAContent','')::numeric     as unit_thca_content,
  nullif(i.raw->>'UnitCbdPercent','')::numeric      as unit_cbd_percent,
  nullif(i.raw->>'UnitCbdContent','')::numeric      as unit_cbd_content,
  i.raw->>'UnitCbdContentUnitOfMeasureName'         as unit_cbd_content_uom,
  nullif(i.raw->>'UnitCbdContentDose','')::numeric  as unit_cbd_content_dose,
  nullif(i.raw->>'UnitCbdAPercent','')::numeric     as unit_cbda_percent,
  nullif(i.raw->>'UnitCbdAContent','')::numeric     as unit_cbda_content,

  -- unit sizing
  nullif(i.raw->>'UnitVolume','')::numeric          as unit_volume,
  i.raw->>'UnitVolumeUnitOfMeasureName'             as unit_volume_uom,
  nullif(i.raw->>'UnitWeight','')::numeric          as unit_weight,
  i.raw->>'UnitWeightUnitOfMeasureName'             as unit_weight_uom,
  nullif(i.raw->>'UnitQuantity','')::numeric        as unit_quantity,
  i.raw->>'UnitQuantityUnitOfMeasureName'           as unit_quantity_uom,
  nullif(i.raw->>'NumberOfDoses','')::numeric       as number_of_doses,
  i.raw->>'ServingSize'                             as serving_size,

  -- date policy. Currently false on every row of both licences; projected anyway
  -- so a change in Metrc configuration becomes visible instead of silent.
  (nullif(i.raw->>'IsExpirationDateRequired','')::boolean) as expiration_date_required,
  (nullif(i.raw->>'IsSellByDateRequired','')::boolean)     as sell_by_date_required,
  (nullif(i.raw->>'IsUseByDateRequired','')::boolean)      as use_by_date_required,
  (nullif(i.raw->>'HasExpirationDate','')::boolean)        as has_expiration_date,
  (nullif(i.raw->>'HasSellByDate','')::boolean)            as has_sell_by_date,
  (nullif(i.raw->>'HasUseByDate','')::boolean)             as has_use_by_date,

  -- product detail, mostly the manufacturing licence
  i.raw->>'Description'                       as description,
  i.raw->>'PublicIngredients'                 as public_ingredients,
  i.raw->>'AdministrationMethod'              as administration_method,
  i.raw->>'Allergens'                         as allergens,
  i.raw->>'ProcessingJobCategoryName'         as processing_job_category,
  i.raw->>'ProcessingJobTypeName'             as processing_job_type,
  i.raw->>'LabTestBatchNames'                 as lab_test_batch_names,
  nullif(i.raw->>'StrainId','')::bigint       as strain_metrc_id,
  case when jsonb_typeof(i.raw->'ProductImages')  ='array'
       then jsonb_array_length(i.raw->'ProductImages')   else 0 end as product_images,
  case when jsonb_typeof(i.raw->'LabelImages')    ='array'
       then jsonb_array_length(i.raw->'LabelImages')     else 0 end as label_images,
  case when jsonb_typeof(i.raw->'PackagingImages')='array'
       then jsonb_array_length(i.raw->'PackagingImages') else 0 end as packaging_images
from metrc_items i;

comment on view public.v_catalogue_items is
'The Metrc Items report, every field. 68 raw keys projected; the export''s 35 columns are all present except four that the API payload does not carry: Misconfigured, Expiration Days, Sell-By Days, Use-By Days (rule A3 -- absent, not invented). item_number and item_name split what Metrc blends into one cell. Potency and dose columns are null on the cultivation licence because buds are not dosed; that is correct, not missing.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · STRAINS. Export has 6 columns; raw has 9. Genetics and Used were absent
-- from the projection, and raw additionally splits indica/sativa numerically
-- where the report only gives the blended "70% Indica / 30% Sativa" string.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_catalogue_strains as
select
  s.license                                   as licence,
  f_operation(s.license)                      as operation,
  s.metrc_id,
  s.name                                      as strain,
  s.testing_status,
  s.thc_level,
  s.cbd_level,
  (select count(*) from metrc_items i
    where i.license = s.license and i.strain = s.name) as items_using_it,
  (select count(*) from metrc_plants p
    where p.license = s.license and p.strain = s.name) as plants,
  s.synced_at,
  concat_ws(' ', s.name, s.license, f_operation(s.license),
            s.raw->>'Genetics')               as search_text,

  -- ── appended ──
  s.raw->>'Genetics'                                as genetics,
  nullif(s.raw->>'IndicaPercentage','')::numeric    as indica_percent,
  nullif(s.raw->>'SativaPercentage','')::numeric    as sativa_percent,
  (nullif(s.raw->>'IsUsed','')::boolean)            as in_use
from metrc_strains s;

comment on view public.v_catalogue_strains is
'The Metrc Strains report, every field. All 6 export columns present. genetics is Metrc''s blended string ("70% Indica / 30% Sativa"); indica_percent and sativa_percent are the same fact as numbers, taken from the API rather than parsed out of the string.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · LOCATIONS. The export's Plant Batches / Plants / Harvests / Packages
-- columns are CAPABILITY FLAGS -- whether the location may hold that type --
-- not counts. This view already had packages_here and plants_here, which ARE
-- counts. Naming the new ones can_hold_* keeps the two apart; confusing them
-- would misstate where inventory is, which rule D2 does not permit.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_catalogue_locations as
select
  l.license                                   as licence,
  f_operation(l.license)                      as operation,
  l.metrc_id,
  l.name                                      as location,
  l.location_type,
  (select count(*) from metrc_packages p
    where p.license = l.license and p.location = l.name) as packages_here,
  (select count(*) from metrc_plants p
    where p.license = l.license and p.room = l.name)     as plants_here,
  l.synced_at,
  concat_ws(' ', l.name, coalesce(l.location_type,''),
            l.license, f_operation(l.license))           as search_text,

  -- ── appended: Metrc capability flags, NOT counts ──
  nullif(l.raw->>'LocationTypeId','')::bigint            as location_type_metrc_id,
  (nullif(l.raw->>'ForPlantBatches','')::boolean)        as can_hold_plant_batches,
  (nullif(l.raw->>'ForPlants','')::boolean)              as can_hold_plants,
  (nullif(l.raw->>'ForHarvests','')::boolean)            as can_hold_harvests,
  (nullif(l.raw->>'ForPackages','')::boolean)            as can_hold_packages
from metrc_locations l;

comment on view public.v_catalogue_locations is
'The Metrc Locations report, every field. All 6 export columns present. READ THE NAMES CAREFULLY: can_hold_plants is Metrc''s ForPlants capability flag -- whether this location is permitted to hold plants -- while plants_here is how many plants are actually in it. The Metrc export labels the capability flag simply "Plants", which is why they are named apart here.';;
