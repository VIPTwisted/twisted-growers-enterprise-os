-- Same ruling, the other two views I added today, and the sweep that repopulates
-- the register. storage_path everywhere; no pre-signed URL survives.
create or replace view v_shipped_full as
with lines as (
  select t.manifest_number, t.package_tag, t.item,
         nullif(t.strain,'')                                   as strain_recorded,
         f_strain_from_item(t.item)                            as strain_from_item,
         t.category, t.shipped_qty, t.shipped_uom, t.shipped_lb,
         t.shipper_wholesale_price, t.destination_facility, t.destination_licence,
         t.status, t.received_on, t.licence as our_licence,
         f_material_origin(t.package_tag)                      as origin
  from metrc_rpt_package_transfers t
)
select
  tr.created_on::date                                          as shipped_on,
  l.manifest_number,
  tr.direction,
  tr.shipper,
  coalesce(tr.recipient, l.destination_facility)               as recipient,
  f_facility_type(l.destination_licence)                       as recipient_type,
  f_is_transporter(l.destination_licence)                      as recipient_is_a_transporter,
  l.package_tag,
  l.item,
  coalesce(l.strain_recorded, l.strain_from_item)              as strain,
  l.category,
  l.shipped_qty,
  l.shipped_uom,
  round(l.shipped_lb, 2)                                       as pounds,
  l.shipper_wholesale_price                                    as value_usd,
  case
    when (l.origin->>'all_ours')::boolean     then 'OURS — we grew it'
    when (l.origin->>'any_outside')::boolean  then 'THIRD PARTY — ' ||
         coalesce(l.origin->'origin_names'->>0, 'origin not named')
    else 'UNRESOLVED — lineage does not say'
  end                                                          as whose_material,
  (l.origin->>'all_ours')::boolean                             as is_ours,
  l.origin->'origin_names'                                     as originator,
  l.origin->'origin_licences'                                  as originator_licences,
  l.origin->>'item_field_says'                                 as item_field_licence,
  l.origin->'inbound_manifests'                                as came_in_on_manifest,
  l.origin->'source_harvests'                                  as source_harvests,
  (l.origin->>'lineage_packages')::int                         as lineage_depth,
  d_coa.storage_path                                           as certificate_link,
  case
    when d_coa.storage_path is not null then 'on file'
    when p.lab_testing_state = 'TestPassed' then 'passed, certificate not yet fetched from Metrc'
    when p.lab_testing_state = 'TestFailed' then 'FAILED testing'
    when p.lab_testing_state is null        then 'no test state recorded'
    else p.lab_testing_state
  end                                                          as certificate_says,
  d_man.storage_path                                           as manifest_link,
  case when d_man.storage_path is not null then 'on file'
       else 'manifest document not yet fetched' end            as manifest_document,
  case
    when l.strain_recorded is not null  then 'recorded on the manifest'
    when l.strain_from_item is not null then 'READ FROM THE ITEM NAME — not recorded'
    else 'not stated anywhere — the item names only a product form'
  end                                                          as strain_source,
  case
    when l.strain_recorded is not null and l.strain_from_item is not null
         and lower(replace(l.strain_recorded,'.','')) <> lower(replace(l.strain_from_item,'.',''))
         and lower(l.strain_recorded) not like '%'||lower(l.strain_from_item)||'%'
         and lower(l.strain_from_item) not like '%'||lower(l.strain_recorded)||'%'
      then 'CONFLICT — the item name says "' || l.strain_from_item || '"'
  end                                                          as strain_conflict
from lines l
left join metrc_transfers tr on tr.manifest_number = l.manifest_number
left join metrc_packages  p  on p.tag = l.package_tag
left join metrc_documents d_coa on d_coa.package_tag = l.package_tag and d_coa.doc_type ilike '%coa%'
left join metrc_documents d_man on d_man.manifest_number = l.manifest_number and d_man.doc_type ilike '%manifest%';

create or replace view v_ownership_misattribution as
with x as (
  select p.tag, p.item_name, p.location, p.license, p.lab_testing_state,
         f_to_pounds(p.quantity, p.uom)                               as lb,
         f_material_origin(p.tag)                                     as g,
         f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')           as platform_says_ours
  from metrc_packages p
  where p.quantity > 0
)
select
  x.tag, x.item_name,
  coalesce(x.location, '(no location recorded)')                      as location,
  x.license, x.lab_testing_state,
  round(x.lb::numeric, 2)                                             as pounds,
  x.platform_says_ours,
  (x.g->>'all_ours')::boolean                                         as lineage_says_ours,
  x.g->'origin_names'                                                 as origins,
  x.g->'inbound_manifests'                                            as arrived_on,
  (x.g->>'lineage_packages')::int                                     as steps_back,
  jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb))    as distinct_origins,
  case
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
         and jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb)) <= 1
      then 'WRONGLY OURS — wholly theirs'
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
      then 'WRONGLY OURS — blended, proportion unknown'
    when (x.g->>'all_ours')::boolean and not x.platform_says_ours
      then 'WRONGLY THEIRS — lineage says we grew it'
    else 'agrees'
  end                                                                 as verdict,
  case
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
         and jsonb_array_length(coalesce(x.g->'origin_licences','[]'::jsonb)) > 1
      then 'Made from ' || jsonb_array_length(x.g->'origin_licences')
           || ' different origins. Nothing records how much came from each, so this cannot be '
           || 'split between our production and theirs. Do not count the whole weight either way.'
    when (x.g->>'any_outside')::boolean and x.platform_says_ours
      then 'Single outside origin — this weight is theirs, not our production.'
    when (x.g->>'all_ours')::boolean and not x.platform_says_ours
      then 'We grew it, but the item definition came from another licence, so it reads as bought in.'
    else null
  end                                                                 as what_is_wrong,
  d_coa.storage_path                                                  as certificate_link,
  case
    when d_coa.storage_path is not null                then 'on file'
    when x.lab_testing_state = 'TestPassed'            then 'passed — certificate not yet fetched from Metrc'
    when x.lab_testing_state = 'TestFailed'            then 'FAILED testing'
    when x.lab_testing_state = 'NotSubmitted'          then 'never submitted for testing'
    when x.lab_testing_state is null                   then 'no test state recorded in Metrc'
    else x.lab_testing_state
  end                                                                 as certificate_says,
  d_man.storage_path                                                  as manifest_link,
  case
    when d_man.storage_path is not null then 'on file'
    when x.g->'inbound_manifests'->>0 is not null
      then 'inbound manifest ' || (x.g->'inbound_manifests'->>0) || ' — document not yet fetched'
    else 'no manifest — packaged here, never transferred in'
  end                                                                 as manifest_says
from x
left join metrc_documents d_coa
       on d_coa.package_tag = x.tag and d_coa.doc_type ilike '%coa%'
left join metrc_documents d_man
       on d_man.manifest_number = (x.g->'inbound_manifests'->>0) and d_man.doc_type ilike '%manifest%';;
