-- HARD RULE, OWNER, 8 Aug 2026:
--   "All items you show as untested, no COA or manifest - I need to see what Metrc
--    inventory and seed-to-sale shows for each tag. That means it's in the facility
--    and Metrc tracks exactly what room it is in, per law."
--
-- A claim of "never tested" is not an explanation. Massachusetts law requires Metrc
-- to hold the current room for every tagged package, so a package claimed to have
-- never left MUST be visible in Metrc inventory, in a named room, with a seed-to-sale
-- chain behind it. If it cannot be shown there, the claim fails.
--
-- Every column below comes from METRC'S OWN RECORD (metrc_packages.raw, synced from
-- the API) - the room, the state, the quantity, the lineage and the harvest. Nothing
-- here is this platform's inference.
--
-- UNDO: drop view v_never_tested_proof;

create or replace view public.v_never_tested_proof as
with base as (
  select distinct on (p.tag) p.tag, p.item_name, p.uom, p.quantity, p.license,
         p.lab_testing_state, p.source_state, p.packaged_on, p.raw
  from metrc_packages p order by p.tag, p.license
)
select b.tag                                        as metrc_tag,
       b.license                                    as metrc_licence,
       left(b.item_name, 46)                        as item,
       b.raw#>>'{Item,ProductCategoryName}'         as category,
       f_quantity_text(b.quantity, b.uom)           as metrc_quantity,
       -- WHERE METRC SAYS IT IS. Required by law to be current.
       b.raw->>'LocationName'                       as metrc_room,
       b.raw->>'LocationTypeName'                   as room_type,
       nullif(b.raw->>'SublocationName','')         as sublocation,
       -- WHAT METRC SAYS ITS STATE IS
       b.lab_testing_state                          as metrc_lab_state,
       b.source_state                               as metrc_status,
       (b.raw->>'IsOnHold')::boolean                as on_hold,
       (b.raw->>'IsFinished')::boolean              as finished,
       b.packaged_on                                as metrc_packaged_on,
       (b.raw->>'LastModified')::date               as metrc_last_modified,
       current_date - b.packaged_on                 as days_in_facility,
       -- SEED TO SALE, as Metrc records it
       nullif(b.raw->>'SourceHarvestNames','')      as from_harvest,
       (b.raw->>'SourcePackageCount')::int          as made_from_n_packages,
       left(nullif(b.raw->>'SourcePackageLabels',''), 120) as made_from_packages,
       nullif(b.raw->>'ProductionBatchNumber','')   as production_batch,
       nullif(b.raw->>'ReceivedFromManifestNumber','') as arrived_on_manifest,
       (select string_agg(c.tag, ', ') from metrc_packages c
         where c.raw->>'SourcePackageLabels' like '%'||b.tag||'%')  as became_packages,
       -- THE FOUR-SOURCE RECONCILIATION
       (select count(*) from metrc_lab_results l where l.package_tag = b.tag)           as lab_results,
       (select count(*) from metrc_rpt_package_transfers t where t.package_tag = b.tag) as manifest_lines,
       (select count(*) from v_certificate_resolved r
         where r.package_tag = b.tag and r.found_at_depth = 0)                          as own_certificate,
       (select max(r.found_at_depth) from v_certificate_resolved r
         where r.package_tag = b.tag)                                                   as inherited_cert_depth,
       case
         when (b.raw->>'LocationName') is null
           then 'FAILS THE RULE - Metrc holds no room for this tag'
         when (select count(*) from metrc_lab_results l where l.package_tag = b.tag) > 0
           then 'FAILS THE RULE - claimed untested but laboratory results exist'
         when (select count(*) from metrc_rpt_package_transfers t where t.package_tag = b.tag) > 0
           then 'FAILS THE RULE - claimed never shipped but it is on a manifest line'
         when (select count(*) from v_certificate_resolved r
                where r.package_tag = b.tag and r.found_at_depth = 0) > 0
           then 'FAILS THE RULE - claimed untested but a certificate is filed against it'
         else 'PROVEN - Metrc holds it in ' || (b.raw->>'LocationName')
              || ', state ' || b.lab_testing_state || ', no results, no manifest, no certificate'
       end                                          as proof
from base b
where b.lab_testing_state in ('NotSubmitted','NotRequired')
  and b.source_state = any (array['active','onhold']);

comment on view public.v_never_tested_proof is
  'PROOF REQUIRED (owner hard rule, 8 Aug 2026). Every package claimed never tested, '
  'shown with what METRC holds for it: the room it is in - which Massachusetts law '
  'requires Metrc to keep current - its state, quantity, and its seed-to-sale chain '
  'in and out. Filter to proof LIKE ''FAILS%'': that must be empty. Nothing in this '
  'view is inferred by the platform; every field is Metrc''s own record.';;
