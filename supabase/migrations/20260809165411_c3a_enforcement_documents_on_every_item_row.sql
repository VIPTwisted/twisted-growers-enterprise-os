-- RULE C3a, MADE MECHANICAL. Owner-set 7 Aug 2026, binding:
--   "EVERY ITEM ROW IN EVERY DRILL-DOWN CARRIES ITS CERTIFICATE AND ITS
--    MANIFEST — sitewide, every time... An item row without both is not
--    finished and must not ship."
--
-- rule-ledger.mjs scored C3a as HOPE: 23 of 50 rules have nothing mechanical
-- behind them, and C3a sat in the largest unenforced cluster. A rule the owner
-- made binding, that nothing measures, is a rule that quietly stops being true.
--
-- Measured 8 Aug 2026 across every enabled page whose view exposes item-level
-- rows: 57 such pages, and only 17 carry BOTH documents.
--     17 both        7 certificate only      11 manifest only      22 NEITHER
--
-- This does not fix those 40 pages. It makes them countable, names each one, and
-- gives the count a floor that may not rise — the ratchet shape this repo
-- already uses, because a gate red on arrival gets switched off.
create or replace view v_c3a_document_coverage as
with pages as (
  select n.view_key, n.label, n.category, n.subcategory, n.table_ref
  from nav_registry n
  where n.enabled and n.table_ref is not null
),
cols as (
  select p.view_key, p.label, p.category, p.subcategory, p.table_ref,
         bool_or(c.column_name in ('package_tag','tag'))                        as is_item_level,
         bool_or(c.column_name ilike '%certificate%' or c.column_name ilike '%coa%') as has_certificate,
         bool_or(c.column_name ilike '%manifest%')                              as has_manifest
  from pages p
  join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = p.table_ref
  group by 1,2,3,4,5
)
select view_key, label, category, subcategory, table_ref,
       has_certificate, has_manifest,
       case
         when has_certificate and has_manifest then 'COMPLIES'
         when has_certificate then 'BREACH — certificate only, no manifest'
         when has_manifest    then 'BREACH — manifest only, no certificate'
         else                      'BREACH — neither document reachable from the row'
       end                                                                      as c3a,
       case
         when has_certificate and has_manifest then null
         else 'C3a: an item row must carry both documents, openable from the row. '
           || 'Where one is absent the row states WHICH reason — never a blank, never a dash. '
           || 'f_package_documents(tag) already returns both with a signed link; reuse it, do not rebuild it.'
       end                                                                      as what_to_do
from cols
where is_item_level;

comment on view v_c3a_document_coverage is
  'Rule C3a made countable: every enabled page whose view exposes item-level rows, and whether the certificate and the manifest are reachable from that row. 57 item-level pages measured 8 Aug 2026, 17 complying. Does not fix them — makes them impossible to lose track of.';

grant select on v_c3a_document_coverage to authenticated;
revoke all on v_c3a_document_coverage from anon;

insert into nav_registry (category, category_order, label, item_order, icon, view_key,
                          table_ref, description, enabled, admin_only, surface, subcategory)
values ('Settings', (select category_order from nav_registry where category='Settings' limit 1),
        'Rule C3a — Documents On Every Item Row', 3, 'gauge',
        'c3a_coverage', 'v_c3a_document_coverage',
        'Every page showing item rows, and whether the certificate and manifest are reachable from the row as rule C3a requires. 17 of 57 comply.',
        true, true, 'side', 'Programme')
on conflict do nothing;;
