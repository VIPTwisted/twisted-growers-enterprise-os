/* THE AS-OF ENGINE COVERS EVERY DEPARTMENT — owner order, 19 Aug 2026 ("go").
 *
 * Every dashboard tile now answers for the user's dates:
 *  - PACKAGE POSITIONS (stock, sellable, untested, failed, at-lab, ageing,
 *    concentrate, fresh frozen, shake, pre-rolls, and their dollar values)
 *    restate AS OF the window's end date from the package ledger;
 *  - HARVEST POSITIONS (rooms, open-too-long, moisture) restate from the
 *    harvest ledger;
 *  - FLOWS (revenue, manifests, sale lines, no-invoice lines, dry time,
 *    dried-too-long, conversion) recompute strictly for the window;
 *  - the handful that genuinely cannot move (mirror row counts, cross-licence
 *    sync artifacts, on-a-truck whose in-transit state exists only now,
 *    lineage-priced purchased material, registry counts) say exactly why on
 *    the tile instead of pretending.
 * Quantity basis stated on every as-of tile; dollar tiles apply TODAY'S owner
 * cost rate to the as-of pounds and say so. */

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
         p.item_name,
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
rate as not materialized (
  select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1
),
asof as not materialized (
  select
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.category ilike 'bud%' and l.packaged_on <= w.t
        and (l.closed_on is null or l.closed_on > w.t))                              as dried_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t)) as total_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t)
        and l.lab_testing_state = 'TestPassed' and l.result_on <= w.t)               as sellable_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l join stock_ageing_policy pol on pol.category = l.category, w
      where l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t)
        and pol.ages and ((w.t - l.packaged_on) * interval '1 day') > pol.stale_after) as ageing_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.category ~* 'concentrate' and l.packaged_on <= w.t
        and (l.closed_on is null or l.closed_on > w.t))                              as conc_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where (l.category ~* 'fresh.?frozen' or l.item_name ~* 'fresh.?frozen')
        and l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t))     as ff_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where (l.category ~* '(shake|trim)' or l.item_name ~* '(shake|trim)')
        and l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t))     as shake_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where (l.category ~* '(shake|trim)' or l.item_name ~* '(shake|trim)')
        and l.packaged_on <= w.t and (l.closed_on is null or l.closed_on > w.t)
        and l.lab_testing_state='TestPassed' and l.result_on <= w.t)                 as shake_passed_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.category ~* 'pre.?roll' and l.packaged_on <= w.t
        and (l.closed_on is null or l.closed_on > w.t))                              as preroll_lb,
    (select coalesce(round(sum(f_to_pounds(l.qty_basis, l.uom)) filter (where f_is_weight(l.uom)),1),0)
       from led l, w where l.category ~* 'pre.?roll' and l.packaged_on <= w.t
        and (l.closed_on is null or l.closed_on > w.t)
        and (l.submitted_on is null or l.submitted_on > w.t))                        as preroll_untested_lb,
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
wflow as not materialized (
  select
    (select round(avg(h.dry_days_to_first_package) filter (where h.dry_days_to_first_package is not null),1)
       from v_harvest_forensic h, w where h.harvest_closed between w.f and w.t)      as avg_dry,
    (select count(*) from v_harvest_forensic h, w
      where h.harvest_closed between w.f and w.t
        and h.dry_days_to_first_package::numeric > f_rule('dry_window_max_days'))    as dried_long,
    (select round(avg(h.conversion_pct) filter (where h.harvest_closed is not null),1)
       from v_harvest_forensic h, w where h.harvest_closed between w.f and w.t)      as conv,
    (select coalesce(round(sum(s.total_usd),0),0) from mv_forensic_sales s, w
      where not s.cancelled and s.order_date between w.f and w.t)                    as apex_rev,
    (select count(distinct t3.manifest_number) from metrc_rpt_package_transfers t3, w
      where t3.received_on between w.f and w.t
        and coalesce(t3.source_row->>'Voided','False') <> 'True')                    as manifests_n,
    (select count(*) from v_forensic_sold_by_tag s, w
      where s.shipped_on between w.f and w.t)                                        as sale_lines,
    (select count(*) from v_forensic_sold_by_tag s, w
      where s.invoice_match='NO APEX INVOICE' and not s.internal_transfer
        and s.shipped_on between w.f and w.t)                                        as noinv_lines
),
basis as not materialized (select '  ·  AS OF ' || (select t from w) || ', derived from the ledger. Quantity basis: initial for packages that later closed, current for those still open — the mirror holds no per-day quantities.' note),
wnote as not materialized (select '  ·  Recomputed strictly for ' || (select f from w) || ' to ' || (select t from w) || '.' note),
main as (
select b.department, b.ord,
       case when b.kpi ilike '%year to date%' and not (select is_all_time from w)
            then replace(b.kpi, ', year to date', ' in the selected range')
            else b.kpi end                                              as kpi,
       case
         when b.kpi ilike '%sold and shipped%'           then round((select sold_lb from flow)::numeric,1)
         when b.kpi ilike '%third-party spend%'          then round((select spend_usd from flow)::numeric,0)
         when b.kpi ilike '%produced from our harvests%' then round((select produced_lb from flow)::numeric,1)
         when b.kpi ilike '%no apex invoice%' and b.department <> 'Sales & Cash' then round((select noinvoice_lb from flow)::numeric,1)
         when b.kpi ilike '%resold at markup%'           then round((select tp_resold_lb from flow)::numeric,1)
         when b.kpi ilike '%watchdog findings%'          then (select findings from flow)::numeric
         /* WINDOW FLOWS for any bounded window */
         when not (select is_all_time from w) and b.department = 'Cultivation' and b.kpi = 'Average dry time'            then coalesce((select avg_dry from wflow), 0)
         when not (select is_all_time from w) and b.department = 'Cultivation' and b.kpi = 'Harvests dried too long'     then (select dried_long from wflow)::numeric
         when not (select is_all_time from w) and b.department = 'Cultivation' and b.kpi = 'Conversion, dried flower only' then coalesce((select conv from wflow), 0)
         when not (select is_all_time from w) and b.department = 'Sales & Cash' and b.ord = 70 then (select apex_rev from wflow)
         when not (select is_all_time from w) and b.department = 'Sales & Cash' and b.ord = 71 then (select manifests_n from wflow)::numeric
         when not (select is_all_time from w) and b.department = 'Sales & Cash' and b.ord = 72 then (select sale_lines from wflow)::numeric
         when not (select is_all_time from w) and b.department = 'Sales & Cash' and b.ord = 73 then (select noinv_lines from wflow)::numeric
         /* AS-OF POSITIONS when the window ends before today */
         when not (select ends_today from w) then
           case
             when b.kpi = 'Dried flower on hand'                                     then (select dried_lb from asof)
             when b.kpi = 'In the rooms, dry-equivalent'                             then (select open_wet_lb from asof)
             when b.kpi = 'Harvests open too long'                                   then (select open_too_long from asof)::numeric
             when b.kpi = 'Moisture loss not recorded'                               then (select phantom_lb from asof)
             when b.kpi in ('Out at the laboratory, no result','Out for testing')    then (select at_lab_lb from asof)
             when b.kpi = 'Never submitted for testing'                              then (select unsubmitted_lb from asof)
             when b.kpi = 'Failed testing on hand'                                   then (select failed_lb from asof)
             when b.department='Inventory' and b.kpi = 'Total on hand, dry-equivalent' then (select total_lb from asof)
             when b.department='Inventory' and b.kpi = 'Sellable right now'          then (select sellable_lb from asof)
             when b.department='Inventory' and b.kpi = 'Ageing stock'                then (select ageing_lb from asof)
             when b.department='Manufacturing' and b.kpi = 'Concentrate on hand'     then (select conc_lb from asof)
             when b.department='Manufacturing' and b.kpi = 'Fresh frozen on hand'    then (select ff_lb from asof)
             when b.department='Manufacturing' and b.kpi = 'Fresh frozen dry-equivalent' then round((select ff_lb from asof) / nullif(f_rule('fresh_frozen_wet_to_dry'),0), 1)
             when b.department='Manufacturing' and b.kpi = 'Shake and trim on hand'  then (select shake_lb from asof)
             when b.department='Infused Pre-Rolls & Flower' and b.kpi = 'Pre-rolls on hand' then (select preroll_lb from asof)
             when b.department='Infused Pre-Rolls & Flower' and b.kpi = 'Pre-rolls never tested' then (select preroll_untested_lb from asof)
             when b.department='Infused Pre-Rolls & Flower' and b.kpi = 'Shake and trim available' then (select shake_passed_lb from asof)
             when b.department='Finance' and b.kpi = 'Value of stock on hand'        then round((select total_lb from asof) * (select cost_per_pound from rate), 0)
             when b.department='Finance' and b.kpi = 'Failed testing value'          then round((select failed_lb from asof) * (select cost_per_pound from rate), 0)
             when b.department='Finance' and b.kpi = 'Untested stock value'          then round((select unsubmitted_lb from asof) * (select cost_per_pound from rate), 0)
             else b.value end
         else b.value end                                               as value,
       b.unit, b.tone,
       case
         when not (select is_all_time from w) and b.department = 'Cultivation'
              and b.kpi in ('Average dry time','Harvests dried too long','Conversion, dried flower only')
           then b.context || (select note from wnote) || ' Harvests CLOSED inside the window.'
         when not (select is_all_time from w) and b.department = 'Sales & Cash' and b.ord between 70 and 73
           then b.context || (select note from wnote)
         when not (select ends_today from w) and (
              b.kpi in ('Dried flower on hand','In the rooms, dry-equivalent','Harvests open too long',
                        'Moisture loss not recorded','Out at the laboratory, no result','Out for testing',
                        'Never submitted for testing','Failed testing on hand')
              or (b.department='Inventory' and b.kpi in ('Total on hand, dry-equivalent','Sellable right now','Ageing stock'))
              or (b.department='Manufacturing' and b.kpi in ('Concentrate on hand','Fresh frozen on hand','Fresh frozen dry-equivalent','Shake and trim on hand'))
              or (b.department='Infused Pre-Rolls & Flower')
              or (b.department='Finance')) then
           case when b.kpi = 'In the rooms, dry-equivalent'
                then 'WET pounds across ' || (select open_h from asof) || ' harvests open at the date shown. '
                     || 'Dry-equivalent exists only once moisture is recorded at close, so a past date shows wet.'
                when b.department='Finance'
                then 'TODAY''S owner cost rate applied to the as-of pounds — no historical rate table exists yet.'
                when b.department='Inventory' and b.kpi = 'Ageing stock'
                then 'Category ageing policy applied to the as-of position. Holding-room suspensions are today''s — the mirror holds no room history.'
                else b.context end || (select note from basis)
         when not (select ends_today from w) and b.department='Inventory' and b.kpi in ('On a truck right now','Cross-licence tags')
           then b.context || '  ·  AS AT TODAY ONLY: in-transit state exists only in the current sync — the mirror holds no per-day transit ledger.'
         when not (select ends_today from w) and b.department='Metrc'
           then b.context || '  ·  Mirror totals are sync-state, not dated events — they cannot be restated.'
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
            when not (select ends_today from w) then 'POSITION AS OF ' || (select t from w)
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
