/* Tighten the basis guard before it cries wolf.
 *
 * The first version flagged 10 columns. SEVEN were false positives of my own making:
 * value_per_unit, price_per_unit, cost_per_unit, sell_price_per_unit,
 * conversion_cost_per_unit, contribution_per_unit. Those mean DOLLARS PER UNIT — a rate,
 * with the unit as the denominator. They are not claiming that mixed units were
 * normalised before summing, which is what the check tests for.
 *
 * Shipping that would have been the precise disease diagnosed an hour earlier on the
 * dried-flower contract: a guard reporting correct figures as broken, which teaches
 * people to scroll past it, and the next thing it raises goes with them. A guard is
 * allowed to be incomplete. It is not allowed to be wrong.
 *
 * normalised_unit now excludes anything whose name carries price, cost, value, margin,
 * rate or revenue — a currency rate per unit is a different statement from a weight made
 * comparable. input_grams_per_unit is also excluded: it already names its unit (grams),
 * which is the opposite of the ambiguity being hunted.
 *
 * The three dry_equivalent hits SURVIVE the tightening and are real:
 *   v_harvest_mass_ledger.line_3_dry_weight_available
 *   v_room_contents.unpackaged_dry_equiv_low
 *   v_room_contents.unpackaged_dry_equiv_high
 * Each names a dry figure and none references fresh_frozen_wet_to_dry. They are recorded
 * as findings rather than silently corrected, because v_room_contents and the mass ledger
 * feed cultivation planning and changing a weight there without the cultivation lane
 * seeing it is how a number moves under someone.
 */

update public.basis_claim
   set name_pattern = '(normalis|normaliz|comparable)',
       what_it_means =
         'The figure claims mixed units were made comparable before summing. Metrc holds '
         || 'grams for some packages and each for others; summing them raw invents a number.',
       how_to_correct =
         'Convert through f_to_pounds() using each row''s own unit, or keep the measures '
         || 'separate. Vapes, edibles and seeds have no defensible pound equivalent and must '
         || 'stay in units. NOTE: a name like price_per_unit is a RATE — dollars per unit — '
         || 'and is deliberately outside this check. Do not widen the pattern to catch it; '
         || 'the first version did and produced seven false positives in one pass.'
 where claim = 'normalised_unit';

/* Raise the three real ones. Fingerprinted, so a running fault is one open item. */
insert into public.watchdog_findings (
  observed_at, fingerprint, severity, what, where_it_is, who_is_accountable,
  when_it_started, why_it_matters, how_it_was_detected, what_to_do,
  the_arithmetic, evidence, record_count, solutions, guard_recommendation)
select now(),
       'basis_claim_unhonoured|' || a.relation || '.' || a.column_name,
       'elevated',
       a.relation || '.' || a.column_name || ' is named as a dry figure but its definition '
         || 'never applies the wet-to-dry conversion.',
       'View ' || a.relation || ', column ' || a.column_name || '.',
       'Agent I, Database COO — cultivation lane to confirm the intended basis.',
       'Unknown; the column has carried this name since it was written. Detected 17 Aug 2026 '
         || 'by the basis-claim audit built the same day.',
       'A figure whose label asserts dry weight while its arithmetic holds wet weight '
         || 'overstates saleable material. The same defect on the Command Center total put '
         || '325.3 lb of water into a dry-equivalent figure: fresh frozen is 418.3 lb wet and '
         || '93.0 lb dry at the owner''s 4.5:1.',
       'v_basis_claim_audit compared the column name against its own view definition and '
         || 'found no reference to fresh_frozen_wet_to_dry.',
       'Confirm with cultivation whether this figure is meant to be dry-equivalent. If yes, '
         || 'apply f_rule(''fresh_frozen_wet_to_dry'') to the fresh frozen portion. If it is '
         || 'genuinely a wet figure, RENAME it so the label stops asserting otherwise.',
       'Fresh frozen 418.3 lb wet / 4.5 = 93.0 lb dry. Any total that skips this carries '
         || '325.3 lb of water.',
       jsonb_build_object('relation', a.relation, 'column', a.column_name, 'claim', a.claim),
       1,
       array[
         'Apply the conversion to the fresh frozen portion and keep the name.',
         'Rename the column to say wet, if wet is what it means — a correct name is a valid fix.',
         'Split into two columns as v_stock_on_hand now does: weight as held, and dry-equivalent.'],
       'Do not rename purely to silence the audit. Renaming is only correct if the figure '
         || 'really is wet; if cultivation is reading it as dry, the arithmetic is the thing '
         || 'that has to change.'
from public.v_basis_claim_audit a
where not a.honours_the_claim and a.claim = 'dry_equivalent'
on conflict do nothing;;
