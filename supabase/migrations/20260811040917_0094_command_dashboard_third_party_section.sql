-- ---------------------------------------------------------------------------
-- 0094 — THIRD-PARTY FORENSIC section on the Command dashboard.
--
-- Tiles aggregate directly and are MATERIALISED. An earlier version computed live
-- off the event ledger and timed out both the dashboard and tg_snapshot_dashboards,
-- leaving the dashboards broken until it was replaced. Do not put a ledger walk
-- behind a tile.
-- ---------------------------------------------------------------------------
create or replace view v_dept_dash_third_party as
with f as (select * from v_third_party_forensic),
paid as (
  select round(sum(nullif(t.source_row->>'Receiver Wholesale Price','')::numeric)::numeric,0) usd,
         round(sum(coalesce(case when (t.source_row->>'Weight Ship''d') ~ '^[0-9.]+$'
                   then (t.source_row->>'Weight Ship''d')::numeric end, t.shipped_lb))::numeric,1) lb
  from metrc_rpt_package_transfers t
  where f_is_ours(coalesce(nullif(t.source_row->>'Dest. Lic.',''), t.destination_licence))
    and not f_is_ours(coalesce(nullif(t.source_row->>'Origin Lic.',''), t.licence))
    and coalesce(t.source_row->>'Voided','False') <> 'True')
select 'Command'::text as department, 20 as ord,
       'Third-party material on hand'::text as kpi,
       (select round(sum(lb_on_hand)::numeric,1) from f) as value,
       'lb'::text as unit, 'info'::text as tone,
       (select 'Across ' || count(*) || ' tags from ' || count(distinct supplier)
               || ' suppliers. Purchased material only — never our own.'
        from f where lb_on_hand > 0) as context,
       'third_party_forensic'::text as drill, now() as computed_at
union all
select 'Command', 21, 'Third-party spend, all time',
       (select usd from paid), '$', 'info',
       (select 'For ' || lb || ' lb at $' || round(usd/nullif(lb,0)) || '/lb. Taken from the '
               || 'manifests'' own Receiver Wholesale Price — what we actually paid, not an estimate.'
        from paid),
       'third_party_forensic', now()
union all
select 'Command', 22, 'Third-party UNEXPLAINED',
       (select round(sum(lb_received)::numeric,1) from f where status like 'UNEXPLAINED%'), 'lb', 'bad',
       (select count(*) || ' tags where the record stops with no sale, no processing and no '
               || 'destruction. Every one has a manifest and a COA — the gap is a missing Metrc entry, '
               || 'not missing paperwork.' from f where status like 'UNEXPLAINED%'),
       'third_party_forensic', now()
union all
select 'Command', 23, 'Third-party cash tied up over 90 days',
       (select round(sum(lb_on_hand)::numeric,1) from f
        where ageing_band in ('90-180 days','OVER 180 DAYS — CASH TIED UP')), 'lb', 'warn',
       (select coalesce(count(*),0) || ' tags held more than 90 days since delivery. Oldest: '
               || coalesce(max(days_unsold_still_here)::text,'0') || ' days.'
        from f where ageing_band in ('90-180 days','OVER 180 DAYS — CASH TIED UP')),
       'third_party_forensic', now()
union all
select 'Command', 24, 'Failed material — remediated and processed on',
       (select round(sum(lb_received)::numeric,1) from f where lab_failures > 0), 'lb', 'info',
       (select count(*) || ' third-party tags failed a lab test — almost always yeast and mould. '
               || 'This is NOT a compliance issue: failed material is remediated and processed on. '
               || 'The parent tag keeps TestFailed; follow the child.' from f where lab_failures > 0),
       'third_party_forensic', now()
union all
select 'Command', 25, 'Third-party resold at markup',
       (select round(sum(coalesce(exit_lb,0) + coalesce(lb_sold,0))::numeric,1) from f), 'lb', 'ok',
       (select 'Sold on for $' || round(sum(coalesce(exit_sold_usd,0)))
               || '. Traced through the child tag on the outbound manifest — the parent alone '
               || 'looks like a dead end.' from f),
       'third_party_forensic', now();

grant select on v_dept_dash_third_party to authenticated;

drop materialized view if exists mv_dept_dash_third_party;
create materialized view mv_dept_dash_third_party as select * from v_dept_dash_third_party;
create unique index mv_dept_dash_third_party_uq on mv_dept_dash_third_party (department, kpi, ord);
grant select on mv_dept_dash_third_party to authenticated;

create or replace view mv_department_dashboard as
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_department_dashboard_base
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_dept_dash_audit_tiles
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
  from mv_dept_dash_third_party;

create or replace function tg_snapshot_dashboards()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view mv_forensic_sales;
  refresh materialized view concurrently mv_tag_certificate;
  refresh materialized view concurrently mv_tag_harvest_link;
  refresh materialized view concurrently mv_harvest_certificate;
  refresh materialized view concurrently mv_dept_dash_audit_tiles;
  refresh materialized view concurrently mv_dept_dash_third_party;
  insert into dashboard_snapshots (taken_on, department, kpi, value, unit)
  select current_date, department, kpi, value, unit from mv_department_dashboard
  on conflict (taken_on, department, kpi) do update set value = excluded.value;
  get diagnostics n = row_count;
  return n;
end $function$;

update report_registry
   set dimensions = array['year_received','supplier','supplier_licence','delivered_by','our_licence',
        'category','strain','status','lab_result','lab_state','initial_lab_state','ageing_band',
        'current_room','current_sublocation','inbound_manifest','outbound_manifest','exit_manifest',
        'sold_to','exit_sold_to','made_into','destroy_reason','destroyed_by','lab_name',
        'contains_remediated','contains_decontaminated'],
       measures = array['lb_received','lb_on_hand','lb_sold','made_lb','lb_adjusted','exit_lb',
        'exit_sold_usd','age_on_arrival_days','days_held_total','days_to_process','days_to_sell',
        'days_unsold_still_here','lab_tests','lab_failures']
 where report_key = 'inventory.third_party_forensic';
;
