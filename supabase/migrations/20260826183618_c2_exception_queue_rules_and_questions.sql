insert into conversion_factors
  (key, value, unit, label, what_it_means, where_it_came_from, set_by, updated_at,
   evidence_status, evidence_note)
values
  ('harvest_residual_outlier_min_pct', 46.2, 'percent',
   'Residual below this is an outlier',
   'A dried harvest whose residual (wet minus waste minus packaged) is below this share of its wet weight is outside the bottom of our own measured spread. It means more mass came off as packages than the water loss allows - the packaged weight is carrying water.',
   'MEASURED 26 Aug 2026 from metrc_harvests (Metrc API mirror), 263 closed, packaged, non-fresh-frozen harvests: p05 46.2, p10 57.6, median 74.2, p90 82.9, p95 86.1, wet-weighted mean 74.83 percent. That wet-weighted mean reproduces the locked moisture_loss_goal_pct of 74.91 to within 0.08 points on a slightly different population, which is the cross-check. The 5th percentile is used rather than the owner-set expected band because the expected band (70-77) is an expectation and flags 173 of 265 harvests when used as a threshold.',
   'Agent I (Claude), ticket C2 - measured, owner may change', now(),
   'measured',
   'Re-measurable at any time: percentile_cont over metrc_harvests where f_harvest_weight_basis(...) <> ''wet''. Owner has not ruled on this cut. See open_questions key harvest_residual_outlier_cuts.'),
  ('harvest_residual_outlier_max_pct', 86.1, 'percent',
   'Residual above this is an outlier',
   'A dried harvest whose residual is above this share of its wet weight is outside the top of our own measured spread. It means too little came off the harvest - weight was written off at finish that exceeds anything we have ever lost to drying.',
   'MEASURED 26 Aug 2026 from metrc_harvests (Metrc API mirror), 263 closed, packaged, non-fresh-frozen harvests: p05 46.2, p10 57.6, median 74.2, p90 82.9, p95 86.1, wet-weighted mean 74.83 percent. Same population and same cross-check as harvest_residual_outlier_min_pct.',
   'Agent I (Claude), ticket C2 - measured, owner may change', now(),
   'measured',
   'Re-measurable at any time. Owner has not ruled on this cut. See open_questions key harvest_residual_outlier_cuts.')
on conflict (key) do nothing;

insert into open_questions
  (question_key, area, question, why_it_matters, what_is_blocked, first_seen, last_seen, exposure_lb, status)
values
  ('harvest_residual_outlier_cuts', 'Cultivation',
   'The moisture exception queue flags a dried harvest when its residual falls outside 46.2% to 86.1% of wet weight. Those are the 5th and 95th percentiles of our own 263 closed harvests. Are those the right cuts, or do you want them tighter or wider?',
   'The owner-set expected band of 70-77% is what a harvest SHOULD do. Used as an exception threshold it flags 173 of 265 dried harvests, which nobody can work through. The percentile cuts flag 26. Whichever you choose, the number of harvests the floor has to investigate changes by a factor of six.',
   'v_xq_harvest_moisture severity ranking',
   now(), now(), null, 'open'),
  ('untested_intermediates_in_production_rooms', 'Quality',
   'Metrc holds 91 live packages that were never submitted for testing and are sitting in the Hydrocarbon and Solventless extraction rooms, some for over 900 days. Is an in-process concentrate expected to stay NotSubmitted until it is made into a finished product, or should each of these have been tested?',
   'It decides whether 91 of the 130 never-submitted packages are a normal in-process state or a compliance gap. The queue cannot rank them honestly without the answer, so it currently reports the room and leaves the judgement to you.',
   'v_xq_never_submitted severity ranking',
   now(), now(), null, 'open'),
  ('failed_material_disposition_backfill', 'Quality',
   'Metrc shows 139 packages that failed testing, are now finished with zero quantity, and have no disposition recorded against them. The material is gone. Do you want the disposition backfilled for the record, or are historical failures before the disposition register existed treated as closed?',
   'Massachusetts expects a record of what happened to failed material. Right now the platform can prove 139 packages failed and cannot say what was done with them.',
   'v_xq_failed_no_disposition backlog handling',
   now(), now(), null, 'open')
on conflict (question_key) do nothing;;
