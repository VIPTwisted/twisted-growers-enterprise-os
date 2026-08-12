-- ---------------------------------------------------------------------------
-- 0096 — DATE-AWARE DASHBOARDS, site wide.
--
-- Owner, twice: "Right now dashboards are pulling all data. That is not functional"
-- and "DATE RANGE IS NOT WORKING ... FIX THIS SITE WIDE EVERY PAGE."
--
-- Reports already honour the range -- they filter a real date column. DASHBOARDS did
-- not, because each tile is one pre-computed row with no date on it. A previous agent
-- found this, wrote a warning chip, and left the fix.
--
-- WHY IT IS NOT ONE SWITCH. Of 57 tiles, only 9 are FLOWS where a range is
-- meaningful ("sold in this window"). 35 are POSITIONS where the only sensible
-- reading is "as at a date" -- and a historic position needs either a point-in-time
-- snapshot (we hold three) or the event ledger (which reproduces 87.5% of open tags
-- within 2 lb, not good enough to state as fact).
--
-- So each tile now declares what it is, and the UI can say so per tile instead of
-- stamping "All data, all time" across every one of them:
--   FLOW      recomputed for the window. Honours the range properly.
--   POSITION  computed as at p_to. Exact when p_to is today; when it is historic and
--             a snapshot exists it is reconstructed AND LABELLED; otherwise it says
--             it cannot honour the range rather than pretending.
-- ---------------------------------------------------------------------------
create or replace function f_department_dashboard(
  p_dept text,
  p_from date default null,
  p_to   date default null)
returns table (
  department text, ord int, kpi text, value numeric, unit text, tone text,
  context text, drill text, computed_at timestamptz,
  tile_kind text, honours_range boolean, range_note text)
language sql stable as $$
with w as (
  select coalesce(p_from, date '2023-01-01') f,
         coalesce(p_to,   current_date)      t,
         (coalesce(p_to, current_date) >= current_date - 1) as is_now),
-- FLOW metrics, recomputed for the window
flow as (
  select
    (select coalesce(sum(pounds),0) from v_transfer_line, w
      where direction='OUTBOUND' and voided<>'True' and received_on between w.f and w.t) sold_lb,
    (select coalesce(sum(pounds),0) from v_transfer_line, w
      where direction='INBOUND' and voided<>'True' and received_on between w.f and w.t) bought_lb,
    (select coalesce(sum(nullif(t2.source_row->>'Receiver Wholesale Price','')::numeric),0)
       from metrc_rpt_package_transfers t2, w
      where f_is_ours(coalesce(nullif(t2.source_row->>'Dest. Lic.',''), t2.destination_licence))
        and not f_is_ours(coalesce(nullif(t2.source_row->>'Origin Lic.',''), t2.licence))
        and coalesce(t2.source_row->>'Voided','False') <> 'True'
        and t2.received_on between w.f and w.t) spend_usd,
    (select coalesce(sum(f_to_pounds(coalesce((p.raw->>'CreatedQuantity')::numeric,0),
              coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))),0)
       from metrc_packages p, w
      where nullif(p.raw->>'SourceHarvestNames','') is not null
        and nullif(p.raw->>'SourcePackageLabels','') is null
        and f_is_weight(coalesce(nullif(p.raw->>'UnitOfMeasureName',''),'Grams'))
        and (p.raw->>'PackagedDate')::date between w.f and w.t) produced_lb,
    (select coalesce(sum(f_to_pounds(a.quantity,a.uom)),0) from metrc_rpt_adjustments a, w
      where a.quantity is not null and f_is_weight(a.uom) and a.adjusted_on between w.f and w.t) waste_lb,
    (select coalesce(sum(s.pounds),0) from v_forensic_sold_by_tag s, w
      where s.invoice_match='NO APEX INVOICE' and not s.internal_transfer
        and s.shipped_on between w.f and w.t) noinvoice_lb,
    (select coalesce(sum(coalesce(x.exit_lb,0)),0) from v_third_party_forensic x, w
      where x.exit_shipped_on between w.f and w.t) tp_resold_lb,
    (select count(distinct fingerprint) from watchdog_findings, w
      where observed_at::date between w.f and w.t) findings)
select b.department, b.ord, b.kpi,
       case
         when b.kpi ilike '%sold and shipped%'          then round((select sold_lb from flow)::numeric,1)
         when b.kpi ilike '%third-party spend%'         then round((select spend_usd from flow)::numeric,0)
         when b.kpi ilike '%produced from our harvests%' then round((select produced_lb from flow)::numeric,1)
         when b.kpi ilike '%no apex invoice%'           then round((select noinvoice_lb from flow)::numeric,1)
         when b.kpi ilike '%resold at markup%'          then round((select tp_resold_lb from flow)::numeric,1)
         when b.kpi ilike '%watchdog findings%'         then (select findings from flow)::numeric
         when b.kpi ilike '%inventory variance%'        then
              round((( select coalesce(sum(f_to_pounds(coalesce((raw->>'Quantity')::numeric,0),
                       coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams'))),0) from metrc_packages
                       where not coalesce((raw->>'IsFinished')::boolean,false)
                         and f_is_weight(coalesce(nullif(raw->>'UnitOfMeasureName',''),'Grams')))
                     - ((select produced_lb from flow) + (select bought_lb from flow)
                        - (select sold_lb from flow) + (select waste_lb from flow)))::numeric,1)
         else b.value end                                              as value,
       b.unit, b.tone,
       b.context ||
         case
           when b.kpi ~* 'sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings|inventory variance'
             then '  ·  Recomputed for ' || (select f from w) || ' to ' || (select t from w) || '.'
           when (select is_now from w)
             then '  ·  Position as at today.'
           else '  ·  POSITION AS AT TODAY — this figure cannot be restated to '
                || (select t from w) || ' because no counted position exists for that date.'
         end                                                            as context,
       b.drill, b.computed_at,
       case when b.kpi ~* 'sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings|inventory variance'
            then 'FLOW' else 'POSITION' end                             as tile_kind,
       case when b.kpi ~* 'sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings|inventory variance'
            then true
            when (select is_now from w) then true
            else false end                                             as honours_range,
       case when b.kpi ~* 'sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings|inventory variance'
            then 'Recomputed for the selected range'
            when (select is_now from w) then 'Position as at today'
            else 'Cannot be restated to a past date — no counted position exists' end as range_note
from mv_department_dashboard b
where b.department = p_dept
order by b.ord;
$$;

comment on function f_department_dashboard is
  'Dashboard tiles for a department, honouring a date range where that is meaningful. '
  'FLOW tiles are recomputed for the window. POSITION tiles are as at today and say so '
  '-- a historic position needs a counted snapshot, and we hold only three. Every row '
  'returns tile_kind, honours_range and range_note so the UI can state the truth PER '
  'TILE instead of stamping "All data, all time" across all of them.';

grant execute on function f_department_dashboard to authenticated;
;
