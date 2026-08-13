-- Agent B, 13 Aug 2026. A contract for every published Command key figure.
--
-- MEASURED FIRST. Seven of the eight drilled by NAVIGATING to a report page,
-- and ReportScreen clears every filter on arrival, so the reader landed on a
-- superset of the figure they pressed:
--
--   Dried flower on hand        2041.3 lb  ->  stock report totalling 2459.5 lb
--   In the rooms, dry-equiv.     745.2 lb  ->  register totalling      3778.5 lb
--   Moisture loss not recorded   710.3 lb  ->  THE SAME PAGE as the line above
--   Harvests open too long            19   ->  a register of 335 harvests
--
-- Two figures cannot both reconcile to one destination, and go() carries a view
-- key with no filter beside it. The records therefore open IN PLACE from the
-- view each figure is computed from, with the figure's own served predicate,
-- and the full report stays one press further in.
--
-- EVERY drill_sql below is the sum or count of exactly the rows the drill now
-- lists. If the front end's filter is wrong, this reads DISAGREE.
--
-- Note on two of them: the laboratory-state figures are PUBLISHED from
-- v_stock_on_hand, which GROUPS. The drill reads the package-level evidence
-- view on the same lab_state column instead, because counting the rows of a
-- grouped view counts streams while looking like packages (E4). One rounding
-- step separates the two and the tolerance says so.

insert into tile_drill_contract
  (contract_key, page, tile_label, tile_sql, drill_sql, tolerance, why_tolerance, registered_by)
values

('cc.kpi.in_the_rooms_lb', 'Command Center',
 'Key figure — in the rooms, dry-equivalent',
 $$select value from mv_department_dashboard where department='Command' and kpi='In the rooms, dry-equivalent'$$,
 $$select round(sum(really_left_lb),1) from v_harvest_still_in_room$$,
 0.2,
 'v_harvest_still_in_room IS the population the figure is computed from, so the drill lists it whole and no filter is applied. 0.2 lb absorbs the rounding step between the published figure and this sum, and nothing else. Before this the drill opened the moisture register whole, which sums to 3778.5 lb.',
 'Agent B'),

('cc.kpi.harvests_open_too_long', 'Command Center',
 'Key figure — harvests open too long',
 $$select value from mv_department_dashboard where department='Command' and kpi='Harvests open too long'$$,
 $$select count(*)::numeric from v_harvest_issues where harvest_closed is null and total_days_start_to_now > f_rule('harvest_open_max_days')$$,
 0,
 'The limit is f_rule(''harvest_open_max_days''), an owner-set row, on BOTH sides — the page reads the same row and passes it into the drill rather than writing a number. Change the rule and the tile and the drill move together. Exact.',
 'Agent B'),

('cc.kpi.moisture_not_recorded_lb', 'Command Center',
 'Key figure — moisture loss not recorded',
 $$select value from mv_department_dashboard where department='Command' and kpi='Moisture loss not recorded'$$,
 $$select round(sum(phantom_lb),1) from v_moisture_loss_register where harvest_state='CLOSED' and needs_recording and phantom_lb > 0$$,
 0.2,
 'The three predicates are lifted verbatim from mv_department_dashboard_base''s own phantom CTE. This figure and "In the rooms" pointed at the same unfiltered page until tonight; they are now two populations with two drills, and this contract is what holds them apart.',
 'Agent B'),

('cc.kpi.out_at_the_laboratory_lb', 'Command Center',
 'Key figure — out at the laboratory, no result',
 $$select value from mv_department_dashboard where department='Command' and kpi='Out at the laboratory, no result'$$,
 $$select round(sum(pounds),1) from v_missing_lab_results$$,
 0.2,
 'v_missing_lab_results IS the population, so the drill lists it whole. The published drill target was the Metrc laboratory status report, which is grouped by testing state and never showed the 123 packages themselves.',
 'Agent B'),

('cc.kpi.never_submitted_lb', 'Command Center',
 'Key figure — never submitted for testing',
 $$select value from mv_department_dashboard where department='Command' and kpi='Never submitted for testing'$$,
 $$select round(sum(pounds),1) from v_stock_proof where lab_state='NotSubmitted'$$,
 0.2,
 'Published from grouped v_stock_on_hand; drilled from ungrouped v_stock_proof on the same lab_state column, so every row the reader sees is one physical package carrying its own certificate and manifest. Measured 13 Aug 2026: 173.5 published against 173.4 summed — one rounding step.',
 'Agent B'),

('cc.kpi.failed_testing_lb', 'Command Center',
 'Key figure — failed testing on hand',
 $$select value from mv_department_dashboard where department='Command' and kpi='Failed testing on hand'$$,
 $$select round(sum(pounds),1) from v_stock_proof where lab_state='TestFailed'$$,
 0.2,
 'Same shape as the untested figure and the same reason. Measured 13 Aug 2026: 165.3 published against 165.4 summed. Failed material is an input we remediate, never a loss (C6a) — the drill lists it so somebody can act on it, not so it can be written off.',
 'Agent B'),

('cc.kpi.open_watchdog_findings', 'Command Center',
 'Key figure — open watchdog findings',
 $$select value from mv_department_dashboard where department='Command' and kpi='Open watchdog findings'$$,
 $$select count(*)::numeric from v_intelligence_briefing$$,
 0,
 'The ONE published figure whose drill target already opened exactly its own population, which is why it still navigates to the intelligence briefing instead of duplicating the list in place. Measured 13 Aug 2026: 147 against 147. Registered so a future change to either side is caught.',
 'Agent B')

on conflict (contract_key) do update set
  page = excluded.page,
  tile_label = excluded.tile_label,
  tile_sql = excluded.tile_sql,
  drill_sql = excluded.drill_sql,
  tolerance = excluded.tolerance,
  why_tolerance = excluded.why_tolerance,
  registered_by = excluded.registered_by;
