-- Agent W, 12 Aug 2026. Two findings from the gate-chain unblock, plus the record of one
-- check I corrected. Filed because a gate judged and not recorded is a gate judged twice.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE CHECK THAT WAS WRONG. docs-vs-database failed the build on five REAL licences.
-- ─────────────────────────────────────────────────────────────────────────────
insert into check_defect
  (check_key, claimed, actually, defect_kind, impact, evidence_sql, found_by, fixed_at, fixed_by, fix_note)
values (
 'docs-vs-database',
 'Claimed five licence-shaped codes in docs/AUDIT_2024_INVENTORY_BALANCE.md are "not real" and failed the build on them: MC283122, MP281983, MP281507, MP281319, MP281764.',
 'All five are genuine Massachusetts counterparty licences, each attested by our own Metrc transfer records: MC283122 Flower Power Growers (54 transfers), MP281983 Flower Power Growers (11), MP281507 Bud''s Goods & Service (150), MP281319 Northeast Alternatives (1), MP281764 Coastal Cultivars (5). The check validated every MC/MP code against company_licenses, which holds OUR two licences by definition and structurally cannot contain a customer''s. An audit document listing who we shipped to therefore could not be written without failing the build.',
 'wrong_population', 'false_alarm',
 'select destination_licence, max(destination_facility), count(*) from metrc_rpt_package_transfers where destination_licence in (''MC283122'',''MP281983'',''MP281507'',''MP281319'',''MP281764'') group by 1;',
 'Agent W, 12 Aug 2026, unblocking the gate chain',
 now(), 'Agent W',
 'Authority widened from company_licenses alone to company_licenses PLUS counterparty licences attested by Metrc transfer rows. The verdict did not move: a code in NEITHER set is still a hard fail, so the founding defect (a Metrc USER ID typed with an MC prefix and mailed to api-info@metrc.com) is still caught. Both halves of the fixture ship in the file as licenceVerdict() + selfTest(): 3 positive cases that must fail, 4 negative cases that must stay quiet. Verified live by injecting MC999999 into the document - the gate failed, exit 1 - then reverting.'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE REGRESSION THE GATE WAS RIGHT ABOUT. 232 reports left the Reports dropdown.
-- ─────────────────────────────────────────────────────────────────────────────
insert into watchdog_findings
  (fingerprint, severity, what, where_it_is, who_is_accountable, when_it_started,
   why_it_matters, how_it_was_detected, what_to_do, the_arithmetic, record_count,
   guard_recommendation)
values (
 'nav_registry:report_group_all_data_stripped:2026-08-12',
 'critical',
 'report_group was stripped from ''All Data'' to NULL on 251 nav_registry rows in a single batch, moving 232 report pages out of the Reports dropdown and into the left rail.',
 'nav_registry.report_group; visible to the owner as the Reports menu',
 'Agent I / Agent B — nav_registry is a frozen surface, so the restore is not Agent W''s to make',
 '2026-08-12 01:00 UTC, one batch, actor app:mgmt-api',
 'App.jsx:346 puts a page in the Reports dropdown when surface=''reports'' OR report_group is set. These 232 had neither afterwards, so they render in the left rail instead of the dropdown. This is the owner''s "FIX SO I CAN SEE" complaint in its literal form: reports he could reach yesterday are somewhere else today. It also breached rule I4 and the check:reportcontract ratchet, which is the gate currently blocking deployment.',
 'check:reportcontract measured I4 breaches at 327 against ratchet_baseline report_outside_reports_menu = 93. Agent V had reported the gate as masked behind check:baseline failing earlier in the chain; it was not masking a stale baseline, it was masking this. Confirmed against audit_events, which holds the before and after of every row.',
 'DECIDE FIRST, then act — do not auto-restore. Either (a) the strip was deliberate cleanup of a junk catch-all group, in which case these 232 pages need a real report_group or surface=''reports'' and the ratchet returns to 93 honestly; or (b) it was unintended, in which case restore report_group=''All Data'' on exactly the 251 audited rows. The audit rows carry the old value, so the restore is exact and reversible. Do NOT raise the ratchet baseline either way.',
 'baseline 93 + 234 newly breaching = 327 measured. 251 rows stripped in the batch, of which 232 were page_kind=report and surface=side; the remaining 19 sat on the finance (15) and hr (4) surfaces and do not count toward I4.',
 232,
 'nav_registry has an audit trigger but no guard on report_group: a bulk NULLing of a menu-visibility column passed with nothing watching. A data_assertion that report pages reachable from the Reports dropdown may fall only with a written reason would have caught this within the hour instead of at a blocked deploy.'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RULE 6, BROKEN WHILE I WAS MEASURING IT.
-- ─────────────────────────────────────────────────────────────────────────────
insert into watchdog_findings
  (fingerprint, severity, what, where_it_is, who_is_accountable, when_it_started,
   why_it_matters, how_it_was_detected, what_to_do, record_count, guard_recommendation)
values (
 'migrations:applied_without_file:platform_it:2026-08-12',
 'elevated',
 'Two migrations ran in production this evening with no file in the repository: 20260812185646 platform_it_one_window_over_the_whole_machine_v2 and 20260812190817 platform_it_stop_overstating_calibrate_the_band.',
 'supabase/migrations — the files do not exist; v_migration_history has the rows',
 'the platform-IT lane that applied them',
 '2026-08-12 18:56 and 19:08 UTC',
 'Standard rule 6: what runs in production is in the repository. apply_migration writes Supabase''s history and does not write a file. Both postdate the schema baseline regenerated at 18:54, so they are outside it too and check:migrationdrift fails on exactly these two.',
 'check:migrationdrift, after the regenerated baseline reduced the count from 696 unsourced to 2.',
 'The author writes the two files with the EXACT SQL applied and the paragraph explaining why, then git add. Regenerating the baseline would also close the gate but would lose the reasoning, which is the part nobody can reconstruct — so it is the wrong fix here.',
 2,
 'Nothing watches for an applied migration with no file until build time. A scheduled assertion comparing v_migration_history against tracked files would surface this within the hour instead of at a blocked deploy.'
);
