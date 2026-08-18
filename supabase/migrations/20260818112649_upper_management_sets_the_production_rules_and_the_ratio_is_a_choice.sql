/* Upper management sets the production rules, and the wet-to-dry ratio is a choice.
 *
 * Owner rulings, 18 Aug 2026, verbatim: "THE RULE IS WHAT UPPER MANAGEMENT SETS AND CAN
 * CHANGE, CURRENTLY WE ARE RUNNING: 2 MONTHLY HARVESTS EVERY OTHER WEEK; 180LBS REQUIRED
 * PER PULL; TABLES MUST BE MAXIMIZED. I AS OWNER SETS THESE AND I CAN CHANGE ALL. ALL
 * DATA MUST IN REAL TIME UPDATE." And on the ratio: "SET FOR 4.5 OR 4.17 AS WHAT WE CAN
 * SELECT FROM OR CHANGE. SET TO 4.5."
 *
 * The rules live in conversion_factors because everything that reads a rule reads it
 * through f_rule() LIVE — change the number on the Business Rules screen and every
 * schedule, forecast, assertion and tile moves at once. That is the real-time update the
 * owner demands: one definition, no copies to go stale.
 *
 * MEASURED AGAINST THE NEW RULE at creation: required output = 2 pulls x 180 lb = 360
 * lb/month. The August schedule carries 335.4 lb — 24.6 lb SHORT of the owner's floor —
 * while the forecast says 448.6. The schedule-vs-forecast tie (113.2 lb apart) remains a
 * cultivation-lane defect; both must reconcile to the RULE, which now exists to be
 * reconciled against.
 */

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
('required_lb_per_pull', 180, 'lb', 'Required output per pull',
 'Every harvest pull must yield at least this many pounds. Upper management sets it and '
 || 'may change it; every schedule, forecast and compliance check reads it live.',
 'Owner ruling, 18 Aug 2026: "180LBS REQUIRED PER PULL".', 'Owner', 'ruling',
 'With monthly_pulls_target this makes the monthly floor 360 lb. August schedule carries '
 || '335.4 lb — 24.6 lb short at the moment this rule was recorded.'),
('monthly_pulls_target', 2, 'pulls', 'Pulls per month',
 'The facility cadence: one room comes down every other week. Measured from Metrc on '
 || '17 Aug (13-14 day spacing) and now fixed as the rule.',
 'Owner ruling, 18 Aug 2026: "2 MONTHLY HARVESTS EVERY OTHER WEEK".', 'Owner', 'ruling',
 'Matches the measured cadence exactly.'),
('tables_maximized', 1, 'policy', 'Tables must be maximized',
 'Every flowering table is planted to capacity every cycle. A room turning with empty '
 || 'tables is a breach of this rule, not a scheduling choice.',
 'Owner ruling, 18 Aug 2026: "TABLES MUST BE MAXIMIZED".', 'Owner', 'ruling',
 'Boolean policy: 1 = enforced. Canopy/table utilisation checks read this before flagging.')
on conflict (key) do update
  set value = excluded.value, what_it_means = excluded.what_it_means,
      where_it_came_from = excluded.where_it_came_from, evidence_note = excluded.evidence_note;

/* The ratio: 4.5 SELECTED, 4.17 kept as the selectable measured alternative. */
update public.conversion_factors
   set evidence_note =
       'OWNER SELECTED 4.5 on 18 Aug 2026 from the two defensible values: 4.5 (commercial '
       || 'indoor standard, his ruling of 17 Aug) and 4.17 (measured from our own extraction '
       || 'runs, held in fresh_frozen_wet_to_dry_measured). Change the selection here and '
       || 'every dry-equivalent figure moves live. Never show 4.17-derived figures as the '
       || 'headline while 4.5 is selected.'
 where key = 'fresh_frozen_wet_to_dry';

insert into public.conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
('fresh_frozen_wet_to_dry_measured', 4.17, 'ratio', 'Wet-to-dry, measured alternative',
 'The wet-to-dry ratio our own extraction runs actually produce. NOT the selected value — '
 || 'the owner selected 4.5. Kept so the choice is between two named numbers rather than a '
 || 'number and a guess.',
 'Measured from extraction output; surfaced on the fresh-frozen tile caveat.',
 'Owner', 'measured',
 'To switch the platform to the measured ratio, copy this value into '
 || 'fresh_frozen_wet_to_dry. One change, everything follows.')
on conflict (key) do update set evidence_note = excluded.evidence_note;;
