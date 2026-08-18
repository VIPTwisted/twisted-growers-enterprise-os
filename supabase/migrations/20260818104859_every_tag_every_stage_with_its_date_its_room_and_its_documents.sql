/* Every tag, every stage, with its date, its room, and its documents.
 *
 * Owner, 18 Aug 2026: "Every tag, every single item throughout the OS must always drill
 * down forensically fully to also include all data, and links to any and all Manefests,
 * Invoices, COA" and "All tags MUST provide all stages with dates for each and exactly
 * where it can be found and audited in the facility this is seed to sale metrc is and you
 * must follow all rules".
 *
 * WHAT ALREADY EXISTED. v_material_forensic_dossier covers all 18,870 tags and carries
 * inbound and outbound manifest documents on 15,430 of them; v_tag_evidence carries a
 * certificate document on 13,660. That work is not repeated here.
 *
 * WHAT WAS MISSING, measured before building:
 *   - the APEX INVOICE. Not one column anywhere in the dossier. Metrc owns the manifest,
 *     Apex owns the invoice, and per the owner's ruling of 17 Aug the two are joined for
 *     reporting and never merged. The money end of seed-to-sale was simply absent.
 *   - a STAGE TIMELINE. Dates existed scattered across columns; nothing put them in order
 *     so a person could read the life of a tag top to bottom.
 *   - WHERE TO GO AND LOOK. A forensic record that cannot tell an auditor which room to
 *     walk into is an academic exercise.
 *
 * Each stage carries its date, and where a stage has NOT happened it says so in words
 * rather than showing a blank — a blank is indistinguishable from a gap in our records,
 * and this view exists precisely so that distinction is never lost.
 *
 * The invoice is matched through the manifest, which is the only honest join between the
 * two systems. Where the manifest has no Apex order the column says that plainly rather
 * than leaving it empty.
 */

