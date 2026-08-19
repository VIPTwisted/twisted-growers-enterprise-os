/* Planner fix for positions_restate_as_of_the_end_date: the same function with
 * flow/k/led/asof/basis marked NOT MATERIALIZED. With plain CTEs the planner
 * materialized the whole flow row — including the third-party-spend column
 * whose per-row f_is_ours over 19k transfer rows blew the statement budget —
 * even for tiles that never read it. NOT MATERIALIZED restores lazy per-branch
 * evaluation: untaken branches cost nothing. Logic unchanged. */

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
flow as not materialized (
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
k as not materialized (select '(sold and shipped|third-party spend|produced from our harvests|no apex invoice|resold at markup|watchdog findings)' pat),
led as not materialized (
  select p.tag, p.uom, p.lab_testing_state,
         coalesce(p.raw #>> '{Item,ProductCategoryName}','(uncategorised)') as category,
         p.packaged_on,
         least(nullif(p.raw->>'FinishedDate','')::date, nullif(p.raw->>'ArchivedDate','')::date) as closed_on,
         nullif(p.raw->>'LabTestingStateDate','')::date    as submitted_on,
         nullif(p.raw->>'LabTestingRecordedDate','')::date as result_on,
         case when least(nullif(p.raw->>'FinishedDate','')::date, nullif(p.raw->>'ArchivedDate','')::date) is not null
              then coalesce((p.raw->>'InitialQuantity')::numeric, coalesce(p.quantity,0))
              else coalesce(p.quantity,0) end as qty_basis
  from (select distinct on (d.tag) d.* from metrc_packages d
        order by d.tag, (coalesce(d.quantity,0) > 0 and not coalesce((d.raw->>'IsFinished')::boolean,false)) desc,
                 (d.source_state = 'active') desc nulls last, d.synced_at desc nulls last) p
),
asof as not materialized (
  select
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.category ilike 'bud%' and l.packaged_on <= w.t
        and (l.closed_on is null or l.closed_on > w.t))                              as dried_lb,
    (select count(*) from v_moisture_accounting m, w
      where m.harvest_start_date <= w.t and (m.finished::date is null or m.finished::date > w.t)) as open_h,
    (select coalesce(round(sum(m.wet_lb),1),0) from v_moisture_accounting m, w
      where m.harvest_start_date <= w.t and (m.finished::date is null or m.finished::date > w.t)) as open_wet_lb,
    (select count(*) from v_moisture_accounting m, w
      where m.harvest_start_date <= w.t and (m.finished::date is null or m.finished::date > w.t)
        and (w.t - m.harvest_start_date) > f_rule('harvest_open_max_days'))          as open_too_long,
    (select coalesce(round(sum(greatest(m.wet_lb - m.packaged_lb - m.recorded_waste_lb - m.moisture_lb, 0)),1),0)
       from v_moisture_accounting m, w
      where m.finished::date <= w.t and coalesce(m.moisture_lb,0) <= 0)              as phantom_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.submitted_on <= w.t and (l.result_on is null or l.result_on > w.t)
        and (l.closed_on is null or l.closed_on > w.t))                              as at_lab_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t)
        and (l.submitted_on is null or l.submitted_on > w.t))                        as unsubmitted_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.result_on <= w.t and l.lab_testing_state = 'TestFailed'
        and (l.closed_on is null or l.closed_on > w.t))                              as failed_lb
),
basis as not materialized (select '  ·  AS OF ' || (select t from w) || ', derived from the ledger (birth, closure, submission and result dates). Quantity basis: initial for packages that later closed, current for those still open — the mirror holds no per-day quantities.' note),
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
         when not (select ends_today from w) and b.department = 'Command' then
           case when b.kpi = 'Dried flower on hand'                then (select dried_lb from asof)
                when b.kpi = 'In the rooms, dry-equivalent'        then (select open_wet_lb from asof)
                when b.kpi = 'Harvests open too long'              then (select open_too_long from asof)::numeric
                when b.kpi = 'Moisture loss not recorded'          then (select phantom_lb from asof)
                when b.kpi = 'Out at the laboratory, no result'    then (select at_lab_lb from asof)
                when b.kpi = 'Never submitted for testing'         then (select unsubmitted_lb from asof)
                when b.kpi = 'Failed testing on hand'              then (select failed_lb from asof)
                else b.value end
         else b.value end                                               as value,
       b.unit, b.tone,
       case
         when not (select ends_today from w) and b.department = 'Command'
              and b.kpi in ('Dried flower on hand','In the rooms, dry-equivalent','Harvests open too long',
                            'Moisture loss not recorded','Out at the laboratory, no result',
                            'Never submitted for testing','Failed testing on hand') then
           case when b.kpi = 'In the rooms, dry-equivalent'
                then 'WET pounds across ' || (select open_h from asof) || ' harvests open at the date shown. '
                     || 'Dry-equivalent exists only once moisture is recorded at close, so a past date shows wet.'
                else b.context end || (select note from basis)
         else
           b.context ||
             case
               when b.kpi ~* (select pat from k)
                 then '  ·  Recomputed for ' || (select f from w) || ' to ' || (select t from w) || '.'
               when b.kpi ilike '%inventory variance%'
                 then '  ·  ALL TIME against today''s count. A variance needs an opening position, '
                      || 'and no counted position exists for a past date — so this tile does not move with the range.'
               else '  ·  Position as at today.'
             end
       end                                                              as context,
       b.drill, b.computed_at,
       case when b.kpi ~* (select pat from k) then 'FLOW'
            when b.kpi ilike '%inventory variance%' then 'ALL TIME ONLY'
            when not (select ends_today from w) and b.department = 'Command' then 'POSITION AS OF ' || (select t from w)
            else 'POSITION' end                                         as tile_kind,
       case when b.kpi ~* (select pat from k) then true
            when b.kpi ilike '%inventory variance%' then false
            else true end                                               as honours_range,
       case when b.kpi ~* (select pat from k) then 'Recomputed for the selected range'
            when b.kpi ilike '%inventory variance%' then 'All time — a variance needs an opening position'
            when not (select ends_today from w) then 'Restated as of ' || (select t from w) || ' from the ledger'
            else 'Position as at today' end                             as range_note
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
           (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
              from led l, w where l.lab_testing_state='TestFailed' and l.result_on between w.f and w.t),
           'lb',
           (select count(*) from led l, w where l.lab_testing_state='TestFailed' and l.result_on between w.f and w.t)
             || ' packages whose FAILED result was recorded inside the window (weight-based pounds shown).',
           'failed_testing_by_origin'
    union all
    select 95, 'Submitted for testing in the window',
           (select count(*)::numeric from led l, w
             where l.submitted_on between w.f and w.t and l.lab_testing_state is distinct from 'NotSubmitted'),
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
