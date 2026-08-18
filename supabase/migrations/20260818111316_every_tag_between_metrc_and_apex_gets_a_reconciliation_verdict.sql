/* Every tag between Metrc and Apex gets a reconciliation verdict.
 *
 * Owner, 18 Aug 2026: "EVERY TAG BETWEEN METRC AND APEX MUST BALANCE AND RECONCILE."
 *
 * The grain is the TAG on the Metrc side, because Metrc is the record of fact for
 * material movement; Apex is the record for money. Apex rarely records the Metrc tag on
 * its order lines (metrc_package_label is mostly null), so the honest join runs
 * tag -> manifest -> invoice, and the verdict says exactly which link held.
 *
 * Every outbound tag lands in exactly ONE verdict class, so the classes sum to the
 * whole and nothing can hide between categories:
 *   RECONCILED            sold to a customer, Apex invoice found
 *   NOT A SALE - INTERNAL our own other licence; Apex correctly has nothing
 *   NOT A SALE - LAB      testing sample, $0 declared; Apex correctly has nothing
 *   NOT A SALE - TRANSPORT a haulage leg; the sale reconciles at the destination
 *   PRE-INVOICE ERA       shipped before 30 Jan 2025, when Metrc carried no invoice
 *                         number and matching was impossible
 *   APEX HAS IT - JOIN    an order exists for the same party within 14 days on licence
 *                         DIGITS; the standing exact-match join misses it
 *   ABSENT FROM APEX      no order by any key - the genuine gap, expected to shrink
 *                         when the never-synced deal-docs endpoint lands
 *
 * Tags still on hand are not here: nothing to reconcile until they move.
 */

create or replace view public.v_metrc_apex_tag_reconciliation as
select s.package_tag,
       s.manifest_number,
       s.shipped_on,
       s.buyer,
       s.buyer_licence,
       round(coalesce(s.pounds,0)::numeric,3) as lb,
       s.invoice_number                        as apex_invoice,
       s.total_usd                             as apex_usd,
       s.payment_status,
       case
         when s.internal_transfer                      then 'NOT A SALE — INTERNAL MOVE'
         when s.is_transport_leg                       then 'NOT A SALE — TRANSPORT LEG'
         when not public.f_can_be_a_customer(s.buyer_licence)
                                                       then 'NOT A SALE — LABORATORY'
         when s.invoice_match = 'matched'              then 'RECONCILED'
         when s.shipped_on < date '2025-01-30'         then 'PRE-INVOICE ERA — matching impossible'
         when u.manifest_number is not null and u.diagnosis like 'LICENCE FORMAT%'
                                                       then 'APEX HAS IT — JOIN BROKEN (licence format)'
         else 'ABSENT FROM APEX — investigate (deal-docs endpoint never synced)'
       end as verdict,
       u.apex_candidate_invoice,
       u.apex_candidate_usd
from public.v_forensic_sold_by_tag s
left join public.v_unmatched_manifest_forensic u on u.manifest_number = s.manifest_number;

comment on view public.v_metrc_apex_tag_reconciliation is
  'Owner ruling 18 Aug 2026: every tag between Metrc and Apex must balance and reconcile. '
  'One verdict per outbound tag, classes exclusive so they sum to the whole. The join runs '
  'tag -> manifest -> invoice because Apex rarely records the Metrc tag itself. ABSENT '
  'verdicts are expected to shrink when deal-docs syncs. Agent I.';

grant select on public.v_metrc_apex_tag_reconciliation to tg_desktop_reader;;
