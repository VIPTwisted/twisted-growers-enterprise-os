-- Agent B, 13 Aug 2026. The six Cultivation contracts point at the rows the
-- page now actually opens.
--
-- WHAT AGENT V MEASURED AND REGISTERED AS EXPECTED-DISAGREE. The Cultivation
-- dashboard passed NO in-place handler to the shared key-figure strip, so every
-- tile fell through to go(drill) — a view key with no filter channel — and
-- ReportScreen clears every filter on arrival. Five of six figures opened a
-- population that was not their own, the worst of them landing on the pull
-- schedule page, which holds schedule EVENTS and not harvests, so the count
-- could not be found there under any filter.
--
-- WHAT CHANGED. The front end now opens each figure's own records IN PLACE from
-- the view the figure is COMPUTED from, with the figure's own served predicate,
-- and the general report stays one press further in. Every drill_sql below is
-- the sum or count of exactly the rows that drill now lists, so a wrong filter
-- in the page reads DISAGREE rather than shipping as a quietly wrong list.
--
-- NO TOLERANCE IS WIDENED. Every one is left exactly where Agent V set it.
--
-- TWO PREDICATES ARE WRITTEN IN THE VIEW'S OWN VOCABULARY, because the client's
-- filter channel takes one operator and one value and has no three-argument
-- negation. Both were measured equivalent before use, and both are recorded
-- here so an inequivalence becomes a finding:
--   dry_days_to_first_package >= 0   is "a dry time was recorded". The column is
--     a day count, minimum observed 1, and >= 0 selects 361 rows against 361
--     for IS NOT NULL, averaging 33.4 both ways.
--   harvest_state = 'Finished'       is "the harvest is closed". Measured
--     against harvest_closed IS NOT NULL over every row of v_harvest_forensic:
--     zero rows differ, 357 either way, average conversion 33.9 either way.
--
-- ONE THING THIS MIGRATION DOES NOT DO: it changes no published figure. Where a
-- tile's NUMBER is arguable rather than its drill, that goes through
-- correction_proposal.

update tile_drill_contract set
  drill_sql = $$select round(sum(really_left_lb),1) from v_harvest_still_in_room$$,
  why_tolerance = 'Rounding only, unchanged from Agent V. FIXED 13 Aug 2026: v_harvest_still_in_room IS the population the figure is computed from, so the drill lists it whole and applies no filter. Before this the tile navigated to v_moisture_loss_register unfiltered — a different population summing to 3,778.5 lb against a tile of 745.2 lb.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.1.in_the_rooms_dry_equivalent';

update tile_drill_contract set
  drill_sql = $$select count(*) from v_harvest_forensic where harvest_closed is null and total_days_start_to_now > f_rule('harvest_open_max_days')$$,
  why_tolerance = 'Zero, unchanged from Agent V. FIXED 13 Aug 2026: the drill now lists exactly the harvests the figure counts — not closed, and open past the owner-set limit — read from v_harvest_forensic, the view the tile is computed from. The limit is the conversion_factors row harvest_open_max_days, read with the page and applied at render; it is never written into the front end. Before this the tile navigated to v_harvest_issues unfiltered, 335 rows of every harvest carrying any issue, against a tile of 19.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.2.harvests_open_too_long';

update tile_drill_contract set
  drill_sql = $$select round(sum(phantom_lb),1) from v_moisture_loss_register where harvest_state = 'CLOSED' and needs_recording and phantom_lb > 0$$,
  why_tolerance = 'Rounding only, unchanged from Agent V. FIXED 13 Aug 2026: the drill carries the tile''s own three clauses — closed, needs recording, and water still on the books — instead of opening the register whole. Before this it shared one unfiltered destination with the in-the-rooms figure, so two different figures reconciled to neither.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.3.moisture_loss_not_recorded';

update tile_drill_contract set
  drill_sql = $$select round(avg(dry_days_to_first_package),1) from v_harvest_forensic where dry_days_to_first_package >= 0$$,
  why_tolerance = 'One decimal of rounding, unchanged from Agent V. FIXED 13 Aug 2026: the drill now averages over HARVESTS, from v_harvest_forensic, which is what the tile averages. Before this the tile opened v_dry_room_performance, which averages over ROOMS — 35.8 days against 33.4, two answers to different questions sharing one label. The room panel is still reachable from inside the drill and is labelled as averaging by room. The predicate >= 0 is this view''s expressible form of "a dry time was recorded"; measured equal to IS NOT NULL, 361 rows either way.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.4.average_dry_time';

update tile_drill_contract set
  drill_sql = $$select count(*) from v_harvest_forensic where dry_days_to_first_package > f_rule('dry_window_max_days')$$,
  why_tolerance = 'Zero, unchanged from Agent V, and this was the worst of the set. FIXED 13 Aug 2026: the drill lists the harvests themselves, by name, from v_harvest_forensic, filtered on the same owner-set longest-acceptable dry time the tile uses. Before this the tile opened v_schedule_compliance, 49 rows of PULL SCHEDULE EVENTS rather than harvests, so a count of 249 harvests could not be found on that page under any filter — the F1-1,022-plants shape. NOTE FILED SEPARATELY: mv_department_dashboard_base still publishes schedule_compliance in this tile''s drill column. The page no longer navigates there, but the published column is a figure-adjacent claim this lane does not change; it goes through correction_proposal.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.5.harvests_dried_too_long';

update tile_drill_contract set
  drill_sql = $$select round(avg(conversion_pct),1) from v_harvest_forensic where harvest_state = 'Finished'$$,
  why_tolerance = 'One decimal of rounding, unchanged from Agent V. FIXED 13 Aug 2026: the drill averages over the closed HARVESTS the tile averages over, from v_harvest_forensic. Before this the tile opened v_issue_yield_gap, which averages over ROOMS — 16.0 percent against 33.9, and the tile was the flattering one. The room page is still reachable from inside the drill and is labelled as averaging by room, so a yield claim can name which of the two it came from. harvest_state = ''Finished'' is this view''s expressible form of harvest_closed IS NOT NULL; measured over every row, zero differ.',
  registered_by = 'Agent B (drill rebuilt; contract first registered by Agent V, 13 Aug 2026)',
  registered_at = now()
where contract_key = 'dash.cultivation.6.conversion_dried_flower';