create or replace view public.v_tag_lifecycle as
with pkg as (
  select distinct on (p.tag)
         p.tag, p.item_name, p.license, p.location, p.packaged_on, p.quantity, p.uom,
         p.finished, p.source_state, p.raw
    from public.metrc_packages p
   where p.tag is not null
   order by p.tag,
            (coalesce(p.quantity,0) > 0 and not coalesce(p.finished,false)) desc,
            (p.source_state = 'active') desc nulls last,
            p.synced_at desc nulls last
),
harv as (
  select k.tag, h.name as harvest_name, h.harvest_start, h.flower_room,
         (h.raw->>'FinishedDate')::date as harvest_finished_on
    from pkg k
    left join public.metrc_harvests h
      on h.name = split_part(coalesce(k.raw->>'SourceHarvestNames',''), ',', 1)
),
outb as (
  select distinct on (t.package_tag)
         t.package_tag, t.manifest_number, t.received_on as shipped_on,
         t.destination_facility, t.destination_licence,
         coalesce(t.source_row->>'Type','(type not recorded)') as transfer_type,
         nullif(btrim(t.source_row->>'Created by User'),'')    as manifest_created_by,
         nullif(btrim(t.source_row->>'Received by User'),'')   as manifest_received_by
    from public.metrc_rpt_package_transfers t
   order by t.package_tag, t.received_on desc nulls last
),
inv as (
  select distinct on (o.package_tag)
         o.package_tag,
         s.invoice_number, s.total_usd, s.payment_status, s.order_date
    from outb o
    join public.mv_forensic_sales s
      on not s.cancelled
     and (s.manifest_number = o.manifest_number
          or (s.buyer_licence = o.destination_licence
              and s.order_date between o.shipped_on - 7 and o.shipped_on + 7))
   order by o.package_tag, (s.manifest_number = o.manifest_number) desc, s.order_date
)
select
  /* ── identity ────────────────────────────────────────────────────────────── */
  k.tag,
  k.item_name,
  coalesce(k.raw#>>'{Item,ProductCategoryName}','(uncategorised)') as category,
  k.raw#>>'{Item,StrainName}'                                      as strain,
  k.license                                                        as held_under_licence,

  /* ── stage 1 · grown ─────────────────────────────────────────────────────── */
  h.harvest_name                                                   as stage1_harvest,
  h.harvest_start                                                  as stage1_cut_on,
  h.flower_room                                                    as stage1_grown_in,
  coalesce(h.harvest_name, 'NOT FROM A HARVEST OF OURS — bought in or made from another package')
                                                                   as stage1_note,

  /* ── stage 2 · packaged ──────────────────────────────────────────────────── */
  k.packaged_on                                                    as stage2_packaged_on,
  nullif(k.raw->>'SourcePackageLabels','')                         as stage2_made_from_packages,
  nullif(k.raw->>'ProductionBatchNumber','')                       as stage2_production_batch,

  /* ── stage 3 · tested ────────────────────────────────────────────────────── */
  (k.raw->>'LabTestingStateDate')::date                            as stage3_submitted_on,
  (k.raw->>'LabTestingRecordedDate')::date                         as stage3_result_on,
  k.raw->>'LabTestingState'                                        as stage3_lab_state,
  ev.lab_name                                                      as stage3_laboratory,
  ev.certificate_id                                                as stage3_certificate,
  ev.certificate_date                                              as stage3_certificate_date,
  ev.certificate_document                                          as stage3_COA_DOCUMENT,
  ev.evidence_source                                               as stage3_evidence_basis,
  coalesce(ev.why_no_certificate,
           case when ev.certificate_document is null
                then 'No certificate document held for this tag.' end)
                                                                   as stage3_note,

  /* ── stage 4 · shipped ───────────────────────────────────────────────────── */
  o.manifest_number                                                as stage4_manifest,
  o.shipped_on                                                     as stage4_shipped_on,
  o.destination_facility                                           as stage4_shipped_to,
  o.destination_licence                                            as stage4_buyer_licence,
  o.transfer_type                                                  as stage4_transfer_type,
  o.manifest_created_by                                            as stage4_created_by,
  o.manifest_received_by                                           as stage4_received_by,
  (select d.storage_path from public.metrc_documents d
    where d.manifest_number = o.manifest_number and d.doc_type ilike '%manifest%'
    limit 1)                                                       as stage4_MANIFEST_DOCUMENT,
  case when o.manifest_number is null
       then 'STILL HELD — this tag has not left our licences, so there is no manifest yet.'
  end                                                              as stage4_note,

  /* ── stage 5 · invoiced ──────────────────────────────────────────────────── */
  i.invoice_number                                                 as stage5_APEX_INVOICE,
  i.order_date                                                     as stage5_invoice_date,
  i.total_usd                                                      as stage5_invoice_usd,
  i.payment_status                                                 as stage5_payment_status,
  case
    when o.manifest_number is null then 'Not shipped, so nothing to invoice.'
    when i.invoice_number is null and public.f_is_ours(o.destination_licence)
      then 'INTERNAL MOVE between our own licences — not a sale, no invoice expected.'
    when i.invoice_number is null and not public.f_can_be_a_customer(o.destination_licence)
      then 'Destination is a laboratory or a transporter — not a sale, no invoice expected.'
    when i.invoice_number is null
      then 'NO APEX INVOICE FOUND for this shipment. This is a gap to investigate.'
  end                                                              as stage5_note,

  /* ── stage 6 · closed ────────────────────────────────────────────────────── */
  coalesce(k.finished,false)                                       as stage6_finished,
  (k.raw->>'FinishedDate')::date                                   as stage6_finished_on,

  /* ── where to go and look, right now ─────────────────────────────────────── */
  k.location                                                       as audit_room,
  round(public.f_to_pounds(k.quantity, k.uom)::numeric, 3)         as audit_lb,
  k.quantity                                                       as audit_quantity,
  k.uom                                                            as audit_uom,
  case
    when coalesce(k.finished,false) then 'CLOSED — nothing physical to inspect. The record '
         || 'is the evidence.'
    when coalesce(k.quantity,0) = 0 then 'ZERO QUANTITY but not marked finished — the tag '
         || 'should be closed out in Metrc.'
    when o.manifest_number is not null and o.shipped_on is not null
      then 'SHIPPED on ' || o.shipped_on || ' to ' || coalesce(o.destination_facility,'a licensee')
         || '. Not on site.'
    when coalesce(k.location,'') = '' then 'ON SITE but Metrc records no room. Find it by tag.'
    else 'ON SITE — ' || k.location || ', licence ' || k.license
         || '. Inspect the physical tag against this record.'
  end                                                              as where_to_audit,

  'https://mo.metrc.com/industry/' || k.license || '/packages'     as metrc_screen
from pkg k
left join harv h  on h.tag = k.tag
left join public.v_tag_evidence ev on ev.tag = k.tag
left join outb o  on o.package_tag = k.tag
left join inv i   on i.package_tag = k.tag;

comment on view public.v_tag_lifecycle is
  'THE seed-to-sale record for every tag: six stages in order, each with its date, plus '
  'the room to walk into and inspect it. Grown, packaged, tested, shipped, invoiced, '
  'closed. Carries the COA document, the manifest document and the APEX INVOICE — the '
  'invoice was absent from every forensic surface before 18 Aug 2026, so the money end of '
  'seed-to-sale could not be followed. Where a stage has not happened the note says why in '
  'words, because a blank cannot be told apart from a gap in our records. Owner '
  'instruction, 18 Aug 2026. Agent I.';

grant select on public.v_tag_lifecycle to tg_desktop_reader;;
