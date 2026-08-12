-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-035 (reviewers V, X, W).
-- Owner: "we are missing so much - this is not full management of the company. Literally every
-- aspect, every department dumps here, one global management view."
--
-- MEASURED FIRST. 11 departments publish 43 tiles. But: "Sales & Cash", a REQUIRED category
-- under the owner's dashboard rule 1, publishes ZERO tiles - a named hole, not an oversight to
-- paper over. And of 1,579 open findings only 5 carry a department - the rest sit unattributed,
-- which is WHY Command feels empty of company: the problems exist but are not routed to the
-- units that own them.
--
-- THE DESIGN. One row per department: its tiles rolled up (how many, how many bad), its routed
-- findings, its orders in flight, oldest open item. PLUS one deliberately loud UNROUTED row
-- carrying everything no department owns - the single most important row on the board, because
-- a global view that hides the unattributed pile is a lie of omission. Command renders this as
-- the company band: one compact entity card per department, drill to that department's own
-- dashboard (rule 4: everything replicates up).
--
-- UNDO: drop view v_global_management;

create or replace view public.v_global_management as
with depts as (
  select department, count(*) as tiles,
         count(*) filter (where tone = 'bad') as tiles_bad,
         count(*) filter (where value is null) as tiles_null
  from mv_department_dashboard group by department
),
f as (
  select coalesce(nullif(department,''),'UNROUTED') as department,
         count(*) as open_findings,
         count(*) filter (where severity='critical') as critical_findings,
         min(first_raised)::date as oldest_finding
  from v_findings where resolved_at is null and not coalesce(is_duplicate,false)
  group by 1
),
t as (
  select coalesce(nullif(department,''),'UNROUTED') as department,
         count(*) as open_orders,
         count(*) filter (where due_on < current_date) as orders_overdue
  from tasks where status not in ('done','completed') group by 1
)
select coalesce(d.department, f.department, t.department)      as department,
       (coalesce(d.department, f.department, t.department) = 'UNROUTED') as is_the_unrouted_pile,
       coalesce(d.tiles, 0)          as tiles,
       coalesce(d.tiles_bad, 0)      as tiles_bad,
       coalesce(d.tiles_null, 0)     as tiles_null,
       coalesce(f.open_findings, 0)  as open_findings,
       coalesce(f.critical_findings, 0) as critical_findings,
       f.oldest_finding,
       coalesce(t.open_orders, 0)    as open_orders,
       coalesce(t.orders_overdue, 0) as orders_overdue,
       case
         when coalesce(f.critical_findings,0) > 0 then 'bad'
         when coalesce(d.tiles_bad,0) > 0 or coalesce(t.orders_overdue,0) > 0 then 'watch'
         when coalesce(d.tiles,0) = 0 then 'bad'
         else 'good'
       end as tone,
       case when coalesce(d.tiles,0) = 0 and coalesce(d.department,'') <> ''
            then 'PUBLISHES NO TILES — a required category with nothing replicating up (rule 1/4)'
            end as gap_note
from depts d
full outer join f on f.department = d.department
full outer join t on t.department = d.department
union all
select 'Sales & Cash', false, 0, 0, 0, 0, 0, null, 0, 0, 'bad',
       'REQUIRED CATEGORY, ZERO TILES PUBLISHED — the named hole in rule 1 coverage, measured 12 Aug 2026'
where not exists (select 1 from mv_department_dashboard where department = 'Sales & Cash');

comment on view public.v_global_management is
 'One row per department - the company on one board: tiles rolled up, routed findings, orders in '
 'flight, oldest open item, plus the UNROUTED row carrying everything no department owns (1,574 '
 'of 1,579 findings at creation - THE most important row, because hiding the unattributed pile '
 'is a lie of omission). Sales & Cash appears with its own gap row: required by dashboard rule 1, '
 'publishing nothing. Command renders this as the company band, each card drilling to its '
 'department dashboard - rule 4, everything replicates up, finally true.';;
