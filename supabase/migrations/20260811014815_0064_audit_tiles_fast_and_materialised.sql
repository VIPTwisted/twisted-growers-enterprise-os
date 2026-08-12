-- ---------------------------------------------------------------------------
-- 0064 — Replace the live audit tiles with direct aggregates, and materialise them.
--
-- 0060 built these to compute LIVE "so the variance can never go stale". That was
-- the wrong trade: f_inventory_reconciliation reconstructs the whole package event
-- ledger, and putting it behind a dashboard tile timed out both the dashboard read
-- and tg_snapshot_dashboards. The dashboard was left broken from 0060 until here.
--
-- These tiles now hit the five sources directly, with no ledger reconstruction, and
-- are materialised and refreshed alongside the base. The full reconciliation still
-- lives in the report, where a slower query is acceptable.
-- ---------------------------------------------------------------------------
create or replace view v_dept_dash_audit_tiles as
with yr as (select make_date(extract(year from current_date)::int,1,1) d0, current_date d1),
prod as (
  select coalesce(sum(f_to_pounds(coalesce((p.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams')))
           filter (where (p.raw->>'PackagedDate')::date between (select d0 from yr) and (select d1 from yr)),0) lb_ytd,
         coalesce(sum(f_to_pounds(coalesce((p.raw->>'CreatedQuantity')::numeric,0),
             coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))),0) lb_all
  from metrc_packages p
  where nullif(p.raw->>'SourceHarvestNames','') is not null
    and nullif(p.raw->>'SourcePackageLabels','') is null
    and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))),
xf as (
  select coalesce(sum(pounds) filter (where direction='INBOUND'),0)  in_all,
         coalesce(sum(pounds) filter (where direction='OUTBOUND'),0) out_all,
         coalesce(sum(pounds) filter (where direction='OUTBOUND'
                  and received_on between (select d0 from yr) and (select d1 from yr)),0) out_ytd
  from v_transfer_line where voided <> 'True'),
adj as (select coalesce(sum(f_to_pounds(quantity,uom)),0) lb from metrc_rpt_adjustments
        where quantity is not null and f_is_weight(uom)),
onhand as (
  select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
         coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0) lb
  from metrc_packages
  where not coalesce((raw->>'IsFinished')::boolean,false)
    and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),
pos as (
  select coalesce(sum(pounds) filter (where not is_ours),0)                     third_party_lb,
         coalesce(sum(pounds) filter (where stage='DRIED - AWAITING TRIM'),0)   awaiting_trim_lb,
         coalesce(sum(pounds) filter (where stage='DRIED BULK FLOWER'),0)       bulk_lb,
         coalesce(sum(plant_count) filter (where unit_type='PLANT'),0)          plants
  from v_forensic_inventory where stage_group <> 'SOLD'),
noinv as (
  select count(*) n, coalesce(round(sum(pounds)::numeric,1),0) lb
  from v_forensic_sold_by_tag
  where invoice_match='NO APEX INVOICE' and not internal_transfer
    and shipped_on between (select d0 from yr) and (select d1 from yr))
select 'Command'::text as department, 9 as ord,
       'Inventory variance, unexplained'::text as kpi,
       round(((select lb from onhand)
            -((select lb_all from prod)+(select in_all from xf)
             -(select out_all from xf)+(select lb from adj)))::numeric,1) as value,
       'lb'::text as unit, 'bad'::text as tone,
       'Counted on hand less expected, since inception, from five independent sources. '
       'Negative is manufacturing yield loss, which Metrc never tags.'::text as context,
       'forensic_reconciliation'::text as drill, now() as computed_at
union all
select 'Command', 10, 'Sold and shipped, year to date',
       round((select out_ytd from xf)::numeric,1), 'lb', 'info',
       'Outbound manifests only. Movement between our own two licences is excluded — it is not a sale.',
       'forensic_sold_by_tag', now()
union all
select 'Command', 11, 'Shipped with no Apex invoice',
       (select lb from noinv), 'lb', 'bad',
       (select n || ' outbound lines this year carry no matching Apex invoice. Apex is the record of truth for sales.'
        from noinv), 'forensic_sold_by_tag', now()
union all
select 'Command', 12, 'Third party material on hand',
       round((select third_party_lb from pos)::numeric,1), 'lb', 'warn',
       'Not grown or processed by us. Always reported separately from our own.',
       'forensic_position', now()
union all
select 'Cultivation', 7, 'Plants growing now',
       (select plants from pos), '', 'info',
       'Live plants across the flower rooms and mother stock. Counted, never weighed.',
       'forensic_room_census', now()
union all
select 'Cultivation', 8, 'Produced from our harvests, year to date',
       round((select lb_ytd from prod)::numeric,1), 'lb', 'info',
       'Packages made directly off a harvest, dated on the package''s own PackagedDate.',
       'forensic_reconciliation', now()
union all
select 'Cultivation', 9, 'Dried, awaiting trim',
       round((select awaiting_trim_lb from pos)::numeric,1), 'lb', 'warn',
       'In the pre-trim rooms now — dried and not yet through trim.',
       'forensic_room_census', now()
union all
select 'Cultivation', 10, 'Dried bulk flower on hand',
       round((select bulk_lb from pos)::numeric,1), 'lb', 'info',
       'Cure vault and fulfillment vault.', 'forensic_position', now();

create materialized view mv_dept_dash_audit_tiles as select * from v_dept_dash_audit_tiles;
create unique index mv_dept_dash_audit_uq on mv_dept_dash_audit_tiles (department, kpi, ord);

create or replace view mv_department_dashboard as
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_department_dashboard_base
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_dept_dash_audit_tiles;

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_dept_dash_audit_tiles;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;

grant select on mv_dept_dash_audit_tiles to authenticated;
;
