/* Full forensic dossier for every tag on an unmatched manifest.
 *
 * Owner, 18 Aug 2026: "I need to know dates of these absent from apex and ability to pull
 * full detailed forensic information all tags, names of items, dates, rooms, tags,
 * manifests, etc., any and all info."
 *
 * DATES, measured: the 174 ABSENT FROM APEX manifests are not a burst. They run from
 * 30 Jan 2025 to 6 Aug 2026 with something in EVERY month — about nine a month, twenty
 * months without a break. A one-off would be an incident; this is a standing leak in the
 * process that puts an order into Apex when material leaves on a manifest.
 *
 * WHAT THIS VIEW ADDS. Everything Metrc actually recorded, including two fields nothing
 * in the platform was reading: source_row->>'Created by User' and 'Received by User'.
 * 17,668 transfer rows carry them. In a dispute about an unbilled shipment, the name of
 * the person who created the manifest and the person who received it is the first thing
 * anyone asks for, and it was sitting unused in the JSON.
 *
 * Fields are read from source_row where the promoted column does not exist, rather than
 * promoting them now: this is a forensic surface over a report table, and widening
 * metrc_rpt_package_transfers is a loader change with its own review.
 */

create or replace view public.v_unmatched_manifest_dossier as
select
  /* ── the manifest ─────────────────────────────────────────────────────────── */
  f.manifest_number,
  f.diagnosis,
  f.shipped_on,
  (t.source_row->>'Created')                       as created_on,
  (t.source_row->>'Received')                      as received_on_raw,
  (t.source_row->>'Created by User')               as created_by_user,
  (t.source_row->>'Received by User')              as received_by_user,
  coalesce(t.source_row->>'Type', f.transfer_type) as transfer_type,
  (t.source_row->>'Voided')                        as voided,
  (t.source_row->>'Inv. Nbr')                      as metrc_invoice_number,

  /* ── who it went to, and who sent it ──────────────────────────────────────── */
  f.buyer,
  f.buyer_licence,
  (t.source_row->>'Dest. Facility Type')           as destination_facility_type,
  coalesce(t.source_row->>'Origin Facility', t.licence) as origin_facility,
  (t.source_row->>'Origin Lic.')                   as origin_licence,
  (t.source_row->>'Origin Facility Type')          as origin_facility_type,

  /* ── the package ──────────────────────────────────────────────────────────── */
  t.package_tag,
  t.item,
  t.category,
  t.strain,
  p.location                                        as room_when_last_seen,
  p.license                                         as held_under_licence,
  p.packaged_on,
  p.lab_testing_state,
  p.raw->>'SourceHarvestNames'                      as came_from_harvest,
  p.raw->>'SourcePackageLabels'                     as came_from_packages,
  p.raw->>'ProductionBatchNumber'                   as production_batch,

  /* ── the weights, as Metrc recorded them ──────────────────────────────────── */
  t.shipped_qty,
  t.shipped_uom,
  t.received_qty,
  round(coalesce(t.shipped_lb,0)::numeric, 3)       as shipped_lb,
  t.gross_weight,
  (t.source_row->>'Weight % Var')                   as weight_pct_variance,
  (t.source_row->>'Count % Var')                    as count_pct_variance,

  /* ── the money Metrc was told ─────────────────────────────────────────────── */
  t.shipper_wholesale_price                         as metrc_declared_usd,
  t.receiver_wholesale_price                        as receiver_declared_usd,
  t.status,

  /* ── the Apex side, where a candidate exists ──────────────────────────────── */
  f.apex_candidate_buyer,
  f.apex_candidate_invoice,
  f.apex_candidate_date,
  f.apex_candidate_usd,
  f.apex_candidate_days_apart,
  f.what_to_do
from public.v_unmatched_manifest_forensic f
join public.metrc_rpt_package_transfers t
  on t.manifest_number = f.manifest_number
left join lateral (
  select mp.location, mp.license, mp.packaged_on, mp.lab_testing_state, mp.raw
    from public.metrc_packages mp
   where mp.tag = t.package_tag
   order by (mp.source_state = 'active') desc, mp.synced_at desc
   limit 1
) p on true;

comment on view public.v_unmatched_manifest_dossier is
  'One row per TAG on every manifest with no matching Apex invoice — the complete forensic '
  'record: manifest and its dates, the user who created it and the user who received it, '
  'origin and destination facility with type and licence, the package with its room, '
  'packaged date, lab state and full lineage, every weight Metrc recorded with its '
  'variance, the declared money both sides, and the Apex candidate order where one exists. '
  'created_by_user and received_by_user come from source_row and were being read by '
  'nothing before 18 Aug 2026, despite being present on 17,668 rows — in a dispute over an '
  'unbilled shipment they are the first thing anyone asks for. Agent I.';

grant select on public.v_unmatched_manifest_dossier to tg_desktop_reader;;
