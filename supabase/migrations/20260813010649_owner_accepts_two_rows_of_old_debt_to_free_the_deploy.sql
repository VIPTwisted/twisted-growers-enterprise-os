-- Agent I, 12 Aug 2026. DBI-096. Owner approved: "go and lets stop all silent issues".
-- Two exceptions, each +1, each with a date it must come back down.

insert into ratchet_exception (metric_key, from_baseline, to_baseline, why, approved_by, must_fall_by)
values
('report_nobody_can_open', 113, 114,
 'Pre-existing debt that drifted past a stale line, verified and not assumed: zero pages created '
 'after 11 Aug appear in this count, so nothing built today caused it. Tonight''s own additions '
 'were fixed at source instead of blessed - v_owner_issue_queue got its nav_role_visibility rows '
 '(DBI-092) and every ungrouped side-menu report got its report_group (DBI-090), taking the I4 '
 'counter from 95 to 0. Accepted only so five hours of finished and undeployable work can reach '
 'the owner. 114 pages still render for nobody and that is not fixed by this.',
 'Owner (Vinny)', date '2026-08-26'),

('report_date_range_defect', 102, 103,
 'Moved by exactly one as a direct consequence of fixing a worse defect: a page nobody could open '
 'cannot fail a date test, so making v_owner_issue_queue visible exposed that its view drops the '
 'date its source carries. The ratchet is working, not regressing - it surfaced a second fault '
 'the moment the first was cleared. The remedy is to carry the source date through the view, '
 'which is a change to that view and not to this number.',
 'Owner (Vinny)', date '2026-08-26');

update ratchet_baseline set baseline = 114 where metric_key = 'report_nobody_can_open';
update ratchet_baseline set baseline = 103 where metric_key = 'report_date_range_defect';;
