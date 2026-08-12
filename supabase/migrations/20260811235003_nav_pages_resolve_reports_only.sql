-- Agent I, 11 Aug 2026. Correcting my own check ONE HOUR after registering it, because its
-- first-ever firing led straight to discovering its own wrong population. Filed under DBI-025.
--
-- WHAT HAPPENED. nav-pages-resolve fired at 27 vs ceiling 26 within minutes of existing. The
-- 27th was Agent B's new "Goals and Targets" page, created 23:48 tonight. Before flagging B I
-- challenged the check itself and found MY error: nav_registry.page_kind splits the population.
--     report      615 enabled: 613 resolve, 2 broken  <- MUST point at a real relation
--     application  31 enabled: 25 "broken"            <- COMPONENT pages, routed by key, a
--                                                        relation was never the contract
--     custom       16 enabled: 0 broken
-- So tonight's earlier claim "26 pages error on open" was WRONG POPULATION: 25 of the 26 are
-- component-routed application pages that work fine. The genuinely broken, DB-testable count is
-- TWO report pages. B is exonerated - the Goals page is an application page, correctly built.
--
-- THE CHECK NOW TESTS ONLY WHAT THE DATABASE CAN PROVE: report pages resolve to relations.
-- Whether an APPLICATION page's component exists is a front-end fact - that test belongs in CI
-- (the DDC smoke-routes pattern), assigned to Agent B's per-page validator.
--
-- UNDO: restore view and ceiling from migration nav_pages_resolve_smoke_check.

create or replace view v_nav_broken_pages as
select n.id, n.category, n.subcategory, n.label,
       coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),'')) as points_at,
       'Report page whose relation does not exist - opening it errors. Fix the reference or disable the entry.' as why_it_matters
from nav_registry n
left join pg_class c
  on c.relname = coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),''))
 and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m')
where n.enabled
  and coalesce(n.page_kind,'report') = 'report'
  and coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),'')) is not null
  and c.oid is null;

comment on view v_nav_broken_pages is
 'REPORT pages whose declared relation does not exist - the pages that genuinely error on open. '
 'Application and custom pages are EXCLUDED: they route by component key and a relation was '
 'never their contract; my first version counted them and manufactured 25 false positives, '
 'caught by the check''s own first firing on 11 Aug 2026. Component existence for application '
 'pages is tested in CI (DDC smoke-routes pattern), not here. Ratcheted: may fall, never rise.';

update conversion_factors set
  value = (select count(*) from v_nav_broken_pages),
  updated_at = now(),
  evidence_note = 'Reseeded 11 Aug 2026 after wrong-population fix: report pages only. Original seed of 26 counted 25 component-routed application pages that were never broken. Lower as the 2 are fixed; never raise.'
where key = 'nav_broken_pages_ceiling';

insert into check_defect (check_key, claimed, actually, defect_kind, impact, evidence_sql, found_by)
values ('nav-pages-resolve',
 'Claimed 26 enabled menu entries error on open because their declared relation does not exist, and reported that figure to the owner as the broken-pages count.',
 'Only 2 genuinely error - both page_kind=report. The other 25 are page_kind=application: component-routed pages whose view_key is a ROUTE KEY, not a relation name; a relation was never their contract. The check''s own first firing (on Agent B''s correctly-built Goals page, 27 vs 26) triggered the challenge that exposed the wrong population. Agent B exonerated.',
 'wrong_population', 'false_alarm',
 'select coalesce(page_kind,''report''), count(*) from nav_registry n left join v_nav_broken_pages b on b.id=n.id where n.enabled group by 1; -- report: 2 broken/613 ok, application: 25 flagged/all component-routed, custom: 0',
 'Agent I self-challenge, 11 Aug 2026');;
