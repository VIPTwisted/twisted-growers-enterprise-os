-- Agent: W (Watchdog), 11 Aug 2026.
--
-- THE HOLE. Pages have five gates -- page-architecture, tile-drills, theme-lock,
-- ui-language, no-fabricated-data. Reports had none. Six rules about reports exist in
-- prose and are enforced by nobody: L6 (date range), section 7 (filters are DATA, never
-- JSX), C3a (certificate and manifest on every item row, with a stated reason when
-- absent), C1 (drill-down), I4 (reports live in the Reports dropdown) and J7 (a room is
-- never shown without its department).
--
-- tools/checks/report-contract.mjs now measures them. Three of the six are facts about
-- nav_registry rather than about the source, so their limits belong here, next to the
-- measurement, rather than in a JSON file beside the check. One figure, one home.
--
-- WHY RATCHETS AND NOT A HARD ZERO. Every count is above zero today, and a gate that is
-- red on arrival gets switched off -- and a switched-off gate is worse than none. These
-- record the debt as it stands. tg_ratchet_guard already refuses to let any baseline
-- rise, so the next report that drops its date column, or lands in the side rail, fails
-- the build on the spot.
--
-- The 102 and the 113 are not new findings. v_report_standard has been computing both
-- since 8 Aug and NOTHING HAS EVER READ IT -- which is the watchdog's own class of
-- defect: an assertion recorded, correct, and raised to nobody.

insert into public.ratchet_baseline (metric_key, baseline, set_by, what_it_counts, note)
values
  ('report_date_range_defect', 102, 'agent-w 11 Aug 2026',
   'Enabled pages with page_kind=''report'' whose SOURCE carries a date and whose view '
   'drops it, so the report cannot be pulled by date range. Counted from '
   'v_report_standard, where the verdict text begins DEFECT.',
   'Rule L6: a report that cannot be pulled by date range is not finished. The owner''s '
   'ruling separates two cases and only one of them is a defect -- where a date is '
   'genuinely meaningless the control is OMITTED and date_policy is set to '
   '''not_applicable'' (25 pages, correctly), and where the source HAS a date the view '
   'dropped, the VIEW is fixed. Never omit the control to hide a missing date. '
   'Measured 11 Aug 2026 by tools/checks/report-contract.mjs.'),

  ('report_nobody_can_open', 113, 'agent-w 11 Aug 2026',
   'Enabled pages that no role can open, counted from v_report_standard where the '
   'verdict is FAILS - nobody can open it. They render for nobody and still count as '
   'delivered work.',
   'Recorded as debt rather than failed on, because 113 pages losing their audience is a '
   'permissions decision and not something a build gate should settle at 4pm on a '
   'Tuesday. It may fall and may never rise. Whether these are unfinished pages or '
   'pages whose role grants were never written is the question this number exists to '
   'force somebody to answer.'),

  ('report_outside_reports_menu', 93, 'agent-w 11 Aug 2026',
   'Enabled pages with page_kind=''report'' that sit on surface=''side'' with no '
   'report_group, so they appear in the left rail and NOT in the Reports dropdown.',
   'Rule I4: reports live in the Reports dropdown, not as side-menu items. App.jsx:346 '
   'puts a row in the dropdown when surface=''reports'' OR report_group is set, so '
   'either one fixes a row. 286 report pages sit outside surface=''reports'' in total, '
   'but 193 of those reach the dropdown through report_group or belong to the Finance, '
   'Tax, HR and Deep menus, which are their own surfaces by design -- counting all 286 '
   'would be a wrong label on 193 correct rows. 93 is the number that is actually wrong.')
on conflict (metric_key) do nothing;
