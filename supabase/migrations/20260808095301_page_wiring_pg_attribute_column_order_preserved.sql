-- MY OWN CHECK WAS WRONG. information_schema.columns DOES NOT LIST MATERIALIZED
-- VIEWS. All 19 pages reported "BROKEN - target has no columns" were matviews with
-- full column sets. The pages were fine; the detector was not. Sixth detector defect
-- found on 7-8 Aug, same shape as the rest: it tested a proxy instead of the thing.
-- pg_attribute covers tables, views AND matviews.
-- Column ORDER is preserved - create or replace cannot reorder or rename.
-- Owner rule: always fix the scanner when it is wrong.

create or replace view public.v_page_wiring as
with pages as (
  select n.view_key, n.label, n.category, n.subcategory, n.report_group,
         n.table_ref, c.oid as obj_oid,
         case c.relkind when 'r' then 'table' when 'v' then 'view'
                        when 'm' then 'materialized view' when 'p' then 'partitioned table' end as object_kind
  from nav_registry n
  left join pg_class c on c.relname = n.table_ref
   and c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','p')
  where n.enabled
),
cols as (
  select p.view_key,
         count(*) filter (where a.attnum > 0 and not a.attisdropped) as fields,
         count(*) filter (where a.attnum > 0 and not a.attisdropped
                            and t.typname in ('date','timestamp','timestamptz')) as date_columns
  from pages p
  left join pg_attribute a on a.attrelid = p.obj_oid
  left join pg_type t on t.oid = a.atttypid
  group by p.view_key
)
select p.view_key, p.label, p.category, p.subcategory, p.report_group,
       p.table_ref, p.object_kind,
       coalesce(c.fields,0)                                      as fields,
       (select count(*) from nav_role_visibility v
         where v.view_key = p.view_key and v.visible)             as roles_who_can_see,
       exists (select 1 from report_registry r where r.fact_view = p.table_ref) as in_report_registry,
       coalesce(c.date_columns,0)                                 as date_columns,
       (select count(*) from brain_claims b where b.covers_object = p.table_ref) as claims_proving_it,
       case
         when p.table_ref is null                then 'NO TARGET - the page names no table or view'
         when p.object_kind is null              then 'BROKEN - points at an object that does not exist'
         when coalesce(c.fields,0) = 0           then 'BROKEN - target has no columns'
         when (select count(*) from nav_role_visibility v
                where v.view_key = p.view_key and v.visible) = 0
                                                 then 'INVISIBLE - no role can open this page'
         else 'WIRED'
       end                                                        as wiring,
       'THE ISSUE: a page that points at nothing, has no columns, or that no role can '
       'open is a dead link that LOOKS like coverage.'             as what_is_wrong,
       'Fix the table_ref, grant visibility, or disable the page. Never leave a dead '
       'page enabled - in the menu it is indistinguishable from a working one.' as what_to_do,
       (coalesce(c.date_columns,0) = 0)                           as no_date_range_possible
from pages p left join cols c on c.view_key = p.view_key;

comment on view public.v_page_wiring is
  'Every page verified four ways: names a target, target exists, has columns (via '
  'pg_attribute, which unlike information_schema covers MATERIALIZED VIEWS), and at '
  'least one role can open it. no_date_range_possible is reported separately - it is '
  'a capability limit, not a wiring fault. WIRED is the good state.';;
