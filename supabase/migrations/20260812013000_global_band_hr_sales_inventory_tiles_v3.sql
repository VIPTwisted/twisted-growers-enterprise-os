-- Agent I (Database COO), 12 Aug 2026. DBI-037 v3: the union's first branch names the columns
-- and my scalar subquery lacked "as value". One alias. Full rationale in v1/v2 headers.
-- UNDO: restore mv_department_dashboard from moisture_kpi_blank_renders_as_zero_v2;
--       drop view v_dept_dash_supplement.

create or replace view public.v_dept_dash_supplement as
select 'Human Resources'::text as department, 60 as ord, 'People on the roster'::text as kpi,
       (select count(*)::numeric from employees) as value, ''::text as unit, 'info'::text as tone,
       (select count(*) filter (where status::text ilike 'act%')::text || ' active. Roster is the HR module''s data export; HR pages belong to their own designer.' from employees) as context,
       'employees'::text as drill, now() as computed_at
union all
select 'Human Resources', 61, 'Platform logins',
       (select count(*)::numeric from app_users), '', 'info',
       'People who can sign in. One role tier (owner) exists so far - the role model widens deliberately, never by hack.',
       'app_users', now()
union all
select 'Human Resources', 62, 'Timesheets recorded, ever',
       (select count(*)::numeric from time_entries), '', 'bad',
       'ZERO means zero substantiated direct labour under IRC 471 - the single largest gap in the 280E position. Every day unrecorded is deduction lost.',
       'time_entries', now()
union all
select 'Sales & Cash', 70, 'Revenue — TWO ANSWERS',
       (select round(abs(value_a - value_b)) from (select value_a, value_b from verification_runs
         where check_key='revenue-two-reports' order by ran_at desc limit 1) r),
       '$', 'bad',
       (select format('$%s vs $%s. DO NOT QUOTE REVENUE until the two reports reconcile - the gap exceeds planning materiality.',
                      to_char(value_a,'FM9,999,999'), to_char(value_b,'FM9,999,999'))
          from (select value_a, value_b from verification_runs
                 where check_key='revenue-two-reports' order by ran_at desc limit 1) r),
       'verification_runs', now()
union all
select 'Sales & Cash', 71, 'Going out today',
       (select count(*)::numeric from metrc_transfers
         where coalesce(nullif(raw->>'EstimatedDepartureDateTime',''),
                        nullif(raw->>'CreatedDateTime',''))::date = current_date),
       'manifests', 'info',
       (select 'Pickups and deliveries dated today on the Metrc manifest record. '
            || count(*) filter (where coalesce(nullif(raw->>'EstimatedArrivalDateTime',''),'') <> ''
                                  and (raw->>'EstimatedArrivalDateTime')::date = current_date)::text
            || ' due to ARRIVE today.'
          from metrc_transfers
         where coalesce(nullif(raw->>'EstimatedDepartureDateTime',''),
                        nullif(raw->>'CreatedDateTime',''))::date = current_date),
       'transfers_today', now()
union all
select 'Sales & Cash', 72, 'Sale lines on the record',
       (select count(*)::numeric from v_forensic_sold_by_tag), 'lines', 'info',
       'Outbound sold-by-tag lines. CAUTION per check_defect CD-2: 152 Eagle Eyes custody lines still counted as sales until the counterparty ruling is wired into this view too.',
       'forensic_sold_by_tag', now()
union all
select 'Sales & Cash', 73, 'Shipped with no Apex invoice',
       (select count(*)::numeric from v_forensic_sold_by_tag where invoice_match = 'NO APEX INVOICE'), 'lines', 'bad',
       'Every line that left with no matching order. 152 are the Eagle Eyes storage legs (no invoice because no sale); the remainder are real exceptions.',
       'forensic_sold_by_tag', now()
union all
select 'Inventory', 80, 'On a truck right now',
       (select round(sum(f_to_pounds(quantity, uom)),1) from metrc_packages
         where source_state='intransit' and not coalesce(finished,false)), 'lb', 'watch',
       (select count(*)::text || ' packages on active transfers, ours until the destination accepts (owner ruling). Stuck transfers live in this number - the oldest is months past any truck ride.'
          from metrc_packages where source_state='intransit' and not coalesce(finished,false)),
       'in_transit', now()
union all
select 'Inventory', 81, 'Cross-licence tags',
       (select count(*)::numeric from v_cross_license_tags), 'tags', 'watch',
       'Tags holding active material under BOTH licences at once. Legitimate moves, but each silently shifts pounds between per-tag and per-licence answers - 7 of these carried the entire 72 lb disagreement.',
       'cross_license_tags', now();

create or replace view public.mv_department_dashboard as
select department, ord, kpi,
       case when kpi = 'Moisture loss not recorded' then coalesce(value, 0) else value end as value,
       unit, tone, context, drill, computed_at
from mv_department_dashboard_base
union all
select department, ord, kpi, value, unit, tone, context, drill, computed_at
from v_dept_dash_supplement;

comment on view public.mv_department_dashboard is
 'Every category dashboard tile: the refreshed base matview PLUS v_dept_dash_supplement - live '
 'tiles added 12 Aug 2026 when the owner ruled the global band was not global (HR one tile, '
 'Sales & Cash zero). Supplement reads only verified-fast sources. The moisture coalesce and '
 'the never-DROP-CASCADE warning still stand.';;
