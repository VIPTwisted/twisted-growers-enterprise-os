-- Rule G1: nothing is hardcoded. Owner, 8 Aug 2026: "these must be editable by us not set
-- in stone." Both numbers below were literals inside the T3 view; they are now rows an
-- authorised user changes on Settings -> Business Rules, and the view reads them through
-- f_rule() (rule G4).
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('pull_link_window_days', 7, 'days',
   'Harvest-to-pull matching window',
   'How many days either side of a planned pull date a Metrc harvest can fall and still count as part of that pull. Fresh-frozen material is taken down a few days before the dried harvest, so the window must cover both.',
   'Measured 8 Aug 2026: all 95 of the 2026 harvests fall within 7 days of a planned pull. Pulls are 14 days apart, so a 7-day window partitions the year with no overlap and no ambiguity. Raising it above 7 would let one harvest match two pulls.',
   'Agent — measured, owner may change',
   'measured',
   'Derived from the actual spread of 95 harvests against 26 planned pulls. Re-measure before changing: above 7 the matching becomes ambiguous.'),
  ('pull_target_dried_lb', 380, 'lb',
   'Target dried flower per pull',
   'What one pull is expected to produce in dried flower (bud), excluding fresh frozen. Used to judge whether a pull under-performed.',
   'Owner, 8 Aug 2026, stated in session: "Expected weight from every pull is 380lbs dried flower." NOT independently verified — the 2026 harvest calendar projects 113–159 lb dried per pull, and the best pull measured so far is a floor of 275.3 lb. Recorded as the owner target, not as a locked fact.',
   'Owner (Vinny), 8 Aug 2026',
   'owner_set',
   'CONTESTED against the company''s own harvest calendar. See brain/DECISIONS.md 8 Aug 2026 and CRITICAL_BOARD T3. Measured per-pull figures are a FLOOR: 44% of packages draw on more than one harvest and are not yet apportioned.')
on conflict (key) do update set
  value = excluded.value, unit = excluded.unit, label = excluded.label,
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  set_by = excluded.set_by, evidence_status = excluded.evidence_status,
  evidence_note = excluded.evidence_note, updated_at = now();;
