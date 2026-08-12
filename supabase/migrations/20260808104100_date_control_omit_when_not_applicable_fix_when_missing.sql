-- OWNER RULING, 8 Aug 2026: "On pages that don't require a date we OMIT, not grey it out."
--
-- This overturns my earlier instruction to the design agent, which said show the
-- control disabled with a reason on hover. The owner is right: a greyed-out control
-- on a page where a date is meaningless is clutter, and clutter on 111 pages trains
-- people to ignore controls.
--
-- BUT THE RULING NEEDS A DISTINCTION, OR "OMIT" BECOMES A PLACE TO HIDE A DEFECT.
-- Two very different pages currently look identical - both have no date column:
--
--   NOT APPLICABLE - a licence lookup, a permissions matrix, a unit-conversion table.
--     A date on these would be invented. OMIT the control. Correct as it stands.
--
--   MISSING - a report whose SOURCE carries a date that the view failed to select.
--     v_ownership_verdict reads metrc_packages, which holds packaged_on. The date
--     exists; the view dropped it. That is a DEFECT, and omitting the control would
--     bury it exactly the way the last site-wide date filter got buried - it reached
--     only a few pages and nothing detected it.
--
-- date_policy makes the difference explicit and settable, rather than inferred from
-- the absence of a column. Absence of evidence is not evidence of absence - that has
-- cost this platform repeatedly tonight.
-- UNDO: alter table nav_registry drop column date_policy.

alter table nav_registry add column if not exists date_policy text not null default 'auto';

comment on column nav_registry.date_policy is
  'auto        - infer from the target: a date column means show the control. '
  'not_applicable - a date is meaningless for this page; OMIT the control entirely. '
  'missing     - a date SHOULD be here and the view fails to select it. DEFECT: fix '
  'the view rather than omitting the control. Set this deliberately; leaving it auto '
  'lets a real defect look like a design decision.';

-- Reference and configuration pages where a date genuinely does not apply.
update nav_registry set date_policy = 'not_applicable'
where date_policy = 'auto'
  and table_ref in (
    'licence_type_prefix','permission_catalog','role_permissions','roles_catalog',
    'app_roles','company_licenses','nav_role_visibility','product_families',
    'source_precedence','concentrate_rate_map','inventory_values','sku_pack_sizes',
    'sheet_column_map','metrc_endpoint_capability','widget_catalog','labs',
    'v_licence_directory','v_facility_registry','v_role_menu_matrix','v_access_preview',
    'v_hardcoded_thresholds','v_metric_registry_gaps','v_trap_scan','v_page_wiring',
    'v_report_catalogue','v_report_standard','v_agent_agreement');

create or replace view public.v_report_standard as
select w.view_key, w.label, w.category, w.page_kind, w.table_ref, w.object_kind,
       w.fields, w.date_columns, w.roles_who_can_see, w.in_report_registry,
       (w.page_kind = 'report')      as needs_toolbar,
       (w.date_columns > 0)          as can_filter_by_date,
       (w.fields >= 3)               as worth_filtering,
       (w.roles_who_can_see > 0)     as someone_can_open_it,
       (w.claims_proving_it > 0)     as figure_is_proven,
       case
         when w.page_kind = 'application'            then 'EXEMPT - hand-built screen, no report toolbar'
         when w.roles_who_can_see = 0                then 'FAILS - nobody can open it'
         when n.date_policy = 'not_applicable'       then 'MEETS THE STANDARD - date control OMITTED, a date is meaningless here'
         when w.date_columns = 0                     then 'DEFECT - the source carries a date and this view drops it. Fix the view, do NOT omit the control'
         when w.fields < 3                           then 'THIN - too few fields to be worth filtering'
         else 'MEETS THE STANDARD'
       end                            as standard,
       'THE STANDARD: every report page carries the SAME toolbar - the 27-preset date '
       'range with editable From/To, global search, per-column filters, sort, column '
       'chooser, group-by with subtotals, export to PDF/CSV/Excel/Sheets carrying the '
       'active filters, drill to the raw Metrc record, and owner_note displayed. Same '
       'position, same wording, same shortcuts.'      as what_good_looks_like,
       'OWNER RULING: where a date is genuinely meaningless, OMIT the control - do not '
       'grey it out. Where the source HAS a date the view dropped, that is a defect: '
       'fix the view. Never omit to hide a missing date.'  as what_to_do,
       n.date_policy
from v_page_wiring w
join nav_registry n on n.view_key = w.view_key;

comment on view public.v_report_standard is
  'Does every report page meet the standard? Two states look identical without '
  'date_policy: a page where a date is meaningless (OMIT the control - correct) and a '
  'page whose view dropped a date its source carries (DEFECT - fix the view). '
  'Omitting the second would bury it exactly as the last site-wide date filter was '
  'buried. Proves the DATA supports the standard; it cannot see the front end.';;
