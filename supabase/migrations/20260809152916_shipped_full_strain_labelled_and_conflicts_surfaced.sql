-- The strain on a shipment line now says WHERE IT CAME FROM, always.
-- 11,036 of 19,256 lines (57%) have a blank strain column. f_strain_from_item
-- reads the item text and scores 84.1% exact against the 8,220 lines whose
-- answer is already known. Good enough to SHOW, nowhere near good enough to
-- present as the record, so every row states which it is.
--
-- E1 / CREATE OR REPLACE: Postgres will not reorder or rename a view's columns,
-- so the two new ones are APPENDED. That refusal is the guard rail that stops a
-- tidy-up silently changing what a caller reads.
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
  d_coa.download_url                                           as certificate_link,
  case
    when d_coa.storage_path is not null then 'on file'
    when p.lab_testing_state = 'TestPassed' then 'passed, certificate not yet fetched from Metrc'
    when p.lab_testing_state = 'TestFailed' then 'FAILED testing'
    when p.lab_testing_state is null        then 'no test state recorded'
    else p.lab_testing_state
  end                                                          as certificate_says,
  d_man.download_url                                           as manifest_link,
  case when d_man.storage_path is not null then 'on file'
       else 'manifest document not yet fetched' end            as manifest_document,
  -- ---- appended ----------------------------------------------------------
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

-- The conflicts on their own page. Neither side is automatically right, so this
-- names both and asks a person rather than picking one.
create or replace view v_strain_conflicts as
select t.manifest_number, t.package_tag, t.item,
       t.strain                     as strain_column_says,
       f_strain_from_item(t.item)   as item_name_says,
       t.destination_facility, t.shipped_qty,
       t.shipper_wholesale_price    as value_usd,
       'The item name and the strain field name different strains. One of them is wrong on a '
       || 'compliance document. Neither can be assumed correct — check Metrc.' as what_is_wrong
from metrc_rpt_package_transfers t
where t.strain is not null and t.strain <> ''
  and f_strain_from_item(t.item) is not null
  and lower(replace(t.strain,'.','')) <> lower(replace(f_strain_from_item(t.item),'.',''))
  and lower(t.strain) not like '%'||lower(f_strain_from_item(t.item))||'%'
  and lower(f_strain_from_item(t.item)) not like '%'||lower(t.strain)||'%';

grant select on v_shipped_full, v_strain_conflicts to authenticated;
revoke all on v_shipped_full, v_strain_conflicts from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Command Center', 0, 'Strain Conflicts — item vs record', 1, 'gauge',
        'strain_conflicts', 'v_strain_conflicts',
        'Manifest lines where the item name and the strain field name different strains. One of them is wrong on a compliance document.',
        true, false, 'deep', 'Third Party')
on conflict do nothing;;
