-- CORRECTION, 9 Aug 2026. I set pull_target_dried_lb = 380 yesterday on the owner saying
-- "expected weight from every pull is 380 lbs dried flower". brain/LESSONS.md already held
-- the resolution and I had not read it:
--
--   "The owner set targets of '380k monthly / 180k per pull' without stating a unit. Agent D
--    reconciled them as DOLLARS and showed arithmetic that closed to within 2%. It looked
--    airtight. It was a numerical coincidence, and the owner confirmed the unit is POUNDS.
--    The correct reading is 380 lb per month, 180 lb per room pull, which closes even better:
--    1,140 plants x 70.6 g = 177.4 lb ~ 180 lb, x 2.17 pulls per month = 385 lb ~ 380 lb."
--
-- So 380 is the MONTHLY figure across all rooms, and the per-pull figure is 180. Comparing
-- every pull against 380 made a fleet that is largely ON TARGET look like it was missing by
-- half - the same shape as the grams-per-plant against grams-per-square-foot error that was
-- wrong by six times. The arithmetic reconciles against the locked 70.6 g/plant target, which
-- is the check that should have been run before writing the row.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('pull_target_dried_lb', 180, 'lb',
   'Target dried flower per room pull',
   'What ONE room pull is expected to produce in dried flower, excluding fresh frozen.',
   'Owner target "180k per pull", unit confirmed as POUNDS (brain/LESSONS.md, 7 Aug 2026). Reconciles against the locked facts: 1,140 plants x 70.6 g/plant target = 177.4 lb, which rounds to 180.',
   'Owner (Vinny)',
   'measured',
   'Derived from two locked facts rather than asserted. Measured against it, 2026 pulls run 28.9-275.3 lb and several BEAT it - pull 2 at 275.3, pull 9 at 254.3, pull 7 at 253.4. Per-pull figures remain a FLOOR: 44% of packages draw on more than one harvest and are not yet apportioned.'),
  ('monthly_target_dried_lb', 380, 'lb',
   'Target dried flower per month, all rooms',
   'What the whole facility is expected to produce in dried flower in a month, across all four rooms.',
   'Owner target "380k monthly", unit confirmed as POUNDS (brain/LESSONS.md, 7 Aug 2026). Reconciles: 180 lb per pull x 2.17 pulls per month = 385 lb.',
   'Owner (Vinny)',
   'measured',
   'The 14-day cadence gives roughly 2.17 pulls per month across the four rooms. Judge the facility on this figure and a single room pull on pull_target_dried_lb; comparing one pull against 380 understates performance by more than half.')
on conflict (key) do update set
  value = excluded.value, unit = excluded.unit, label = excluded.label,
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  set_by = excluded.set_by, evidence_status = excluded.evidence_status,
  evidence_note = excluded.evidence_note, updated_at = now();;
