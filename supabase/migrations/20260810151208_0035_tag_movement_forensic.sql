-- ---------------------------------------------------------------------------
-- 0035 — WHERE IS EVERY TAG, AND HOW DID IT GET THERE.
--
-- Owner, 10 Aug 2026: "forensically track movement of all these items and final
-- destination what room; or manifest; or transferred to manufacturing license --
-- all discrepancies, each tag, do not omit one."
--
-- One row per held tag. Four questions answered on every row:
--   WHERE IS IT NOW      room + licence
--   HOW DID IT ARRIVE    inbound manifest, or made here off a harvest, or
--                        repackaged from named source tags
--   DID IT CROSS LICENCE cultivation -> manufacturing is an INTERNAL move, never
--                        a sale, and it is the transfer most often misread
--   WHERE DID IT GO      any outbound manifest carrying this tag, with the
--                        destination and whether that destination is a customer,
--                        a laboratory, a transporter or our own other licence
--
-- Ownership is resolved from ItemFromFacilityName, which survives repackaging.
-- ---------------------------------------------------------------------------

create or replace view v_tag_movement_forensic as
with out_moves as (
  select t.package_tag,
         string_agg(distinct m.manifest_number, ', ' order by m.manifest_number) as outbound_manifests,
         string_agg(distinct m.destination_facility, ', ')                        as shipped_to,
         string_agg(distinct m.destination_licence, ', ')                         as shipped_to_licence,
         string_agg(distinct m.transfer_type, ', ')                               as outbound_types,
         max(coalesce(m.created_on, m.received_on))                               as last_shipped_on
  from metrc_rpt_package_transfers t
  join metrc_rpt_transfer_manifests m on m.manifest_number = t.manifest_number
  where m.direction = 'outbound'
  group by 1
)
select p.raw->>'Label'                                              as package_tag,

       /* ---- WHERE IS IT NOW ---- */
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)')      as current_room,
       p.license                                                    as current_licence,
       case when p.license = 'MC281714' then 'CULTIVATION'
            when p.license = 'MP281909' then 'MANUFACTURING'
            else p.license end                                      as current_department,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then round(f_to_pounds((p.raw->>'Quantity')::numeric,
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as lb_on_hand,
       case when not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then (p.raw->>'Quantity')::numeric end                  as units_on_hand,

       /* ---- WHAT IS IT ---- */
       p.raw#>>'{Item,Name}'                                        as item,
       f_strain_from_item(p.raw#>>'{Item,Name}')                    as strain,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       (p.raw->>'PackagedDate')::date                               as packaged_on,
       p.raw->>'LabTestingState'                                    as lab_state,

       /* ---- WHOSE IS IT ---- */
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(not recorded)') as cultivated_by,
       coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'—')     as cultivated_by_licence,
       (not f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber',''))) as is_third_party,
       case when f_is_ours(coalesce(p.raw->>'ItemFromFacilityLicenseNumber','')) then 'OURS'
            else 'THIRD PARTY' end                                  as ownership_label,

       /* ---- HOW DID IT ARRIVE ---- */
       case
         when nullif(p.raw->>'ReceivedFromManifestNumber','') is not null
           then 'ARRIVED ON MANIFEST ' || (p.raw->>'ReceivedFromManifestNumber')
                || ' from ' || coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'?')
         when nullif(p.raw->>'SourcePackageLabels','') is not null
           then 'REPACKAGED here from ' ||
                (array_length(string_to_array(p.raw->>'SourcePackageLabels', ', '),1))::text
                || ' source tag(s)'
         when nullif(p.raw->>'SourceHarvestNames','') is not null
           then 'MADE HERE off harvest ' || (p.raw->>'SourceHarvestNames')
         else 'origin not recorded'
       end                                                          as how_it_arrived,
       nullif(p.raw->>'ReceivedFromManifestNumber','')               as inbound_manifest,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'—')   as received_from,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityLicenseNumber',''),'—') as received_from_licence,
       (p.raw->>'ReceivedDateTime')::date                            as received_on,
       nullif(p.raw->>'SourceHarvestNames','')                       as source_harvest,
       nullif(p.raw->>'SourcePackageLabels','')                      as source_packages,

       /* ---- DID IT CROSS OUR OWN LICENCE BOUNDARY ---- */
       (f_is_ours(coalesce(p.raw->>'ReceivedFromFacilityLicenseNumber',''))
        and nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','') is distinct from p.license)
                                                                    as crossed_our_licences,
       case when f_is_ours(coalesce(p.raw->>'ReceivedFromFacilityLicenseNumber',''))
             and nullif(p.raw->>'ReceivedFromFacilityLicenseNumber','') is distinct from p.license
            then 'INTERNAL TRANSFER ' || (p.raw->>'ReceivedFromFacilityLicenseNumber')
                 || ' -> ' || p.license || ' — NOT A SALE'
            else null end                                           as internal_move,

       /* ---- WHERE DID IT GO ---- */
       o.outbound_manifests,
       o.shipped_to,
       o.shipped_to_licence,
       o.outbound_types,
       o.last_shipped_on,
       case
         when o.package_tag is null then 'STILL HELD — never shipped out'
         when o.shipped_to_licence ilike '%MT%'  then 'went to a TRANSPORTER — storage or haulage, not a sale'
         when o.outbound_types ilike '%Lab%'     then 'went to a LABORATORY — testing'
         when o.outbound_types ilike '%Affiliated%' then 'went to OUR OTHER LICENCE — internal, not a sale'
         else 'went to another licensee — check Apex for the sale'
       end                                                          as final_destination
from metrc_packages p
left join out_moves o on o.package_tag = p.raw->>'Label'
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false;

comment on view v_tag_movement_forensic is
  'Every held tag: where it is now (room, licence, department), how it arrived '
  '(inbound manifest / repackaged / made here off a harvest), whether it crossed '
  'between OUR OWN two licences (an internal move, never a sale), and where it '
  'went. Ownership from ItemFromFacilityName, which survives repackaging.';

grant select on v_tag_movement_forensic to authenticated;
;
