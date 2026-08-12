-- THE INVENTORY REPORT. One wide, filterable fact row per package - the QuickBooks
-- shape: filter on any dimension, group on any dimension, and every quantity is
-- honest about its basis.
--
-- Built to survive every trap that has cost money on this platform:
--   tag duplication  - distinct on (tag); metrc_packages is NOT unique on tag (7 dupes)
--   countable items  - units AND pounds are separate columns, never one; a counted
--                      item can never publish as nothing (18,822 units were)
--   wet vs dry       - pounds_wet, pounds_dry and pounds_dry_equivalent are three
--                      DIFFERENT columns. Fresh frozen is WET. Summing pounds across
--                      streams overstates - the live dashboard does it by 469.7 lb
--   ownership        - from custody and lineage, NEVER from ItemFromFacilityLicenseNumber,
--                      which names who defined the ITEM and flips on any repack
--   documents        - certificate and manifest resolved through lineage and the lab pairing
--   value            - our cost applies to OUR material only. material_purchases is
--                      EMPTY, so what was paid for bought-in stock exists nowhere and
--                      any value on it would be invented
--
-- UNDO: drop view v_inventory_report.

create or replace view public.v_inventory_report as
with p as (
  select distinct on (tag) tag, item_name, license, uom, quantity, source_state,
         lab_testing_state, packaged_on, raw
  from metrc_packages order by tag, license
),
ff as (select f_rule('fresh_frozen_wet_to_dry') as ratio)
select
  -- IDENTITY
  p.tag                                             as package_tag,
  p.item_name,
  p.raw#>>'{Item,StrainName}'                       as strain,
  p.raw#>>'{Item,ProductCategoryName}'              as category,
  case
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%' then 'Fresh frozen'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%bud%'          then 'Dried flower'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%shake%'
      or p.raw#>>'{Item,ProductCategoryName}' ilike '%trim%'         then 'Shake and trim'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%concentrate%'  then 'Concentrate'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%pre-roll%'
      or p.raw#>>'{Item,ProductCategoryName}' ilike '%preroll%'      then 'Pre-rolls'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%edible%'       then 'Edibles'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%vape%'         then 'Vapes'
    when p.raw#>>'{Item,ProductCategoryName}' ilike '%seed%'         then 'Seeds'
    else coalesce(p.raw#>>'{Item,ProductCategoryName}','Other')
  end                                               as stream,
  -- WHERE
  p.raw->>'LocationName'                            as room,
  nullif(p.raw->>'SublocationName','')              as sublocation,
  p.license                                         as licence,
  -- STATE
  p.source_state                                    as status,
  p.lab_testing_state                               as lab_state,
  (p.raw->>'IsOnHold')::boolean                     as on_hold,
  (p.raw->>'IsFinished')::boolean                   as finished,
  -- QUANTITY. Weight and count are DIFFERENT UNITS. Never add them.
  f_is_weight(p.uom)                                as is_weighed,
  p.uom                                             as unit_of_measure,
  case when f_is_weight(p.uom) then round(f_to_pounds(p.quantity,p.uom),3) end as pounds,
  case when not f_is_weight(p.uom) then p.quantity end                        as units,
  f_quantity_text(p.quantity, p.uom)                as quantity_shown,
  -- BASIS. Fresh frozen is WET. These three are not interchangeable.
  case when f_is_weight(p.uom)
        and p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%'
       then 'wet' when f_is_weight(p.uom) then 'dry' end                       as weight_basis,
  case when f_is_weight(p.uom)
        and p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%'
       then round(f_to_pounds(p.quantity,p.uom),3) end                         as pounds_wet,
  case when f_is_weight(p.uom)
        and p.raw#>>'{Item,ProductCategoryName}' not ilike '%fresh frozen%'
       then round(f_to_pounds(p.quantity,p.uom),3) end                         as pounds_dry,
  case when f_is_weight(p.uom) then
    round(case when p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%'
               then f_to_pounds(p.quantity,p.uom) / (select ratio from ff)
               else f_to_pounds(p.quantity,p.uom) end, 3) end                  as pounds_dry_equivalent,
  -- AGE
  p.packaged_on,
  current_date - p.packaged_on                      as days_held,
  case when current_date - p.packaged_on > 365 then 'over a year'
       when current_date - p.packaged_on > 180 then '180-365 days'
       when current_date - p.packaged_on >  90 then '90-180 days'
       when current_date - p.packaged_on >  30 then '30-90 days'
       else 'under 30 days' end                     as age_band,
  (current_date - p.packaged_on) > 180              as past_age_limit,
  -- OWNERSHIP. From custody, never from the item field.
  p.raw->>'ItemFromFacilityLicenseNumber'           as item_defined_by,
  p.raw->>'ItemFromFacilityName'                    as item_defined_by_name,
  oc.custody_says                                   as custody_origin_licences,
  coalesce(oc.custody_verdict, 'not assessed - only active packages are judged') as ownership,
  cr.cert_client                                    as certificate_client,
  cr.cert_license                                   as certificate_licence,
  -- PROVENANCE
  nullif(p.raw->>'SourceHarvestNames','')           as from_harvest,
  (p.raw->>'SourcePackageCount')::int               as made_from_n_packages,
  ((p.raw->>'SourcePackageCount')::int = 0)         as is_primary_production,
  nullif(p.raw->>'ReceivedFromManifestNumber','')   as arrived_on_manifest,
  nullif(p.raw->>'ReceivedFromFacilityName','')     as received_from,
  -- DOCUMENTS
  (cr.package_tag is not null)                      as has_certificate,
  cr.certificate_link                               as certificate_basis,
  (select count(distinct l.manifest_number) from v_document_package_link l
    where l.package_tag = p.tag and l.doc_type='manifest')                     as manifests_held,
  case when cr.package_tag is not null
        and exists (select 1 from v_document_package_link l
                     where l.package_tag = p.tag and l.doc_type='manifest')
       then 'COMPLETE - certificate and manifest'
       when cr.package_tag is not null    then 'certificate only'
       when exists (select 1 from v_document_package_link l
                     where l.package_tag = p.tag and l.doc_type='manifest')
                                          then 'manifest only'
       else 'NEITHER' end                           as document_status,
  -- VALUE. Ours only. material_purchases is EMPTY - what was paid for bought-in
  -- material exists nowhere, so a value on it would be invented.
  case when f_is_weight(p.uom) and f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
       then round(case when p.raw#>>'{Item,ProductCategoryName}' ilike '%fresh frozen%'
                       then f_to_pounds(p.quantity,p.uom) / (select ratio from ff)
                       else f_to_pounds(p.quantity,p.uom) end
                  * (select cm.cost_per_pound from cost_model cm
                      where cm.scope='cultivation' order by cm.effective_from desc limit 1), 0)
  end                                               as value_at_our_cost,
  case when not f_is_weight(p.uom) then 'countable - no weight, no cost per pound'
       when not f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')
       then 'bought in - material_purchases is EMPTY, what was paid exists nowhere'
       else 'our cultivation cost per pound, dry-equivalent basis' end          as cost_basis
from p
left join v_ownership_by_custody oc on oc.package_tag = p.tag
left join v_certificate_resolved  cr on cr.package_tag = p.tag;

comment on view public.v_inventory_report is
  'THE inventory report. One row per package, every dimension filterable: room, '
  'sublocation, licence, stream, category, strain, status, lab state, age band, '
  'ownership, document status, primary-vs-repack. '
  'NEVER sum the pounds column across streams - fresh frozen is WET. Use '
  'pounds_dry_equivalent for a single comparable total, or group by weight_basis. '
  'units and pounds are separate because a counted item has no weight but always '
  'has a quantity. Ownership comes from CUSTODY, never from item_defined_by.';;
