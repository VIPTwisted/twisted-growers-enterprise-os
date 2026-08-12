-- ---------------------------------------------------------------------------
-- 0060 — Put the forensic audit on Command Center and the Cultivation dashboard.
--
-- The 400-line matview is NOT retyped: it is RENAMED to _base and a view of the
-- same name takes its place, unioning the base with the audit tiles. Re-keying a
-- definition that long by hand risks one silent typo blanking every dashboard,
-- which is exactly the failure this codebase has already had once.
--
-- The refresh function is repointed at the base in the same transaction, because
-- REFRESH MATERIALIZED VIEW cannot run against a view and the "Recompute now"
-- button would otherwise fail.
-- ---------------------------------------------------------------------------
alter materialized view mv_department_dashboard rename to mv_department_dashboard_base;

create or replace view v_dept_dash_audit_tiles as
with ytd as (
  select line_no, pounds from f_inventory_reconciliation(
     make_date(extract(year from current_date)::int,1,1), current_date)),
pos as (
  select coalesce(sum(pounds) filter (where stage_group<>'SOLD' and unit_type='PACKAGE'),0)         as onhand_lb,
         coalesce(sum(pounds) filter (where stage_group<>'SOLD' and not is_ours),0)                 as third_party_lb,
         coalesce(sum(pounds) filter (where stage='DRIED - AWAITING TRIM'),0)                        as awaiting_trim_lb,
         coalesce(sum(pounds) filter (where stage='DRIED BULK FLOWER'),0)                            as bulk_lb,
         coalesce(sum(pounds) filter (where stage='FINISHED GOODS - PACKAGED'),0)                    as finished_lb,
         coalesce(sum(plant_count) filter (where stage_group='NOT FINISHED' and unit_type='PLANT'),0) as plants
  from v_forensic_inventory),
noinv as (
  select count(*) n, coalesce(round(sum(pounds)::numeric,1),0) lb
  from v_forensic_sold_by_tag
  where invoice_match='NO APEX INVOICE' and not internal_transfer
    and shipped_on >= make_date(extract(year from current_date)::int,1,1))
select 'Command'::text as department, 9 as ord,
       'Inventory variance, unexplained'::text as kpi,
       (select pounds from ytd where line_no=9) as value,
       'lb'::text as unit, 'bad'::text as tone,
       'Expected on hand less counted, year to date, from five independent sources. '
       'Negative is manufacturing yield loss, which Metrc never tags.'::text as context,
       'forensic_reconciliation'::text as drill, now() as computed_at
union all
select 'Command', 10, 'Sold and shipped, year to date',
       -(select pounds from ytd where line_no=4), 'lb', 'info',
       'Outbound manifests only. Movement between our own two licences is excluded — '
       'it is not a sale.', 'forensic_sold_by_tag', now()
union all
select 'Command', 11, 'Shipped with no Apex invoice',
       (select lb from noinv), 'lb', 'bad',
       (select n || ' outbound lines this year carry no matching Apex invoice. Apex is '
        'the record of truth for sales.' from noinv), 'forensic_sold_by_tag', now()
union all
select 'Command', 12, 'Third party material on hand',
       (select round(third_party_lb::numeric,1) from pos), 'lb', 'warn',
       'Not grown or processed by us. Always reported separately from our own.',
       'forensic_position', now()
union all
select 'Cultivation', 7, 'Plants growing now',
       (select plants from pos), '', 'info',
       'Live plants across the flower rooms and mother stock. Counted, never weighed.',
       'forensic_room_census', now()
union all
select 'Cultivation', 8, 'Produced from our harvests, year to date',
       (select pounds from ytd where line_no=1), 'lb', 'info',
       'Packages made directly off a harvest, dated on the package''s own PackagedDate.',
       'forensic_reconciliation', now()
union all
select 'Cultivation', 9, 'Dried, awaiting trim',
       (select round(awaiting_trim_lb::numeric,1) from pos), 'lb', 'warn',
       'In the pre-trim rooms now — dried and not yet through trim.',
       'forensic_room_census', now()
union all
select 'Cultivation', 10, 'Dried bulk flower on hand',
       (select round(bulk_lb::numeric,1) from pos), 'lb', 'info',
       'Cure vault and fulfillment vault.', 'forensic_position', now();

comment on view v_dept_dash_audit_tiles is
  'Forensic audit tiles for Command Center and the Cultivation dashboard. Computed '
  'LIVE rather than at matview refresh, so the variance figure can never go stale '
  'against the ledger it is drawn from.';

create or replace view mv_department_dashboard as
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_department_dashboard_base
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from v_dept_dash_audit_tiles;

comment on view mv_department_dashboard is
  'The dashboard feed. Kept as a VIEW over mv_department_dashboard_base (the original '
  'materialised view, renamed, not rewritten) plus the live audit tiles. The app reads '
  'this name, so nothing in the front end changes.';

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  -- refresh the BASE: REFRESH MATERIALIZED VIEW cannot target a view
  refresh materialized view concurrently mv_department_dashboard_base;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;

grant select on mv_department_dashboard, v_dept_dash_audit_tiles to authenticated;
;
