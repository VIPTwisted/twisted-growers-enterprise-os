/* THE HARVEST -> TAG BRIDGE THAT NO DRILL COULD CROSS.
 *
 * Owner, 18 Aug 2026, pointing at the moisture register: "all data must drill
 * down forensically! without the drill down we can not see tags and other
 * critical information." He is right, and the gap is structural: the OS holds
 * TWENTY-SEVEN harvest views and not one carries a tag column. Tag -> harvest
 * exists (v_tag_lifecycle stage1); harvest -> tags existed nowhere, so every
 * harvest-keyed row was a dead end.
 *
 * This is the inverse index: one row per (harvest, tag) for every package that
 * names the harvest in its Metrc lineage — live and closed alike, because
 * forensics reads history. Each row carries the critical information the owner
 * named: the tag, what it is, where it stands and sits, its weight or units,
 * its laboratory state and certificate, and its outbound manifest if it left.
 * From here every tag flows to v_tag_lifecycle / v_package_dossier. A blend
 * package appears under EACH contributing harvest — identity is the tag, and a
 * harvest's drill must list every tag it fed (owner ruling D4).
 *
 * Built on the canonical survivor dedup. The front-end wiring of every
 * harvest-keyed row to this index belongs to the universal-drilldown lane. */

create or replace view public.v_harvest_tag_index as
with pkg as (
  select distinct on (d.tag) d.*
  from metrc_packages d
  order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
           (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last
)
select btrim(h.hn)                                                   as harvest,
       p.tag,
       p.item_name,
       coalesce(p.raw #>> '{Item,ProductCategoryName}', '(uncategorised)') as category,
       p.source_state,
       p.license,
       p.location                                                    as room,
       round(f_to_pounds(p.quantity, p.uom), 3)                      as lb,
       case when not f_is_weight(p.uom) then p.quantity end          as units,
       p.lab_testing_state                                           as lab_state,
       ev.certificate_id,
       ev.certificate_document,
       o.manifest_number                                             as outbound_manifest,
       o.destination_facility                                        as shipped_to,
       (coalesce(p.finished,false) or (p.raw ->> 'ArchivedDate') is not null
        or (p.raw ->> 'FinishedDate') is not null)                   as closed,
       p.packaged_on
from pkg p
cross join lateral unnest(string_to_array(coalesce(p.raw ->> 'SourceHarvestNames',''), ',')) as h(hn)
left join v_tag_evidence ev on ev.tag = p.tag
left join lateral (
    select t.manifest_number, t.destination_facility
    from metrc_rpt_package_transfers t
    where t.package_tag = p.tag
    order by t.received_on desc nulls last limit 1) o on true
where btrim(h.hn) <> '';

comment on view public.v_harvest_tag_index is
  'THE harvest -> tag bridge: one row per (harvest, tag) for every package naming the harvest in '
  'its Metrc lineage, live and closed — the inverse of v_tag_lifecycle.stage1_harvest, built '
  '18 Aug 2026 when the owner found harvest rows dead-ending (27 harvest views, zero tag '
  'columns). Carries state, room, weight/units, lab state, certificate, and outbound manifest; '
  'blends appear under each contributing harvest (ruling D4). Filter by harvest; each tag flows '
  'on to v_tag_lifecycle / v_package_dossier. Agent I.';;
