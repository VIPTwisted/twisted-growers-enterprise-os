/* The 11-package difference is named and explained, not suppressed.
 *
 * After time-aligning the harvest reconciliation, two of the three "unexplained
 * differences" balanced to zero and this one survived: API 840 packages against the
 * report's 829, on the same 380 harvests.
 *
 * It is not an error and not a rounding artefact. package_count is a MUTABLE attribute —
 * it rises every time another package is pulled off a harvest — and the report is a
 * photograph taken on 6 August. All SEVEN harvests that differ are still OPEN:
 *
 *   TG Blueberry Muffin #4 - 20260407 F4   API 13  report  9   +4   open 132 days
 *   TG Orange Cream - 20260608 f4          API  5  report  3   +2
 *   TG Glitter Bomb - 20260608 f4          API  3  report  2   +1
 *   TG Gush Mintz - 20260629 F1            API  8  report  7   +1
 *   TG Spec Ops - 20260727f3               API  1  report  0   +1
 *   TG Apple Fritter - 20260608 f4         API  5  report  4   +1
 *   TG Lemon Drop - 20260713 f2            API  2  report  1   +1
 *
 * Every one is API-higher, the only direction packaging can move. Not one FINISHED
 * harvest differs, and that is the line worth watching: a finished harvest changing its
 * package count has no innocent explanation.
 *
 * Recorded as an exception rather than engineered away, because that is what
 * reconciliation_exception is for — "the standard is not that no two numbers ever differ,
 * it is that no difference is UNEXPLAINED". Widening a tolerance or filtering open
 * harvests out of the comparison would have hidden the very case that must be caught.
 *
 * It closes itself as those harvests are finished out, and a NEW exception would be
 * required the moment a finished one drifts.
 */

insert into public.reconciliation_exception
  (fact, amount, unit, what_differs, why_it_differs, is_it_an_error, owner, raised_on, evidence_sql)
values
  ('Harvest package count', 11, 'packages',
   'metrc_harvests.package_count is 840 against metrc_rpt_harvests.package_count of 829, '
   || 'on the same 380 harvests, after both sides are aligned to the report as_of_date of '
   || '6 Aug 2026. Seven harvests account for all 11 and every one is API-higher.',
   'package_count is a mutable attribute, not a historical fact. It rises as a harvest is '
   || 'packaged out. The report is a point-in-time export taken 6 Aug 2026; the API was last '
   || 'synced 17 Aug. All seven harvests that differ are STILL OPEN, so packages created in '
   || 'those eleven days appear in the live count and cannot appear in the photograph. '
   || 'TG Blueberry Muffin #4 from 7 April is 4 of the 11 on its own and has been open 132 '
   || 'days. Zero FINISHED harvests differ. It would become an error the day one does, and '
   || 'v_cross_source_reconciliation now tests for exactly that.',
   'no',
   'Agent I, Database COO',
   current_date,
   'select h.name, h.source_state, h.package_count as api, r.package_count as report '
   || 'from metrc_harvests h join metrc_rpt_harvests r on r.harvest_name = h.name '
   || 'where coalesce(h.package_count,0) <> coalesce(r.package_count,0) '
   || 'order by (h.package_count - r.package_count) desc');;
