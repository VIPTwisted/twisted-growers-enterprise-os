/* THE FIRST MISSING EVENT TYPE — AND THE LEDGER ALREADY HAD A NAME FOR IT.
 *
 * The charter lists transfer_out, sale and adjustment among six missing event
 * types. The check constraint on tag_event says otherwise: it has ALWAYS
 * permitted 'shipped', 'sold', 'adjusted' and 'trade'. The vocabulary was
 * designed and then never populated — zero rows of each — which is why the
 * gap engine reported them missing. It was right that the FACTS were missing
 * and wrong about the NAMES.
 *
 * Owner instruction, same day: "always use names as found in Metrc, Apex,
 * QuickBooks, Monday, our spreadsheets to mirror integrations" and use the
 * names already in our current build. So this uses 'shipped', not
 * 'transfer_out'. Inventing a second name for a concept the schema already
 * names is exactly how a platform ends up with two words for one thing.
 *
 * THE THREE GENUINELY NEW TYPES — planting, harvest, destruction — describe
 * PLANT life, which this ledger has never carried, and they are added to the
 * constraint here so the remaining backfills have somewhere to land.
 *
 * shipped: 14,661 outbound lines over 14,583 tags from v_transfer_line, the
 * house's single definition of a transfer line. A tag on more than one
 * outbound line is real (material returned and re-shipped), so the dedupe key
 * includes the manifest. Where the report holds no weight qty is NULL, never
 * zero — zero is a measurement, absence is not. */

alter table public.tag_event drop constraint if exists tag_event_event_type_check;
alter table public.tag_event add constraint tag_event_event_type_check
  check (event_type = any (array[
    'packaged','received','shipped','tested','location_change','sold','trade','adjusted',
    'planting','harvest','destruction']));

comment on constraint tag_event_event_type_check on public.tag_event is
  'The ledger vocabulary. shipped/sold/adjusted/trade were designed long before they were ever '
  'written and are the house names for the charter''s transfer_out/sale/adjustment — one concept, '
  'one word. planting, harvest and destruction were added 19 Aug 2026 for plant life, which this '
  'ledger had never carried.';

insert into public.tag_event
  (tag, event_at, event_type, stage, location, manifest_number, counterparty_licence,
   qty, uom, source, source_row)
select l.package_tag,
       l.received_on::timestamptz,
       'shipped',
       'Left the facility',
       l.origin_facility,
       l.manifest_number,
       l.dest_licence,
       l.pounds,
       case when l.pounds is not null then 'lb' end,
       'v_transfer_line:backfill_19aug2026',
       jsonb_build_object(
         'why', 'Custody event reconstructed from the transfer report during the ledger build, '
             || '19 Aug 2026: the tag left our licence under this manifest and the event ledger '
             || 'held no record of it leaving.',
         'manifest', l.manifest_number,
         'to_facility', l.dest_facility,
         'to_licence', l.dest_licence,
         'transfer_type', l.transfer_type,
         'weight_source', l.weight_source)
from v_transfer_line l
where l.direction = 'OUTBOUND'
  and coalesce(l.voided,'False') <> 'True'
  and l.package_tag is not null
  and l.received_on is not null
  and not exists (
    select 1 from tag_event e
     where e.tag = l.package_tag
       and e.event_type = 'shipped'
       and e.manifest_number is not distinct from l.manifest_number)
on conflict do nothing;;
