-- OWNER RULE, 8 Aug 2026: "Any item that does not have a manifest or COA, that you
-- claim was never tested, will have to reconcile in Metrc as such."
--
-- A claim of "never tested" is not an explanation, it is an ASSERTION, and an
-- assertion has to survive a check. Four independent facts must all agree, and
-- three of the four come from outside this platform's own reasoning:
--     1. Metrc's own lab_testing_state says NotSubmitted or NotRequired
--     2. metrc_lab_results holds no result for it            (the laboratory)
--     3. metrc_rpt_package_transfers holds no line for it    (the state's custody export)
--     4. no certificate is filed DIRECTLY against it         (the document store)
--
-- An INHERITED certificate is NOT a contradiction. Crude, badder and isolate made
-- from tested flower carry the parent's certificate while never having been
-- submitted themselves - 49 of the 111 are exactly that, at depths 1, 2 and 4.
-- A certificate at depth 0 WOULD be a contradiction: Metrc saying untested while a
-- laboratory filed a report against that very package.
--
-- Measured at creation: 111 claimed, 0 with lab results, 0 with a manifest,
-- 0 with a direct certificate. Empty is the good state.
-- UNDO: drop view v_never_tested_reconciliation;

create or replace view public.v_never_tested_reconciliation as
with claimed as (
  select p.tag, p.item_name, p.lab_testing_state, p.uom, p.quantity, p.source_state,
         p.raw->>'LocationName'                    as location,
         p.raw#>>'{Item,ProductCategoryName}'      as category,
         p.packaged_on,
         current_date - p.packaged_on              as days_held
  from (select distinct on (tag) tag, item_name, lab_testing_state, uom, quantity,
               source_state, packaged_on, raw
        from metrc_packages order by tag, license) p
  where p.lab_testing_state in ('NotSubmitted','NotRequired')
    and p.source_state = any (array['active','onhold'])
)
select c.tag                                as package_tag,
       left(c.item_name, 50)                as item_name,
       c.category,
       c.location,
       f_quantity_text(c.quantity, c.uom)   as how_much,
       c.lab_testing_state                  as metrc_says,
       c.packaged_on, c.days_held,
       (select count(*) from metrc_lab_results l where l.package_tag = c.tag)          as lab_results,
       (select count(*) from metrc_rpt_package_transfers t where t.package_tag = c.tag) as manifest_lines,
       (select count(*) from v_certificate_resolved r
         where r.package_tag = c.tag and r.found_at_depth = 0)                          as direct_certificates,
       (select max(r.found_at_depth) from v_certificate_resolved r
         where r.package_tag = c.tag)                                                   as inherited_at_depth,
       case
         when (select count(*) from metrc_lab_results l where l.package_tag = c.tag) > 0
           then 'CONTRADICTION - Metrc says never submitted but laboratory results exist'
         when (select count(*) from v_certificate_resolved r
                where r.package_tag = c.tag and r.found_at_depth = 0) > 0
           then 'CONTRADICTION - Metrc says never submitted but a certificate is filed DIRECTLY against it'
         when (select count(*) from metrc_rpt_package_transfers t where t.package_tag = c.tag) > 0
           then 'CONTRADICTION - Metrc says never tested but it travelled on a manifest'
         else 'RECONCILED - never tested, never shipped, consistent on all four sources'
       end                                  as reconciliation,
       'THE RULE: a claim of never tested must reconcile against Metrc, the '
       'laboratory results, the custody export and the document store. Three of '
       'those four are outside this platform''s own reasoning.' as what_is_wrong
from claimed c;

comment on view public.v_never_tested_reconciliation is
  'Owner rule, 8 Aug 2026. Every package claimed never tested, checked against four '
  'sources. Filter to reconciliation LIKE ''CONTRADICTION%'' - that must be empty. '
  'An INHERITED certificate is expected on untested intermediate product made from '
  'tested material; a DIRECT one is a contradiction.';;
