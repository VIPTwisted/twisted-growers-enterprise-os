-- THIRD FALSE POSITIVE IN MY OWN WIRING CHECK, 8 Aug 2026.
--
-- 30 pages were reported "NO TARGET - names no table or view". Every one is an
-- APPLICATION SCREEN, not a report: Budz Assistant, Control Tower, Dashboards, TG
-- Brain, Planner, Goals, Settings, Users & Permissions, Menu Manager, Messages,
-- Tasks, Teams, Whiteboards, Help. They are hand-built UI and correctly have no
-- table_ref. The check assumed every page is a report and called the rest broken.
--
-- That is the same error shape as the other five detector defects tonight: testing a
-- proxy instead of the thing, then reporting confident nonsense. A page is not broken
-- for failing to be something it was never meant to be.
--
-- FIX: make the distinction EXPLICIT in the data rather than inferred by a rule.
-- page_kind is set once, and the wiring check only demands a target from a report.
-- UNDO: alter table nav_registry drop column page_kind.

alter table nav_registry add column if not exists page_kind text not null default 'report';

comment on column nav_registry.page_kind is
  'report = renders a table_ref and needs filters, date range and export. '
  'application = hand-built UI (assistant, dashboards, settings, messaging) with no '
  'table_ref by design. Set EXPLICITLY - inferring it from a null table_ref made the '
  'wiring check report 30 working screens as broken.';

update nav_registry set page_kind = 'application'
 where table_ref is null
   and view_key in ('budz','tower','dashboards','goals','planner','brain','sop','weekly_fg',
                    'allocation_requests','genealogy','bom','plan_capacity','maintenance',
                    'forensic_trace','metrc_mc','metrc_mp','metrc_report_import','capa',
                    'safety','sop_training','assistant_settings','settings','help',
                    'integrations','menu_manager','permissions','messages','tasks','teams',
                    'whiteboards');

create or replace view public.v_page_wiring as
with pages as (
  select n.view_key, n.label, n.category, n.subcategory, n.report_group,
         n.table_ref, n.page_kind, c.oid as obj_oid,
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
       coalesce(c.fields,0) as fields,
       (select count(*) from nav_role_visibility v
         where v.view_key = p.view_key and v.visible) as roles_who_can_see,
       exists (select 1 from report_registry r where r.fact_view = p.table_ref) as in_report_registry,
       coalesce(c.date_columns,0) as date_columns,
       (select count(*) from brain_claims b where b.covers_object = p.table_ref) as claims_proving_it,
       case
         when (select count(*) from nav_role_visibility v
                where v.view_key = p.view_key and v.visible) = 0
                                                 then 'INVISIBLE - no role can open this page'
         when p.page_kind = 'application'        then 'WIRED - application screen, no table_ref by design'
         when p.table_ref is null                then 'NO TARGET - a report page must name a table or view'
         when p.object_kind is null              then 'BROKEN - points at an object that does not exist'
         when coalesce(c.fields,0) = 0           then 'BROKEN - target has no columns'
         else 'WIRED'
       end                                                        as wiring,
       'THE ISSUE: a page that points at nothing, has no columns, or that no role can '
       'open is a dead link that LOOKS like coverage.'             as what_is_wrong,
       'Fix the table_ref, grant visibility, or disable the page. Never leave a dead '
       'page enabled - in the menu it is indistinguishable from a working one.' as what_to_do,
       (coalesce(c.date_columns,0) = 0 and p.page_kind = 'report') as no_date_range_possible,
       p.page_kind
from pages p left join cols c on c.view_key = p.view_key;

comment on view public.v_page_wiring is
  'Every page verified: a REPORT must name a target that exists and has columns '
  '(pg_attribute, which unlike information_schema covers matviews); an APPLICATION '
  'screen needs none. Every page must be openable by at least one role. WIRED is the '
  'good state.';;
