-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-025 (reviewers V, X, W).
-- Owner directive: bring the DDC project's discipline here and take as much as we can.
-- Pattern taken: their scripts/smoke-routes.mjs - every route smoke-tested in CI so a broken
-- page is a build failure, not a user discovery. Rebuilt database-side so it runs HOURLY with
-- the suite instead of only at deploy time. No data crossed between companies; the idea did.
--
-- WHAT IT GUARDS. Measured tonight: of 661 enabled navigation entries, 26 point at a relation
-- that DOES NOT EXIST in the schema. A user opening one gets an error screen - worse than a
-- blank page, because it announces the system is broken. Separately 115 tables behind pages are
-- confirmed empty; those are honest blanks and a different problem (build or remove - owner's
-- decision list, pending).
--
-- RATCHET, NOT A CLIFF. The 26 exist today; demanding zero immediately would just make the
-- check red forever and teach everyone to ignore it. Ceiling seeded at the measured 26: may
-- fall, must never rise. Fixing a page lowers it; shipping a new nav entry pointing at a
-- nonexistent relation fires within the hour.
--
-- UNDO: drop view v_nav_broken_pages;
--       delete from verification_checks where check_key = 'nav-pages-resolve';
--       delete from conversion_factors where key = 'nav_broken_pages_ceiling';

create or replace view v_nav_broken_pages as
select n.id, n.category, n.subcategory, n.label,
       coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),'')) as points_at,
       'Relation does not exist in public schema. Opening this page errors. Fix the reference or disable the entry - a menu item that errors tells users the system is broken.' as why_it_matters
from nav_registry n
left join pg_class c
  on c.relname = coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),''))
 and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m')
where n.enabled
  and coalesce(nullif(btrim(n.table_ref),''), nullif(btrim(n.view_key),'')) is not null
  and c.oid is null;

comment on view v_nav_broken_pages is
 'Every enabled menu entry whose declared data source does not exist - the pages that ERROR on '
 'open. Pattern taken from the owner''s DDC project (smoke-routes in CI), rebuilt database-side '
 'to run hourly. 26 at first measurement, 11 Aug 2026. Ratcheted: the count may fall and must '
 'never rise.';

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
select 'nav_broken_pages_ceiling', count(*), 'count',
 'Ceiling on menu entries that error on open',
 'Enabled nav_registry entries pointing at a relation that does not exist. A RATCHET: may fall, must never rise. A page that errors announces the system is broken - worse than an honest blank.',
 'Measured 11 Aug 2026 from v_nav_broken_pages at creation.',
 'Agent I', 'measured',
 'Lower as pages are fixed or entries disabled. NEVER raise to make the check pass.'
from v_nav_broken_pages
on conflict (key) do nothing;

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'nav-pages-resolve',
 'No new menu entry points at a relation that does not exist',
 'DDC-inspired smoke test, hourly. 26 of 661 enabled menu entries error on open because their '
 'declared source relation is missing from the schema. Ratcheted at the measured count: fixing '
 'pages lowers it, and any NEW entry shipped against a nonexistent relation fires within the '
 'hour instead of waiting for a user to find the error screen. Close by fixing the reference or '
 'disabling the entry - never by raising the ceiling.',
 'Enabled menu entries whose source relation does not exist',
 'select count(*)::numeric from v_nav_broken_pages',
 'The ratchet ceiling, which may fall and never rise',
 'select value from conversion_factors where key = ''nav_broken_pages_ceiling''',
 0, 'elevated', 'Agent B', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql;;
