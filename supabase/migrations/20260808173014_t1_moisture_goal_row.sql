-- The GOAL half of the owner's ruling: "i could add goal if suggested." An editable row
-- (G1), read by the view through f_rule() (G4). The measured actual sits beside it; the
-- goal never overwrites the measurement.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values
  ('moisture_loss_goal_pct', 73.5, '%',
   'Moisture loss goal',
   'The drying loss we AIM for, shown beside the measured actual so drift is visible. It never replaces the measurement.',
   'Owner-set 6 Aug 2026 on a measured 73.5% weighted across the harvests that actually dried. Re-measured independently 8 Aug 2026 at 72.8% across 276 finished dried harvests (34,082 lb wet, 24,826 lb evaporated) - the two agree to within 0.7 points.',
   'Owner (Vinny), 6 Aug 2026',
   'measured',
   'Validated against fresh frozen as a control group: the identical calculation returns 1.2% for material that never dries, versus 72.8% for material that does. The residual is therefore real and not an artifact of the formula. The published 75-80% band came from external guidance, not our harvests.')
on conflict (key) do update set
  value = excluded.value, unit = excluded.unit, label = excluded.label,
  what_it_means = excluded.what_it_means, where_it_came_from = excluded.where_it_came_from,
  set_by = excluded.set_by, evidence_status = excluded.evidence_status,
  evidence_note = excluded.evidence_note, updated_at = now();;
