/* WINDOW TILES JOIN THE POSITIONS — owner ruling, 19 Aug 2026 ("yes").
 *
 * Positions cannot be restated to a past date and never will be: 19 harvests
 * are open NOW, and no January version of that fact exists. But the owner
 * wants the WINDOW's own story next to them, honestly labelled. So when a
 * real range is set, five FLOW tiles append to the Command strip (ords 91-95),
 * each computed strictly from events dated inside the window:
 *   91 Harvests cut in the window (count; wet lb in context)
 *   92 Ran past the open limit in the window (closed in window, duration over
 *      the owner rule harvest_open_max_days)
 *   93 Water recorded in the window (moisture written on harvests closed in it)
 *   94 Failed testing in the window (result date inside it)
 *   95 Submitted for testing in the window (submission date inside it)
 * All-time (no range) keeps the strip exactly as it was — the extras exist
 * only when a window gives them meaning. The front end renders whatever rows
 * this function serves, so no code change is needed anywhere. */

CREATE OR REPLACE FUNCTION public.f_department_dashboard(p_dept text, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date)
 RETURNS TABLE(department text, ord integer, kpi text, value numeric, unit text, tone text, context text, drill text, computed_at timestamp with time zone, tile_kind text, honours_range boolean, range_note text)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
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
k as (select '(sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings)' pat),
main as (
select b.department, b.ord,
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
),
extras as (
  select 'Command'::text as department, x.ord, x.kpi, x.value, x.unit, 'info'::text as tone,
         x.context || '  ·  Computed strictly from events dated ' || (select f from w) || ' to ' || (select t from w) || '.' as context,
         x.drill, now() as computed_at, 'FLOW'::text as tile_kind, true as honours_range,
         'Recomputed for the selected range'::text as range_note
  from (
    select 91 as ord, 'Harvests cut in the window' as kpi,
           (select count(*)::numeric from v_moisture_accounting m, w where m.harvest_start_date between w.f and w.t) as value,
           '' as unit,
           'Wet weight cut: ' || (select coalesce(round(sum(m.wet_lb),1),0) from v_moisture_accounting m, w
              where m.harvest_start_date between w.f and w.t) || ' lb.' as context,
           'moisture_loss_register' as drill
    union all
    select 92, 'Ran past the open limit in the window',
           (select count(*)::numeric from v_moisture_accounting m, w
             where m.finished::date between w.f and w.t
               and (m.finished::date - m.harvest_start_date) > f_rule('harvest_open_max_days')),
           '',
           'Harvests CLOSED inside the window whose open duration exceeded the owner rule of '
             || f_rule('harvest_open_max_days') || ' days.',
           'harvest_issues'
    union all
    select 93, 'Water recorded in the window',
           (select coalesce(round(sum(m.moisture_lb),1),0) from v_moisture_accounting m, w
             where m.finished::date between w.f and w.t),
           'lb',
           'Moisture written on the ' || (select count(*) from v_moisture_accounting m, w
              where m.finished::date between w.f and w.t) || ' harvests closed inside the window.',
           'moisture_loss_register'
    union all
    select 94, 'Failed testing in the window',
           (select coalesce(round(sum(f_to_pounds(p.quantity, p.uom)) filter (where f_is_weight(p.uom)),1),0)
              from (select distinct on (d.tag) d.* from metrc_packages d
                    order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                             (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p, w
             where p.lab_testing_state = 'TestFailed'
               and nullif(p.raw->>'LabTestingRecordedDate','')::date between w.f and w.t),
           'lb',
           (select count(*) from (select distinct on (d.tag) d.* from metrc_packages d
                    order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                             (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p, w
             where p.lab_testing_state = 'TestFailed'
               and nullif(p.raw->>'LabTestingRecordedDate','')::date between w.f and w.t)
             || ' packages whose FAILED result was recorded inside the window (weight-based pounds shown; counted items are in the package count).',
           'failed_testing_by_origin'
    union all
    select 95, 'Submitted for testing in the window',
           (select count(*)::numeric from (select distinct on (d.tag) d.* from metrc_packages d
                    order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                             (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p, w
             where nullif(p.raw->>'LabTestingStateDate','')::date between w.f and w.t
               and p.lab_testing_state is distinct from 'NotSubmitted'),
           '',
           'Packages whose testing submission date falls inside the window.',
           'lab_results'
  ) x
  where p_dept = 'Command' and not (select is_all_time from w)
)
select * from main
union all
select * from extras
order by ord;
$function$;;
