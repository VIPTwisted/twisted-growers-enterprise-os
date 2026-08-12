-- Metrc returns '' rather than null for unset text. Projected raw, that made
-- count(description) report 492 of 492 "populated" when only 2 items carry one.
-- A column that looks complete and is 490 blanks misstates the record, so every
-- free-text projection is wrapped in nullif(...,''). Empty now reads as empty.
-- Enumerated fields (approval, quantity_type, item_type, lab state) are left
-- bare -- they are never blank, and nullif on them would only add noise.

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
  concat_ws(' ', i.name, coalesce(i.category,''), coalesce(i.strain,''),
            i.license, f_operation(i.license),
            i.raw->>'ProductCategoryType', nullif(i.raw->>'Description',''),
            nullif(i.raw->>'ItemBrandName','')) as search_text,

  'M' || lpad(i.metrc_id::text, 11, '0')      as item_number,
  regexp_replace(i.name, '^M\d+:\s*', '')     as item_name,
  i.raw->>'ProductCategoryType'               as item_type,
  i.raw->>'QuantityType'                      as quantity_type,
  i.raw->>'DefaultLabTestingState'            as default_lab_testing_state,
  i.raw->>'ApprovalStatus'                    as approval,
  (nullif(i.raw->>'ApprovalStatusDateTime','')::timestamptz) as approval_date,
  (nullif(i.raw->>'CreatedDateTime','')::timestamptz)        as created_date,
  nullif(i.raw->>'ItemBrandName','')          as item_brand_name,
  (nullif(i.raw->>'IsUsed','')::boolean)      as in_use,

  nullif(i.raw->>'UnitThcPercent','')::numeric      as unit_thc_percent,
  nullif(i.raw->>'UnitThcContent','')::numeric      as unit_thc_content,
  nullif(i.raw->>'UnitThcContentUnitOfMeasureName','') as unit_thc_content_uom,
  nullif(i.raw->>'UnitThcContentDose','')::numeric  as unit_thc_content_dose,
  nullif(i.raw->>'UnitThcAPercent','')::numeric     as unit_thca_percent,
  nullif(i.raw->>'UnitThcAContent','')::numeric     as unit_thca_content,
  nullif(i.raw->>'UnitCbdPercent','')::numeric      as unit_cbd_percent,
  nullif(i.raw->>'UnitCbdContent','')::numeric      as unit_cbd_content,
  nullif(i.raw->>'UnitCbdContentUnitOfMeasureName','') as unit_cbd_content_uom,
  nullif(i.raw->>'UnitCbdContentDose','')::numeric  as unit_cbd_content_dose,
  nullif(i.raw->>'UnitCbdAPercent','')::numeric     as unit_cbda_percent,
  nullif(i.raw->>'UnitCbdAContent','')::numeric     as unit_cbda_content,

  nullif(i.raw->>'UnitVolume','')::numeric          as unit_volume,
  nullif(i.raw->>'UnitVolumeUnitOfMeasureName','')  as unit_volume_uom,
  nullif(i.raw->>'UnitWeight','')::numeric          as unit_weight,
  nullif(i.raw->>'UnitWeightUnitOfMeasureName','')  as unit_weight_uom,
  nullif(i.raw->>'UnitQuantity','')::numeric        as unit_quantity,
  nullif(i.raw->>'UnitQuantityUnitOfMeasureName','') as unit_quantity_uom,
  nullif(i.raw->>'NumberOfDoses','')::numeric       as number_of_doses,
  nullif(i.raw->>'ServingSize','')                  as serving_size,

  (nullif(i.raw->>'IsExpirationDateRequired','')::boolean) as expiration_date_required,
  (nullif(i.raw->>'IsSellByDateRequired','')::boolean)     as sell_by_date_required,
  (nullif(i.raw->>'IsUseByDateRequired','')::boolean)      as use_by_date_required,
  (nullif(i.raw->>'HasExpirationDate','')::boolean)        as has_expiration_date,
  (nullif(i.raw->>'HasSellByDate','')::boolean)            as has_sell_by_date,
  (nullif(i.raw->>'HasUseByDate','')::boolean)             as has_use_by_date,

  nullif(i.raw->>'Description','')            as description,
  nullif(i.raw->>'PublicIngredients','')      as public_ingredients,
  nullif(i.raw->>'AdministrationMethod','')   as administration_method,
  nullif(i.raw->>'Allergens','')              as allergens,
  nullif(i.raw->>'ProcessingJobCategoryName','') as processing_job_category,
  nullif(i.raw->>'ProcessingJobTypeName','')  as processing_job_type,
  nullif(i.raw->>'LabTestBatchNames','')      as lab_test_batch_names,
  nullif(i.raw->>'StrainId','')::bigint       as strain_metrc_id,
  case when jsonb_typeof(i.raw->'ProductImages')  ='array'
       then jsonb_array_length(i.raw->'ProductImages')   else 0 end as product_images,
  case when jsonb_typeof(i.raw->'LabelImages')    ='array'
       then jsonb_array_length(i.raw->'LabelImages')     else 0 end as label_images,
  case when jsonb_typeof(i.raw->'PackagingImages')='array'
       then jsonb_array_length(i.raw->'PackagingImages') else 0 end as packaging_images
from metrc_items i;

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
            nullif(s.raw->>'Genetics','')) as search_text,
  nullif(s.raw->>'Genetics','')                     as genetics,
  nullif(s.raw->>'IndicaPercentage','')::numeric    as indica_percent,
  nullif(s.raw->>'SativaPercentage','')::numeric    as sativa_percent,
  (nullif(s.raw->>'IsUsed','')::boolean)            as in_use
from metrc_strains s;;
