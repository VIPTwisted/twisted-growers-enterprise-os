-- ---------------------------------------------------------------------------
-- 0097 — Variance is NOT windowable, and my first version produced a wrong number.
--
-- 0096 recomputed the variance tile by subtracting WINDOWED flows from TODAY'S
-- counted position. For a partial window that is incoherent -- it returned +4,116.6
-- lb for 2025, a positive variance, when the all-time figure is -2,648.7. It compares
-- a position at one date against flows over a different span.
--
-- A variance needs an OPENING position, and we cannot compute a historic position
-- reliably (three snapshots; the event ledger reproduces 87.5% of open tags within
-- 2 lb). So variance is now a POSITION tile: always all-time against today's count,
-- and it says so rather than silently changing when someone moves the dates.
--
-- Also: "Sold and shipped, year to date" is renamed when a range is applied, because
-- a tile that says "year to date" while showing one month is lying in its label.
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
         (coalesce(p_to, current_date) >= current_date - 1
          and coalesce(p_from, date '2023-01-01') <= date '2023-01-01') as is_all_time,
         (coalesce(p_to, current_date) >= current_date - 1)             as ends_today),
flow as (
  select
    (select coalesce(sum(pounds),0) from v_transfer_line, w
      where direction='OUTBOUND' and voided<>'True' and received_on between w.f and w.t) sold_lb,
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
    (select coalesce(sum(s.pounds),0) from v_forensic_sold_by_tag s, w
      where s.invoice_match='NO APEX INVOICE' and not s.internal_transfer
        and s.shipped_on between w.f and w.t) noinvoice_lb,
    (select coalesce(sum(coalesce(x.exit_lb,0)),0) from v_third_party_forensic x, w
      where x.exit_shipped_on between w.f and w.t) tp_resold_lb,
    (select count(distinct fingerprint) from watchdog_findings, w
      where observed_at::date between w.f and w.t) findings),
-- which tiles are genuinely windowable
k as (select '(sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings)' pat)
select b.department, b.ord,
       -- a label must not say "year to date" while showing one month
       case when b.kpi ilike '%year to date%' and not (select is_all_time from w)
            then replace(b.kpi, ', year to date', ' in the selected range')
            else b.kpi end                                              as kpi,
       case
         when b.kpi ilike '%sold and shipped%'           then round((select sold_lb from flow)::numeric,1)
         when b.kpi ilike '%third-party spend%'          then round((select spend_usd from flow)::numeric,0)
         when b.kpi ilike '%produced from our harvests%' then round((select produced_lb from flow)::numeric,1)
         when b.kpi ilike '%no apex invoice%'            then round((select noinvoice_lb from flow)::numeric,1)
         when b.kpi ilike '%resold at markup%'           then round((select tp_resold_lb from flow)::numeric,1)
         when b.kpi ilike '%watchdog findings%'          then (select findings from flow)::numeric
         else b.value end                                               as value,
       b.unit, b.tone,
       b.context ||
         case
           when b.kpi ~* (select pat from k)
             then '  ·  Recomputed for ' || (select f from w) || ' to ' || (select t from w) || '.'
           when b.kpi ilike '%inventory variance%'
             then '  ·  ALL TIME against today''s count. A variance needs an opening position, '
                  || 'and no counted position exists for a past date — so this tile does not move with the range.'
           when (select ends_today from w) then '  ·  Position as at today.'
           else '  ·  POSITION AS AT TODAY. It cannot be restated to ' || (select t from w)
                || ' — no counted position exists for that date.'
         end                                                            as context,
       b.drill, b.computed_at,
       case when b.kpi ~* (select pat from k) then 'FLOW'
            when b.kpi ilike '%inventory variance%' then 'ALL TIME ONLY'
            else 'POSITION' end                                         as tile_kind,
       case when b.kpi ~* (select pat from k) then true
            when b.kpi ilike '%inventory variance%' then false
            when (select ends_today from w) then true
            else false end                                              as honours_range,
       case when b.kpi ~* (select pat from k) then 'Recomputed for the selected range'
            when b.kpi ilike '%inventory variance%' then 'All time — a variance needs an opening position'
            when (select ends_today from w) then 'Position as at today'
            else 'Cannot be restated to a past date — no counted position exists' end as range_note
from mv_department_dashboard b
where b.department = p_dept
order by b.ord;
$$;

grant execute on function f_department_dashboard to authenticated;
;
