-- OWNER RULING, 10 Aug 2026: "IF ROUNDING IS 1.00 OR LESS FOR ROUNDING ITS FINE BOOK WHAT
-- APEX SAYS", and a same-session allowance to widen to 5.00 "if needed, just for this run".
--
-- IT WAS NOT NEEDED, AND THE MEASUREMENT IS WHY. On the 861 invoices where the number maps
-- one-to-one, widening the tolerance from $1.00 to $5.00 reconciles THREE more invoices and
-- absorbs $6.90. 663 -> 666, with 195 still open either way. Loosening a money tolerance to
-- buy three rows is rounding until totals tie, at small scale, and the rule against that does
-- not have a size exemption. Held at $1.00. The allowance is recorded here so the decision not
-- to use it is visible rather than looking like it was never offered.
--
-- source_precedence was the obvious home for the precedence half and is the WRONG one: its
-- CHECK allows only report | api | conflict, because it was built for Metrc-report-versus-
-- Metrc-API. Widening another department's constraint to fit a case it was not designed for
-- is how a table stops meaning what its name says. figure_of_record already answers exactly
-- this question - which source states a figure, and what cross-checks it.
--
-- UNDO: delete from conversion_factors where key='apex_metrc_rounding_tolerance_usd';
--       delete from figure_of_record where figure_key='sales_revenue';

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values (
  'apex_metrc_rounding_tolerance_usd', 1.00, 'USD',
  'Apex vs Metrc declared value: rounding tolerance',
  'An absolute difference of this much or less between the Apex order subtotal and the Metrc '
  'declared amount for the same invoice is ROUNDING, and Apex is the figure booked. Outside it '
  'the two genuinely disagree, the row stays open, and a person names the reason.',
  'Owner ruling 10 Aug 2026 on measured data: of 861 one-to-one invoices, 650 agree to the exact '
  'cent and 13 more sit inside $1.00. The owner authorised up to $5.00 for this run; measurement '
  'showed $5.00 buys only 3 further invoices and $6.90, so it was not used.',
  'Owner, 10 Aug 2026', 'owner_set',
  'ABSOLUTE dollars, never a percentage. A percentage tolerance grows with the order and would '
  'silently swallow a $500 difference on a $50,000 shipment - the largest single gap currently '
  'open is $55,181.00.')
on conflict (key) do update
  set value = excluded.value, what_it_means = excluded.what_it_means,
      where_it_came_from = excluded.where_it_came_from, set_by = excluded.set_by;

-- A SECOND revenue figure, deliberately not a replacement. wholesale_revenue is what Metrc was
-- TOLD; sales_revenue is what was SOLD. Both are real, they answer different questions, and
-- conflating them is how $1,317,836 of purchases was once read as revenue.
insert into figure_of_record (figure_key, source_table, source_column, title, why_this_one, cross_check_table, cross_check_column, reconciled_by)
values (
  'sales_revenue', 'apex_raw', 'payload->>subtotal_raw',
  'Sales revenue (what was sold)',
  'Apex is the sales source of record; Metrc is the compliance source of record; neither '
  'corrects the other. Metrc holds the DECLARED TRANSFER PRICE - a regulatory filing, not the '
  'commercial terms - so it legitimately differs from what was actually sold, and it must be '
  'labelled "declared" everywhere it appears. Owner ruling 10 Aug 2026: inside the '
  'apex_metrc_rounding_tolerance_usd row, book Apex. Outside it, the disagreement IS the '
  'finding and is never averaged or silently resolved. '
  'UNITS: subtotal_raw is in MINOR UNITS - divide by conversion_factors '
  'apex_money_raw_minor_units. Reading it as dollars states $647,044,908 for a business that '
  'sold $6,471,357.08, and verification_checks.apex_money_unit re-proves the factor against '
  'Apex''s own display twin on every run.',
  'metrc_rpt_wholesale', 'amount',
  'v_apex_order_metrc_link')
on conflict (figure_key) do nothing;

select figure_key, title, source_table, cross_check_table, reconciled_by from figure_of_record order by figure_key;;
