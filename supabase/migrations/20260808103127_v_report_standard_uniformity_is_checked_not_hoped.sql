-- UNIFORMITY MUST BE CHECKED, NOT HOPED FOR. Owner, 8 Aug 2026:
--   "So all pages will have uniform design, same date."
--
-- The DEFINITION is uniform: 27 date presets in one table, one report_registry, one
-- page_kind distinguishing report from application screen. No page can invent its own
-- "This Month".
--
-- But a shared definition does not make a shared UI. The previous attempt at a
-- site-wide date filter reached only a few pages, and nothing detected that - it was
-- found by the owner noticing. **A standard with no check is a preference.** This is
-- the check: every report page, measured against what the standard requires, so
-- drift is visible the day it appears rather than the day someone opens the wrong page.
--
-- It cannot see the front end. It proves the DATA supports the standard on every page;
-- whether the component is actually rendered is a front-end audit and is stated as
-- out of scope rather than quietly assumed.
-- UNDO: drop view v_report_standard.

create or replace view public.v_report_standard as
select w.view_key, w.label, w.category, w.page_kind, w.table_ref, w.object_kind,
       w.fields, w.date_columns, w.roles_who_can_see, w.in_report_registry,
       -- what the standard requires of a report page
       (w.page_kind = 'report')                              as needs_toolbar,
       (w.date_columns > 0)                                  as can_filter_by_date,
       (w.fields >= 3)                                       as worth_filtering,
       (w.roles_who_can_see > 0)                             as someone_can_open_it,
       (w.claims_proving_it > 0)                             as figure_is_proven,
       case
         when w.page_kind = 'application' then 'EXEMPT - hand-built screen, no report toolbar'
         when w.roles_who_can_see = 0     then 'FAILS - nobody can open it'
         when w.date_columns = 0          then 'FAILS - no date column, so the date range cannot work here'
         when w.fields < 3                then 'THIN - too few fields to be worth filtering'
         else 'MEETS THE STANDARD'
       end                                                   as standard,
       'THE STANDARD: every report page carries the SAME toolbar - the 27-preset date '
       'range with editable From/To, global search, per-column filters, sort, column '
       'chooser, group-by with subtotals, export to PDF/CSV/Excel/Sheets carrying the '
       'active filters, drill to the raw Metrc record, and owner_note displayed. Same '
       'position, same wording, same shortcuts. A user who learns one report has '
       'learned all of them.'                                as what_good_looks_like,
       'A page with no date column shows the control DISABLED with the reason on '
       'hover - never hidden, or users conclude the page is broken.' as what_to_do
from v_page_wiring w;

comment on view public.v_report_standard is
  'Does every report page meet the standard? MEETS THE STANDARD is the good state. '
  'This proves the DATA supports a uniform toolbar everywhere - it cannot see whether '
  'the front end renders one shared component, which is a separate audit and must not '
  'be assumed from a green result here. The last site-wide date filter reached only a '
  'few pages and nothing detected it; a standard with no check is a preference.';;
