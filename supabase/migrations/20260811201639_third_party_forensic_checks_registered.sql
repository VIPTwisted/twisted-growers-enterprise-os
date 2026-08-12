-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-004 (reviewers V, X, W).
--
-- WHY. docs/THIRD_PARTY_FORENSIC_REBUILD.md section 6 carries a four-check verification suite
-- that the owner spent over 24 hours building. It only ran when a human remembered to paste it
-- into a SQL console. Re-run by hand today, all four still pass exactly:
--   on hand 847.2 = 847.2 | manifests 61/61, 6/6, 332/332 | exit 51 tags 250.6 lb $81,204
--   unexplained 23 tags 79.3 lb
-- A suite that depends on memory is not a control. These are now registered so tg_verify()
-- runs them twice a day and tg_verification_escalate() names an owner when one breaks.
--
-- EVERY CHECK BELOW WAS RUN BEFORE IT WAS REGISTERED. A check that cannot fire is worse than
-- no check, because it reports safety it never tested. Measured values at registration:
--   derived-has-parent      39 = 39
--   received-has-manifest  399 = 399
--   unexplained-floor      79.3 = 79.3
--   exit-trace-alive        49 = 49  (51 actual, floor 49)
--
-- THE FIFTH CHECK IS DELIBERATELY ABSENT. Section 6 check 1 ties on-hand pounds two ways and
-- passes at 847.2. It is NOT registered here because the only independent population filter
-- available to me is ItemFromFacilityLicenseNumber, and that field is a known trap - it reads
-- as OURS for genuinely outside material, which is exactly why Agent S's bucket 3 ($62,986
-- across 184 tags) exists. Registering a check on a field known to lie would manufacture a
-- false verdict twice a day. Agent V owns supplying a trustworthy second derivation.
--
-- ONE-SIDED CHECKS. Two of these are floors, not equalities, written with greatest()/least()
-- so that IMPROVEMENT never raises a finding. Unexplained pounds falling below 79.3 is the
-- outcome we want; it must not look like a break. This is the ratchet rule in miniature -
-- a baseline may fall, never rise.
--
-- UNDO: delete from verification_checks where check_key like 'third-party-%';
--       delete from watchdog_findings where fingerprint like 'verify:third-party-%';
--       No view, table or existing check is altered.

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values
(
 'third-party-unexplained-within-floor',
 'Unexplained third-party material stays at or below its accepted floor',
 'THIS IS THE CANARY. The owner''s own note: "If check 4 blows up, the source_package join is '
 'broken - fix that before reporting anything. That single join is the difference between 227 lb '
 '''missing'' and 79.3 lb." If this check fires, do not investigate the suppliers, do not raise a '
 'discrepancy with anyone outside the building, and do not quote a missing-pounds figure. Fix the '
 'lineage join first, then re-measure. A one-sided floor: unexplained pounds FALLING is the goal '
 'and never fires.',
 'Unexplained pounds, floored at the accepted 79.3',
 'select round(greatest(coalesce(sum(lb_received),0), 79.3), 1)::numeric from v_third_party_forensic where status like ''UNEXPLAINED%''',
 'The accepted floor (79.3 lb across 23 tags, agreed 11 Aug 2026)',
 'select 79.3::numeric',
 0, 'critical', 'Agent I', true, date '2026-08-11', false
),
(
 'third-party-derived-has-parent',
 'Every third-party tag with no receipt date is a package we made, not material we cannot account for',
 'A null date_received looks like a documentation gap and is not one. All 39 such tags are CHILD '
 'packages created at our own facility - Metrc leaves every Received* field null because nothing '
 'was received, and the inbound manifest lives on the PARENT. Investigated 11 Aug 2026 after this '
 'looked like a 200.8 lb hole in current stock: 39 of 39 have a parent, 38 distinct parents, all '
 'present in the mirror. If this check ever fires, a tag has appeared that was neither received '
 'nor made from something - that IS a real gap and it is worth stopping for.',
 'Third-party tags with no receipt date',
 'select count(*)::numeric from v_third_party_forensic where date_received is null',
 'Of those, how many are traceable to a parent package',
 'select count(*)::numeric from v_third_party_forensic f join metrc_packages p on p.tag = f.tag where f.date_received is null and coalesce(p.raw->>''SourcePackageLabels'', '''') <> ''''',
 0, 'elevated', 'Agent M', true, date '2026-08-11', false
),
(
 'third-party-received-has-manifest',
 'Every third-party tag we actually received names the manifest it arrived on',
 'Material that genuinely crossed the fence must carry the inbound manifest that brought it. This '
 'is the year-end audit position: an auditor asking "how did this arrive" must get an answer for '
 'every received tag. Complete at registration - 399 of 399. Counts only tags with a receipt date, '
 'because child packages made here were never received and correctly have neither.',
 'Third-party tags with a receipt date',
 'select count(*)::numeric from v_third_party_forensic where date_received is not null',
 'Of those, how many name an inbound manifest',
 'select count(*)::numeric from v_third_party_forensic where date_received is not null and inbound_manifest is not null',
 0, 'elevated', 'Agent P', true, date '2026-08-11', false
),
(
 'third-party-exit-trace-alive',
 'The third-party exit trace still finds where material went and what it sold for',
 'The trace joins tags to their children and on to sales. When a join like this breaks it does not '
 'error - it silently returns fewer rows, and the loss reads as "we sold less" rather than "we can '
 'no longer see the sales". Measured 51 tags / 250.6 lb / $81,204 on 11 Aug against 49 / 235 / '
 '$75,000 when the document was written; growth is the trace working. A one-sided floor at 49, so '
 'finding MORE never fires - only losing sight of what we could already see.',
 'Third-party tags with a traced exit, capped at the floor',
 'select least(count(*), 49)::numeric from v_third_party_forensic where exit_child_tags is not null',
 'The floor (49 tags were traceable when the rebuild was written)',
 'select 49::numeric',
 0, 'watch', 'Agent S', true, date '2026-08-11', false
)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_label = excluded.source_a_label, source_a_sql = excluded.source_a_sql,
  source_b_label = excluded.source_b_label, source_b_sql = excluded.source_b_sql,
  tolerance_pct = excluded.tolerance_pct, severity = excluded.severity,
  owner = excluded.owner, enabled = excluded.enabled;;
