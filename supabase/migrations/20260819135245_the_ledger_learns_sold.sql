/* sold — THE SECOND MISSING EVENT TYPE, AND THE END OF THE SEED-TO-SALE LINE.
 *
 * shipped says the material left under a manifest. sold says money changed
 * hands for it, and carries the invoice. They are different facts and this
 * ledger needs both: a lab sample and an internal move both SHIP, and neither
 * is a sale.
 *
 * THE POPULATION IS THE HOUSE'S OWN DEFINITION, NOT A NEW ONE.
 * v_forensic_sold_by_tag already carries counts_as_sale, which encodes every
 * ruling the owner has made on this question — internal MC↔MP moves are not
 * sales, laboratory and transporter destinations are not customers, and a
 * transport leg is not a second sale of the same material. Re-deciding any of
 * that here would create a second definition of revenue, which is the defect
 * this platform counts. So: counts_as_sale only.
 *
 * WHERE AN INVOICE EXISTS the event carries its number and dollars. Where one
 * does not, the event is still written — the material really was sold — and
 * the absence is already a named gap (missing_invoice, 4,823 of them). An
 * event withheld because its paperwork is incomplete is a hole in the chain,
 * and a hole is worse than a documented gap. */

insert into public.tag_event
  (tag, event_at, event_type, stage, location, manifest_number, counterparty_licence,
   qty, uom, source, source_row)
select s.package_tag,
       s.shipped_on::timestamptz,
       'sold',
       'Sold',
       s.sold_by_facility,
       s.manifest_number,
       s.buyer_licence,
       s.pounds,
       case when s.pounds is not null then 'lb' end,
       'v_forensic_sold_by_tag:backfill_19aug2026',
       jsonb_build_object(
         'why', 'Sale event reconstructed during the ledger build, 19 Aug 2026. Population is '
             || 'v_forensic_sold_by_tag.counts_as_sale — the house definition that already '
             || 'excludes internal moves, laboratories, transporters and transport legs.',
         'buyer', s.buyer,
         'buyer_licence', s.buyer_licence,
         'manifest', s.manifest_number,
         'invoice', s.invoice_number,
         'invoice_usd', s.total_usd,
         'payment_status', s.payment_status,
         'invoice_match', s.invoice_match)
from v_forensic_sold_by_tag s
where s.counts_as_sale
  and s.package_tag is not null
  and s.shipped_on is not null
  and not exists (
    select 1 from tag_event e
     where e.tag = s.package_tag
       and e.event_type = 'sold'
       and e.manifest_number is not distinct from s.manifest_number)
on conflict do nothing;;
