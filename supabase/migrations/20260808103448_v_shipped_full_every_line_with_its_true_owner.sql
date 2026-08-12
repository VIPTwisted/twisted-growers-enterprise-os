-- OWNER INSTRUCTION, 8 August 2026, binding:
-- "WHEN I ASK AI WHAT WAS SHIPPED IT MUST ALWAYS SHOW FULL PIPELINE"
-- "ALL THE INFORMATION THAT LEFT FACILITY YESTERDAY OURS OR 3RD PARTY FULL"
--
-- WHAT WENT WRONG AND WHY THIS VIEW EXISTS.
--
-- Asked what shipped on 7 Aug, the assistant returned eight packages to ARL
-- Healthcare, $25,027, as Twisted Growers product. The owner corrected it in one
-- line: "THOSE ARE NOT OUR STRAINS AND WE DID NOT SELL TRIM." He was right.
--
-- Every one of those packages was Holyoke Wilds material, received on inbound
-- manifests 0003318120 and 0003351074, repackaged on 5 Aug and sold on. The
-- platform could not see it because when a package is REPACKAGED in Metrc the
-- child does not inherit ReceivedFromFacilityName - that field belongs to the
-- parent. The child carries only a pointer, SourcePackageLabels.
--
-- The platform read the child, saw an empty received-from, and booked it as our
-- own production. ONE LEVEL DEEP, THEN STOP. That inflates what we appear to
-- grow and drags cost per pound toward a number built from someone else's
-- material - which is exactly the blending rule C6c forbids.
--
-- f_material_origin already walks the lineage correctly. It was built 7 Aug and
-- wired into two views, neither of which anybody asks about a shipment. So the
-- fix existed and the question still got the wrong answer.
--
-- This view is what "what shipped" must read from now on. Every line carries its
-- true owner, resolved through lineage, and the inbound manifest that brought it
-- here. Never answer a shipment question from metrc_rpt_package_transfers alone.
create or replace view v_shipped_full as
with lines as (
  select t.manifest_number,
         t.package_tag,
         t.item,
         /* C3a / the owner, 8 Aug: when the strain column is blank the strain is
            sitting in the item text - "Holyoke Wilds | Blockberry | Bulk
            Shake/Trim". 387 rows are blank while the item names it plainly.
            Read it rather than reporting the strain unknown. */
         coalesce(
           nullif(t.strain, ''),
           nullif(trim(split_part(t.item, '|', 2)), ''),
           nullif(trim(split_part(split_part(t.item, ':', 2), '-', 1)), ''),
           'not stated on the manifest'
         )                                                as strain,
         t.category,
         t.shipped_qty,
         t.shipped_uom,
         t.shipped_lb,
         t.shipper_wholesale_price,
         t.destination_facility,
         t.destination_licence,
         t.status,
         t.received_on,
         t.licence                                        as our_licence,
         f_material_origin(t.package_tag)                 as origin
  from metrc_rpt_package_transfers t
)
select
  tr.created_on::date                                     as shipped_on,
  l.manifest_number,
  tr.direction,
  tr.shipper,
  coalesce(tr.recipient, l.destination_facility)          as recipient,
  f_facility_type(l.destination_licence)                  as recipient_type,
  f_is_transporter(l.destination_licence)                 as recipient_is_a_transporter,
  l.package_tag,
  l.item,
  l.strain,
  l.category,
  l.shipped_qty,
  l.shipped_uom,
  round(l.shipped_lb, 2)                                  as pounds,
  l.shipper_wholesale_price                               as value_usd,

  -- ── WHOSE MATERIAL IT ACTUALLY WAS ──────────────────────────────────────
  case
    when (l.origin->>'all_ours')::boolean     then 'OURS — we grew it'
    when (l.origin->>'any_outside')::boolean  then 'THIRD PARTY — ' ||
         coalesce(l.origin->'origin_names'->>0, 'origin not named')
    else 'UNRESOLVED — lineage does not say'
  end                                                     as whose_material,
  (l.origin->>'all_ours')::boolean                        as is_ours,
  l.origin->'origin_names'                                as originator,
  l.origin->'origin_licences'                             as originator_licences,
  /* The owner, 8 Aug: "EACH HAS LICENSE" — one company legitimately holds
     several licences, one per location. Two different licence numbers for the
     same name is NOT a discrepancy and must never be reported as one. */
  l.origin->>'item_field_says'                            as item_field_licence,
  l.origin->'inbound_manifests'                           as came_in_on_manifest,
  l.origin->'source_harvests'                             as source_harvests,
  (l.origin->>'lineage_packages')::int                    as lineage_depth,

  -- ── THE TWO DOCUMENTS, C3a ──────────────────────────────────────────────
  -- The COA carries the testing. The manifest carries the chain of custody.
  d_coa.download_url                                      as certificate_link,
  case
    when d_coa.storage_path is not null then 'on file'
    when p.lab_testing_state = 'TestPassed' then 'passed, certificate not yet fetched from Metrc'
    when p.lab_testing_state = 'TestFailed' then 'FAILED testing'
    when p.lab_testing_state is null        then 'no test state recorded'
    else p.lab_testing_state
  end                                                     as certificate_says,
  d_man.download_url                                      as manifest_link,
  case when d_man.storage_path is not null then 'on file'
       else 'manifest document not yet fetched' end       as manifest_document
from lines l
left join metrc_transfers   tr on tr.manifest_number = l.manifest_number
left join metrc_packages    p  on p.tag  = l.package_tag
left join metrc_documents   d_coa on d_coa.package_tag = l.package_tag
                                 and d_coa.doc_type ilike '%coa%'
left join metrc_documents   d_man on d_man.manifest_number = l.manifest_number
                                 and d_man.doc_type ilike '%manifest%';

comment on view v_shipped_full is
  'THE answer to "what shipped". Every line carries its true owner resolved through package lineage (f_material_origin), the inbound manifest it arrived on, the strain read from the item text when the strain column is blank, and both documents. Never answer a shipment question from metrc_rpt_package_transfers alone: a repackaged child loses ReceivedFromFacilityName, so a one-level read books third-party material as our own production.';

grant select on v_shipped_full to authenticated;
revoke all on v_shipped_full from anon;;
