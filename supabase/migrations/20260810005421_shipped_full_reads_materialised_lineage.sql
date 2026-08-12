-- v_shipped_full called f_material_origin once per manifest line — 19,256 calls
-- for 4,252 distinct packages — and TIMED OUT AT TWO MINUTES when its columns
-- were actually produced. Read the resolved lineage instead.
create or replace view v_shipped_full as
with lines as (
  select t.manifest_number, t.package_tag, t.item,
         nullif(t.strain,'')                    as strain_recorded,
         f_strain_from_item(t.item)             as strain_from_item,
         t.category, t.shipped_qty, t.shipped_uom, t.shipped_lb,
         t.shipper_wholesale_price, t.destination_facility, t.destination_licence,
         t.status, t.received_on, t.licence as our_licence,
         o.origin
  from metrc_rpt_package_transfers t
  left join mv_package_origin o on o.tag = t.package_tag
)
select
  tr.created_on::date                                          as shipped_on,
  l.manifest_number, tr.direction, tr.shipper,
  coalesce(tr.recipient, l.destination_facility)               as recipient,
  f_facility_type(l.destination_licence)                       as recipient_type,
  f_is_transporter(l.destination_licence)                      as recipient_is_a_transporter,
  l.package_tag, l.item,
  coalesce(l.strain_recorded, l.strain_from_item)              as strain,
  l.category, l.shipped_qty, l.shipped_uom,
  round(l.shipped_lb, 2)                                       as pounds,
  l.shipper_wholesale_price                                    as value_usd,
  case
    when (l.origin->>'all_ours')::boolean     then 'OURS — we grew it'
    when (l.origin->>'any_outside')::boolean  then 'THIRD PARTY — ' ||
         coalesce(l.origin->'origin_names'->>0, 'origin not named')
    when l.origin is null                     then 'NOT IN THE PACKAGE MIRROR — lineage unknown'
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
left join metrc_documents d_man on d_man.manifest_number = l.manifest_number and d_man.doc_type ilike '%manifest%';;
