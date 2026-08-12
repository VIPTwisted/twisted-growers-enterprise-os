-- ---------------------------------------------------------------------------
-- 0037 — HARVESTED BY / REPACKAGED BY / MANUFACTURED BY, on every tag.
--
-- Owner, 10 Aug 2026: "you must always note on every tag harvested by, repackaged
-- and if manufactured by who. need full trace and track always!"
--
-- THREE DIFFERENT ROLES, THREE DIFFERENT ENTITIES, and they are routinely not the
-- same one. The Holyoke Wilds trim proves it: HARVESTED BY Holyoke Wilds
-- (MC283571), REPACKAGED BY Twisted Growers manufacturing (MP281909) on
-- 2026-08-05. One tag, two legal entities, and reading only the second books
-- somebody else's grow as ours -- which has already happened twice.
--
--   harvested_by     ItemFromFacilityName. WHERE THE PLANT MATERIAL ORIGINATED.
--                    Survives repackaging, unlike ReceivedFromFacilityName which
--                    is NULL on every child.
--   repackaged_by    set ONLY when SourcePackageLabels is present -- the licence
--                    holding the tag did the repack. NULL means never repackaged.
--   manufactured_by  set ONLY for manufactured goods (concentrate, vape, edible,
--                    pre-roll, infused). Flower and trim are not manufactured;
--                    claiming a manufacturer for them would invent a step.
--
-- EACH ROLE CARRIES ITS OWN LICENCE AND ITS OWN OURS/THIRD-PARTY FLAG, because the
-- LICENCE is the legal and tax entity -- not the company name.
-- ---------------------------------------------------------------------------

create or replace view v_tag_provenance as
select p.raw->>'Label'                                            as package_tag,
       p.license                                                  as held_by_licence,
       coalesce(nullif(p.raw->>'LocationName',''),'(no room)')     as current_room,
       p.raw#>>'{Item,Name}'                                      as item,
       f_strain_from_item(p.raw#>>'{Item,Name}')                  as strain,
       coalesce(nullif(p.raw#>>'{Item,ProductCategoryName}',''),'(none)') as category,
       (p.raw->>'PackagedDate')::date                             as packaged_on,
       case when f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then round(f_to_pounds((p.raw->>'Quantity')::numeric,
                 coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))::numeric,3) end as lb,
       case when not f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
            then (p.raw->>'Quantity')::numeric end                as units,

       /* ---------- 1 · HARVESTED BY ---------- */
       coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'(not recorded)')  as harvested_by,
       coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'—')      as harvested_by_licence,
       case when nullif(p.raw->>'ItemFromFacilityLicenseNumber','') is null then 'UNKNOWN'
            when f_is_ours(p.raw->>'ItemFromFacilityLicenseNumber')          then 'OURS'
            else 'THIRD PARTY' end                                           as harvested_by_ownership,
       nullif(p.raw->>'SourceHarvestNames','')                               as source_harvest,

       /* ---------- 2 · REPACKAGED BY (only if it was) ---------- */
       case when nullif(p.raw->>'SourcePackageLabels','') is not null
            then coalesce((select cl.label from company_licenses cl where cl.license = p.license limit 1),
                          p.license) end                                     as repackaged_by,
       case when nullif(p.raw->>'SourcePackageLabels','') is not null
            then p.license end                                               as repackaged_by_licence,
       case when nullif(p.raw->>'SourcePackageLabels','') is null then null
            when f_is_ours(p.license) then 'OURS' else 'THIRD PARTY' end      as repackaged_by_ownership,
       case when nullif(p.raw->>'SourcePackageLabels','') is not null
            then array_length(string_to_array(p.raw->>'SourcePackageLabels', ', '),1) end as source_tag_count,
       nullif(p.raw->>'SourcePackageLabels','')                              as source_packages,

       /* ---------- 3 · MANUFACTURED BY (only for manufactured goods) ---------- */
       case when p.raw#>>'{Item,ProductCategoryName}' ~* '(concentrate|vape|edible|pre-?roll|infused|tincture|topical)'
            then coalesce((select cl.label from company_licenses cl where cl.license = p.license limit 1),
                          p.license) end                                     as manufactured_by,
       case when p.raw#>>'{Item,ProductCategoryName}' ~* '(concentrate|vape|edible|pre-?roll|infused|tincture|topical)'
            then p.license end                                               as manufactured_by_licence,
       case when p.raw#>>'{Item,ProductCategoryName}' !~* '(concentrate|vape|edible|pre-?roll|infused|tincture|topical)'
              then null
            when f_is_ours(p.license) then 'OURS' else 'THIRD PARTY' end      as manufactured_by_ownership,

       /* ---------- how it reached us ---------- */
       nullif(p.raw->>'ReceivedFromManifestNumber','')                       as inbound_manifest,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityName',''),'—')           as shipped_to_us_by,
       coalesce(nullif(p.raw->>'ReceivedFromFacilityLicenseNumber',''),'—')  as shipped_to_us_by_licence,
       (p.raw->>'ReceivedDateTime')::date                                    as received_on,

       /* ---------- the one-line story ---------- */
       'HARVESTED BY ' || coalesce(nullif(p.raw->>'ItemFromFacilityName',''),'?')
         || ' (' || coalesce(nullif(p.raw->>'ItemFromFacilityLicenseNumber',''),'?') || ')'
         || case when nullif(p.raw->>'ReceivedFromManifestNumber','') is not null
                 then ' · shipped to us on manifest ' || (p.raw->>'ReceivedFromManifestNumber') else '' end
         || case when nullif(p.raw->>'SourcePackageLabels','') is not null
                 then ' · REPACKAGED BY ' || p.license else '' end
         || case when p.raw#>>'{Item,ProductCategoryName}' ~* '(concentrate|vape|edible|pre-?roll|infused|tincture|topical)'
                 then ' · MANUFACTURED BY ' || p.license else '' end
         || ' · now in ' || coalesce(nullif(p.raw->>'LocationName',''),'(no room)')
         || ' under ' || p.license                                            as provenance,

       p.raw->>'LabTestingState'                                             as lab_state,
       (c.package_tag is not null)                                           as has_coa,
       c.document_id                                                         as coa_document_id
from metrc_packages p
left join coa_extract c on c.package_tag = p.raw->>'Label'
where coalesce((p.raw->>'Quantity')::numeric,0) > 0
  and coalesce((p.raw->>'IsFinished')::boolean,false) = false;

comment on view v_tag_provenance is
  'FULL TRACE PER TAG: harvested_by, repackaged_by, manufactured_by -- three roles '
  'that are routinely three DIFFERENT legal entities, each with its own licence and '
  'ours/third-party flag. repackaged_by is NULL when the tag was never repackaged; '
  'manufactured_by is NULL for flower and trim, because claiming a manufacturer for '
  'unprocessed plant material would invent a step that did not happen. The '
  'provenance column states the whole chain in one line.';

grant select on v_tag_provenance to authenticated;
;
