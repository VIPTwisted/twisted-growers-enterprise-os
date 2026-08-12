-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-013 (reviewers V, X, W).
--
-- THE OWNER'S POINT, AND HE IS RIGHT. Four third-party checks all agreed tonight while the
-- headline third-party on-hand figure moved 148.2 lb unwatched. A suite that agrees while the
-- number that matters moves is not passing - it is pointed at the wrong things. Agreement is
-- only worth having when the checks are accurate and cover what counts.
--
-- WHY I LEFT THIS OUT THIS AFTERNOON, AND WHY THAT WAS WRONG. I declined to register an on-hand
-- check because the only population filter I had was ItemFromFacilityLicenseNumber, a field
-- documented to read as OURS for outside material. That reasoning was sound and the conclusion
-- was not: the answer was to hold the POPULATION constant and vary only the SOURCE. Take the tag
-- list from the view itself, take the quantity from metrc_packages. The trap field is never
-- touched, and the two sides are still independent - one is the view's own arithmetic, the other
-- is Metrc's raw quantity.
--
-- IT FIRES ON REGISTRATION, AND IT SHOULD.
--     view sum(lb_on_hand) ............................ 699.0 lb across 107 tags
--     same tags, packages active only ................. 573.4 lb
--     same tags, packages active plus intransit ....... 774.2 lb
-- The view's figure sits BETWEEN the two package-state readings and matches neither. The headline
-- third-party inventory number, which feeds the year-end audit, cannot currently be reproduced.
-- That is the finding. Registering a check that goes red is the honest act here; registering one
-- tuned to pass would be manufacturing comfort.
--
-- MOST OF THE DIFFERENCE IS PROBABLY ONE QUESTION: does intransit count as on hand? 16 tags,
-- 200.8 lb - the Holyoke Wilds child packages. Answer that and 774.2 or 573.4 becomes right.
-- It is a business ruling, not a query, and it belongs to the owner.
--
-- A MASS-BALANCE CHECK WAS CONSIDERED AND REJECTED. received - processed - sold - adjusted
-- implies 2,611.5 lb against an actual 699.0, a 1,912.5 lb apparent hole. It is NOT a hole:
-- made_lb is the OUTPUT weight of processing, not the input consumed. Trim into concentrate loses
-- most of its mass by design. A check built on that arithmetic would have raised nearly a ton of
-- phantom missing material every twelve hours. Recording the rejection so nobody rebuilds it.
--
-- UNDO: delete from verification_checks where check_key = 'third-party-on-hand-two-ways';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'third-party-on-hand-two-ways',
 'Third-party pounds on hand reproduce from Metrc''s own package quantities',
 'The headline third-party inventory figure, derived twice. Population is held constant - the '
 'tag list comes from v_third_party_forensic itself - and only the SOURCE of the weight varies: '
 'the view''s own lb_on_hand against the raw quantity Metrc holds for those same tags. That keeps '
 'ItemFromFacilityLicenseNumber, a field known to misreport ownership, out of the comparison '
 'entirely. FIRES ON REGISTRATION at 699.0 against 774.2. The likely single cause is whether '
 'intransit packages count as on hand - 16 tags, 200.8 lb. That is a business ruling for the '
 'owner, not a query. Do NOT close this by widening the tolerance; the whole point is that a '
 'figure feeding the year-end audit is currently not reproducible.',
 'The view''s own on-hand pounds',
 'select round(sum(f.lb_on_hand),1)::numeric from v_third_party_forensic f join metrc_packages p on p.tag = f.tag',
 'Same tags, weight taken from Metrc package quantities (active plus intransit)',
 'select round(sum(case when p.source_state in (''active'',''intransit'') and not coalesce(p.finished,false) then f_to_pounds(p.quantity, p.uom) else 0 end),1)::numeric from v_third_party_forensic f join metrc_packages p on p.tag = f.tag',
 0, 'critical', 'Agent V', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql,
  severity = excluded.severity, owner = excluded.owner, enabled = excluded.enabled;;
