-- Agent I, 13 Aug 2026. DBI-101.
-- OWNER RULING, verbatim: "zen is licensing fee treat and track seperate".
--
-- Supersedes the tolling classification I recorded an hour ago. The arrangement is a LICENSING
-- FEE, not a manufacturing service and not a product sale, and that changes the money treatment
-- entirely - which is exactly why it must not be guessed at.
--
-- WHY THIS MATTERS UNDER 280E AND IS NOT BOOKKEEPING. COGS is the only surviving deduction, and a
-- licensing fee is NOT cost of goods sold under any reading:
--   * a fee we PAY is an ordinary business expense and therefore NOT DEDUCTIBLE - real cash out
--     with no tax shield. It must never be absorbed into inventory cost to make it look
--     deductible; that is the 471 boundary the doctrine already draws.
--   * a fee we RECEIVE is ordinary income, and the 13,635 units were never our inventory to sell,
--     so carrying them as finished goods overstates both stock and cost of sales.
--
-- THE DIRECTION IS NOT RECORDED AND I AM NOT INFERRING IT. "we manufacture for them" and "zen is
-- licensing fee" are both true and fit either direction: we may license the ZEN brand from them,
-- or they may pay us for the licence to have it made here. The tax consequence FLIPS on that one
-- fact, and the doctrine's own rule agents-do-not-take-positions says an agent substantiates and
-- does not opine. Marked unresolved deliberately, not filled with the likelier answer.
--
-- V2: v1 inserted the two new columns mid-list; create-or-replace cannot reorder view columns.
-- Appended at the end instead - the same append-only rule that has bitten me three times today.
--
-- STILL TRUE: 120 held tags, 13,635 units, all Infused (edible), made by Twisted Growers LLC
-- under MP281909, packaged Jan-Aug 2026. Metrc counts them against our licence and that stays
-- correct, because Metrc tracks CUSTODY.
--
-- NO PUBLISHED FIGURE MOVES pending the owner's and the CPA's answer on direction.
-- UNDO: set relationship back to 'tolling'; drop the two columns.

alter table manufacturing_client
  add column if not exists fee_direction text
    check (fee_direction in ('we_pay_them','they_pay_us','unresolved'));
alter table manufacturing_client
  add column if not exists money_treatment text;

update manufacturing_client
   set relationship = 'licensing_fee',
       fee_direction = 'unresolved',
       money_treatment =
         'LICENSING FEE — not product revenue, not a manufacturing service fee, and NOT cost of '
         'goods sold. Owner ruling 13 Aug 2026: "zen is licensing fee treat and track seperate". '
         'DIRECTION UNRESOLVED and to be settled by the owner with the CPA before any figure is '
         'published, because the 280E consequence flips on it: a fee WE PAY is an ordinary '
         'expense and therefore not deductible, and must never be absorbed into inventory cost to '
         'make it appear so; a fee THEY PAY US is ordinary income, and the 13,635 units were '
         'never our inventory, so carrying them as finished goods overstates stock and cost of '
         'sales. Until settled, the units are tracked separately and NO money figure is derived '
         'from them.',
       why = why || ' | SUPERSEDED 13 Aug 2026: the owner ruled this is a LICENSING FEE, not '
             'tolling. Recorded verbatim: "zen is licensing fee treat and track seperate".'
 where client_key = 'zen';

comment on column manufacturing_client.fee_direction is
 'Who pays whom. ''unresolved'' is a real and honest value here, not a gap for whoever next needs '
 'a number to fill in — under 280E the deductibility of the fee turns entirely on it, and the '
 'doctrine rule agents-do-not-take-positions forbids an agent settling it.';

comment on column manufacturing_client.money_treatment is
 'How the money is treated, in plain English, so nobody reconstructs it from the arrangement and '
 'gets it wrong. A licensing fee is never COGS.';

create or replace view public.v_manufacturing_client_stock as
select coalesce(mc.client_name, 'Twisted Growers')                as brand_owner,
       coalesce(mc.client_key, 'tg')                              as brand_owner_key,
       case when mc.client_key is null then 'ours'
            else 'separate — ' || mc.relationship end             as ownership_basis,
       s.package_tag, s.item_name, s.stream, s.license,
       s.pounds, s.units, s.quantity_shown, s.packaged_on, s.location,
       s.evidence_source, s.certificate_document, s.certificate_grade,
       mc.their_licence                                           as client_licence,
       case when mc.client_key is not null then
         'Made here for ' || mc.client_name || ' under our own licence ' || mc.we_make_it_under ||
         ' on a LICENSING FEE arrangement — owner ruling 13 Aug 2026, tracked separately as if a '
         'third licence. Metrc counts it against us and that is correct, because Metrc tracks '
         'custody. A licensing fee is NOT cost of goods sold, and who pays whom is still ' ||
         coalesce(mc.fee_direction,'unrecorded') || ' — no money figure may be derived from these '
         'units until the owner and the CPA settle it.'
       end                                                        as what_this_means,
       -- appended 13 Aug 2026, DBI-101
       mc.fee_direction,
       mc.money_treatment
from v_stock_packages s
left join manufacturing_client mc
  on s.item_name ~* mc.item_name_pattern;;
