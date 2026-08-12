-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-023 (reviewers V, X, W).
-- OWNER RULING 11 Aug 2026, third extension of the vocabulary doctrine: "payroll terms, HR match
-- QuickBooks."
--
-- The doctrine now has three lanes, all owner-ruled today:
--   COMPLIANCE AND MATERIAL: Metrc, then manifest, then COA.
--   ACCOUNTING AND MONEY:    Apex and QuickBooks.
--   PAYROLL AND HR:          QuickBooks.
--
-- WHY QUICKBOOKS FOR PAYROLL SPECIFICALLY. Payroll ends in tax filings - W-2, 941, W-4 - and
-- QuickBooks is where those are produced. The platform already computes 280E labour splits in
-- v_payroll_journal "already split by 280E class"; when that journal lands in QuickBooks the
-- vocabulary must land with it, or the CPA reconciles two dictionaries at year-end.
--
-- CHECKED AGAINST THE LIVE SCHEMA before writing: the platform already has time_entries,
-- timesheets, pay_runs, employee_schedules - mostly QuickBooks-compatible already. Divergences
-- are recorded as variants, nothing is renamed.
--
-- UNDO: delete from glossary_term where domain = 'payroll';
--       restore prior db_policy text from migration accounting_terms_match_apex_and_quickbooks.

update db_policy set
  rule = replace(rule,
    'Concepts none of them name are settled in glossary_term by the owner.',
    'PAYROLL AND HR terms: match QuickBooks (employee, contractor, timesheet, pay period, paycheck, overtime, paid time off), because payroll ends in tax filings and QuickBooks produces them. Concepts none of the authorities name are settled in glossary_term by the owner.'),
  because = because || ' Extended a third time same day: payroll and HR terms match QuickBooks.'
where rule like 'Vocabulary follows the system of record%';

insert into glossary_term (term, preferred_form, definition, domain, why_it_matters, settled, settled_by) values
('employee', 'employee',
 'A W-2 worker on our payroll. Distinct from a CONTRACTOR (1099), who is not an employee and must never appear in payroll aggregates.',
 'payroll',
 'The W-2 / 1099 boundary is a tax classification with penalties on the wrong side of it. QuickBooks keeps the two in separate worlds; so does this platform.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks'),
('contractor', 'contractor',
 'A 1099 worker paid for services, not wages. QuickBooks vocabulary; paid through bills, never paychecks.',
 'payroll',
 'Misclassifying a contractor as an employee - or the reverse - is an IRS finding in its own right, independent of 280E.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks'),
('timesheet', 'timesheet',
 'The record of hours worked in a pay period, the substantiation behind direct labour entering COGS.',
 'payroll',
 'time_entries currently has ZERO rows, which means zero substantiated direct labour under IRC 471 - the largest open gap in the 280E position. The word matters because the evidence will.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks'),
('pay period', 'pay period',
 'The date range a paycheck covers. QuickBooks vocabulary; the unit over which labour is accumulated and classified.',
 'payroll',
 'The 280E labour split is computed per pay period. Cutoff errors here move COGS between tax years.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks'),
('paycheck', 'paycheck',
 'A single payment to one employee for one pay period. QuickBooks vocabulary.',
 'payroll',
 'One word, not "pay check" or "payment". The artefact the payroll journal decomposes into.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks'),
('paid time off', 'PTO',
 'Compensated absence - holiday, sick, personal. QuickBooks'' umbrella term.',
 'payroll',
 'PTO for production staff is an indirect labour cost with its own 280E classification question - it follows the worker''s cost class.',
 true, 'Owner (Vinny), 11 Aug 2026 — payroll and HR terms match QuickBooks')
on conflict (term) do nothing;

insert into glossary_variant (variant, term, variant_kind, uses_found, seen_in, why) values
 ('staff',        'employee',  'accepted', null, 'page names (staffforms), owner language',
  'Collective informal term. Fine on pages and in speech; payroll computation says employee.'),
 ('team member',  'employee',  'accepted', null, 'team_members table',
  'Existing table name; not renamed. Aggregates and filings say employee.'),
 ('pay run',      'pay period','accepted', null, 'pay_runs table',
  'The platform''s existing artefact for executing a pay period. Kept - it is the verb to pay period''s noun.'),
 ('time entry',   'timesheet', 'accepted', null, 'time_entries table',
  'One row of a timesheet. The table is the entries; the document is the timesheet.'),
 ('vacation',     'paid time off', 'accepted', null, 'owner language', 'A kind of PTO, not a synonym for all of it.')
on conflict (variant) do nothing;;
