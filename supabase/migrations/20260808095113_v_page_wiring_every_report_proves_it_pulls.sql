-- IS EVERY REPORT ACTUALLY WIRED? Owner, 8 Aug 2026: "It must ensure everything is
-- mapped and wired so reports pull accurately."
--
-- 263 of the 549 pages were registered on 8 Aug by PATTERN-MATCHING TABLE NAMES.
-- That is a guess about category and label, not verified mapping. A page that points
-- at nothing, at an empty object, or that no role can see, is a dead link that looks
-- like coverage - the same failure as a downloaded-but-unparsed document.
--
-- This checks every page five ways and says which fail. Nothing here is asserted;
-- it is all re-derived from the catalogue.
-- UNDO: drop view v_page_wiring.

create or replace view public.v_page_wiring as
with pages as (
  select n.view_key, n.label, n.category, n.subcategory, n.report_group,
         n.table_ref, n.admin_only, n.enabled,
         c.oid as obj_oid,
         case c.relkind when 'r' then 'table' when 'v' then 'view'
                        when 'm' then 'materialized view' end as object_kind
  from nav_registry n
  left join pg_class c on c.relname = n.table_ref
   and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m')
  where n.enabled
)
select p.view_key, p.label, p.category, p.subcategory, p.report_group,
       p.table_ref, p.object_kind,
       (select count(*) from information_schema.columns ic
         where ic.table_schema='public' and ic.table_name = p.table_ref) as fields,
       (select count(*) from nav_role_visibility v
         where v.view_key = p.view_key and v.visible) as roles_who_can_see,
       exists (select 1 from report_registry r where r.fact_view = p.table_ref) as in_report_registry,
       (select count(*) from information_schema.columns ic
         where ic.table_schema='public' and ic.table_name = p.table_ref
           and (ic.data_type like '%timestamp%' or ic.data_type = 'date')) as date_columns,
       (select count(*) from brain_claims b where b.covers_object = p.table_ref) as claims_proving_it,
       case
         when p.table_ref is null            then 'NO TARGET - the page names no table or view'
         when p.object_kind is null          then 'BROKEN - points at an object that does not exist'
         when (select count(*) from information_schema.columns ic
                where ic.table_schema='public' and ic.table_name = p.table_ref) = 0
                                             then 'BROKEN - target has no columns'
         when (select count(*) from nav_role_visibility v
                where v.view_key = p.view_key and v.visible) = 0
                                             then 'INVISIBLE - no role can open this page'
         when (select count(*) from information_schema.columns ic
                where ic.table_schema='public' and ic.table_name = p.table_ref
                  and (ic.data_type like '%timestamp%' or ic.data_type = 'date')) = 0
                                             then 'NO DATE COLUMN - cannot support a date range'
         else 'WIRED'
       end                                   as wiring,
       'THE ISSUE: a page that points at nothing, at an empty object, or that no role '
       'can open is a dead link that LOOKS like coverage.'   as what_is_wrong,
       'Fix the table_ref, grant visibility, or disable the page. Never leave a dead '
       'page enabled - it is indistinguishable from a working one in the menu.' as what_to_do
from pages p;

comment on view public.v_page_wiring is
  'Every page in the OS, checked five ways: does it name a target, does that target '
  'exist, does it have columns, can any role open it, and can it support a date '
  'range. WIRED is the good state. 263 pages were registered by pattern-matching '
  'names on 8 Aug 2026 and this is how that guess gets verified.';;
