/* adjusted — THE THIRD MISSING EVENT TYPE, AND THE ONE AN AUDITOR ASKS ABOUT.
 *
 * An adjustment is where weight appears or disappears without a transfer: waste,
 * moisture correction, a recount, a spill. It is the event most likely to be
 * questioned and, until now, the only one this ledger could not show. A tag
 * whose quantity changed with no adjustment event looks like an unexplained
 * loss even when the reason was recorded in Metrc all along.
 *
 * SOURCE: metrc_rpt_adjustments — 4,414 rows, each carrying Metrc's OWN reason
 * text and note. Both travel onto the event verbatim. The reason is the whole
 * point: "moisture loss" and "product destroyed" are different findings, and an
 * event that flattens them into "adjusted" answers nothing.
 *
 * SIGN IS PRESERVED, NOT ABSOLUTED. Metrc records a reduction as a negative
 * quantity. Storing the magnitude would make a loss and a gain identical in the
 * ledger, which is precisely the confusion this event exists to remove. */

insert into public.tag_event
  (tag, event_at, event_type, stage, qty, uom, source, source_row)
select a.package_tag,
       a.adjusted_on::timestamptz,
       'adjusted',
       case
         when a.reason ilike '%waste%'      then 'Waste recorded'
         when a.reason ilike '%moisture%'   then 'Moisture correction'
         when a.reason ilike '%destr%'      then 'Destroyed'
         when a.reason ilike '%theft%'      then 'Reported theft'
         when a.reason ilike '%count%'      then 'Recount'
         else 'Adjusted'
       end,
       a.quantity,
       a.uom,
       'metrc_rpt_adjustments:backfill_19aug2026',
       jsonb_build_object(
         'why', 'Adjustment event reconstructed from the Metrc adjustments report during the '
             || 'ledger build, 19 Aug 2026. Quantity keeps Metrc''s SIGN: a reduction is negative, '
             || 'because a loss and a gain must never look identical in a ledger.',
         'reason', a.reason,
         'note', a.note,
         'adjusted_by', a.adjusted_by,
         'item', a.item,
         'licence', a.licence)
from metrc_rpt_adjustments a
where a.package_tag is not null
  and a.adjusted_on is not null
  and not exists (
    select 1 from tag_event e
     where e.tag = a.package_tag
       and e.event_type = 'adjusted'
       and e.event_at = a.adjusted_on::timestamptz
       and e.qty is not distinct from a.quantity)
on conflict do nothing;