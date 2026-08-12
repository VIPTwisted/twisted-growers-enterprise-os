-- ---------------------------------------------------------------------------
-- 0040 — THE COMPLETE TAG LEDGER. Every tag we have ever held.
--
-- Owner, 10 Aug 2026: "every tag must show detail... and if in stock it show the
-- room, if sold manifest show who sold to."
--
-- v_tag_provenance covers only tags STILL HELD. This covers every tag ever, and
-- answers the one question in one column:
--
--   IN STOCK  -> the room and the licence holding it
--   GONE      -> the manifest, the destination facility and licence, and WHAT
--                that destination is -- customer, laboratory, transporter, or our
--                own other licence
--
-- WHY THE DESTINATION TYPE MATTERS MORE THAN THE NAME. Of 1,160 cultivation
-- outgoing manifests, 966 go to MP281909 -- OUR OWN manufacturing licence. Calling
-- those "sold" would overstate sales by a factor of five. A transporter is storage
-- or haulage; a laboratory is testing; our own other licence is an internal
-- transfer between two legal entities. Only an arm's-length licensee is a sale,
-- and even then APEX is the record of truth for whether money changed hands.
-- ---------------------------------------------------------------------------

create or replace view v_tag_ledger as
with shipped as (
  select t.package_tag,
         string_agg(distinct m.manifest_number, ', ' order by m.manifest_number) as manifests,
         string_agg(distinct m.destination_facility, ', ')                        as destinations,
         string_agg(distinct m.destination_licence, ', ')                         as destination_licences,
         string_agg(distinct m.transfer_type, ', ')                               as transfer_types,
         max(coalesce(m.created_on, m.received_on))                               as last_shipped_on,
         round(sum(t.shipped_lb)::numeric,3)                                      as shipped_lb,
         round(sum(t.shipper_wholesale_price)::numeric,2)                         as shipper_value
  from metrc_rpt_package_transfers t
  join metrc_rpt_transfer_manifests m on m.manifest_number = t.manifest_number
  where m.direction = 'outbound'
  group by 1
)
select p.raw->>'Label'                                          as package_tag,
       p.raw#>>'{Item,Name}'                                    as item,
       f_strain_from_item(p.raw#>>'{Item,Name}')                as strain,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       (p.raw->>'PackagedDate')::date                           as packaged_on,

       /* ---- WHOSE IS IT ---- */
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(not recorded)') as harvested_by,
       coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'—')     as harvested_by_licence,
       case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'OURS'
            else 'THIRD PARTY' end                              as ownership_label,

       /* ---- IS IT STILL HERE ---- */
       (coalesce((p.raw->>'Quantity')::numeric,0) > 0
        and not coalesce((p.raw->>'IsFinished')::boolean,false)) as in_stock,

       /* ---- IF IN STOCK: WHERE ---- */
       case when coalesce((p.raw->>'Quantity')::numeric,0) > 0
             and not coalesce((p.raw->>'IsFinished')::boolean,false)
            then coalesce(nullif(p.raw->>'LocationName',''),'(no room)') end as room,
       case when coalesce((p.raw->>'Quantity')::numeric,0) > 0
             and not coalesce((p.raw->>'IsFinished')::boolean,false)
            then p.license end                                  as held_by_licence,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then round(f_to_pounds(coalesce((p.raw->>'Quantity')::numeric,0),
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as lb_on_hand,

       /* ---- IF GONE: WHERE TO ---- */
       s.manifests                                              as outbound_manifests,
       s.destinations                                           as shipped_to,
       s.destination_licences                                   as shipped_to_licence,
       s.transfer_types,
       s.last_shipped_on,
       s.shipped_lb,
       s.shipper_value,

       /* ---- THE ANSWER, IN ONE COLUMN ---- */
       case
         when coalesce((p.raw->>'Quantity')::numeric,0) > 0
          and not coalesce((p.raw->>'IsFinished')::boolean,false)
           then 'IN STOCK — ' || coalesce(nullif(p.raw->>'LocationName',''),'(no room)')
                || ' (' || p.license || ')'
         when s.package_tag is not null
           then 'SHIPPED ' || to_char(s.last_shipped_on,'YYYY-MM-DD')
                || ' on manifest ' || s.manifests
                || ' to ' || coalesce(s.destinations,'?')
                || case
                     when s.destination_licences ~* 'MT'  then ' [TRANSPORTER — storage/haulage, not a sale]'
                     when s.transfer_types ilike '%Lab%'  then ' [LABORATORY — testing]'
                     when s.transfer_types ilike '%Affiliated%'
                       then ' [OUR OWN OTHER LICENCE — internal transfer between two legal entities]'
                     else ' [ARM''S LENGTH LICENSEE — check Apex for the sale]'
                   end
         when coalesce((p.raw->>'IsFinished')::boolean,false)
           then 'FINISHED — consumed or repackaged here, never shipped'
         else 'ZERO QUANTITY — drawn down here, no outbound manifest'
       end                                                      as where_is_it,

       nullif(p.raw->>'SourceHarvestNames','')                   as source_harvest,
       nullif(p.raw->>'SourcePackageLabels','')                  as source_packages,
       nullif(p.raw->>'ReceivedFromManifestNumber','')           as inbound_manifest,
       p.raw->>'LabTestingState'                                 as lab_state,
       (c.package_tag is not null)                               as has_coa,
       c.document_id                                             as coa_document_id
from metrc_packages p
left join shipped s   on s.package_tag = p.raw->>'Label'
left join coa_extract c on c.package_tag = p.raw->>'Label';

comment on view v_tag_ledger is
  'EVERY TAG EVER HELD. where_is_it answers in one column: IN STOCK with the room '
  'and licence, or SHIPPED with the date, manifest and destination -- and what that '
  'destination IS. 966 of 1,160 cultivation outgoing manifests go to our own '
  'MP281909, so calling shipped-out "sold" would overstate sales fivefold. Only an '
  'arm''s-length licensee is a sale, and Apex is the record of truth for the money.';

grant select on v_tag_ledger to authenticated;
;
