create or replace view public.v_xq_harvest_open_past_limit
with (security_invoker = true) as
select
  'Harvest open past the limit'::text as queue,
  o.harvest_name, o.strain, o.drying_room, o.plants,
  o.harvest_started, o.days_open, o.limit_days, o.days_over,
  o.last_package_taken_off, o.days_since_last_package, o.packaged_lb,
  case
    when o.days_over >= 3 * o.limit_days then '1 MORE THAN THREE TIMES THE LIMIT'
    when o.days_over >= o.limit_days     then '2 MORE THAN TWICE THE LIMIT'
    else                                      '3 OVER THE LIMIT'
  end as severity,
  o.what_to_do as what_is_wrong,
  'Finish packaging it and close it out in Metrc. If the material has already left the room, Metrc was never told.'::text as what_to_do,
  'metrc_harvests (Metrc API mirror), via v_harvest_forensic and v_overdue_harvests'::text as metrc_source,
  (select max(mh.synced_at)::date from metrc_harvests mh where mh.name = o.harvest_name) as metrc_as_of,
  'harvest_open_max_days'::text as rule_used,
  o.limit_days as rule_value
from v_overdue_harvests o
order by o.days_over desc;

comment on view public.v_xq_harvest_open_past_limit is
'TICKET C2 QUEUE 4. Harvests still open in Metrc past conversion_factors.harvest_open_max_days. Wraps the existing v_overdue_harvests to add provenance columns; the rule and the logic were already correct and are not re-derived.';

create or replace view public.v_xq_summary
with (security_invoker = true) as
select 1 as ord,
       'Harvest moisture / residual'::text as queue,
       (select count(*) from v_xq_harvest_moisture) as items,
       (select count(*) from v_xq_harvest_moisture where severity like '1%' or severity like '2%' or severity like '3%') as needs_action_now,
       (select round(sum(abs(metrc_current_weight_lb)),1) from v_xq_harvest_moisture) as pounds_involved,
       'metrc_harvests, corroborated against metrc_rpt_harvest_moisture'::text as metrc_source,
       (select max(metrc_as_of) from v_xq_harvest_moisture) as metrc_as_of,
       'expected_moisture_pct_min/max, harvest_residual_outlier_min/max_pct, dry_window_max_days'::text as rules_used,
       (select count(*) from metrc_harvests
         where f_harvest_weight_basis(name, raw->>'DryingLocationName', (raw->>'CurrentWeight')::numeric) = 'wet')
         || ' fresh-frozen harvests are excluded from the band tests: they are packaged wet and correctly show no moisture loss.' as not_assessed
union all
select 2, 'Never submitted for testing',
       (select count(*) from v_xq_never_submitted),
       (select count(*) from v_xq_never_submitted where severity like '1%' or severity like '2%'),
       (select round(sum(pounds),2) from v_xq_never_submitted),
       'metrc_packages (Metrc API mirror), via v_never_tested_proof',
       (select max(metrc_as_of) from v_xq_never_submitted),
       'ageing_stock_days',
       (select count(*) from metrc_packages where provenance <> 'metrc api')
         || ' package rows came from a Metrc report import that carries no lab testing state column. They cannot be assessed for testing at all. Only the '
         || (select count(*) from metrc_packages where provenance = 'metrc api')
         || ' packages the Metrc API returns are in scope.'
union all
select 3, 'Failed test, no disposition',
       (select count(*) from v_xq_failed_no_disposition),
       (select count(*) from v_xq_failed_no_disposition where severity like '1%' or severity like '2%'),
       (select round(sum(pounds),2) from v_xq_failed_no_disposition),
       'metrc_packages + metrc_lab_results + metrc_rpt_lab_results',
       (select max(metrc_as_of) from v_xq_failed_no_disposition),
       'none - a failed test either has a disposition row or it does not',
       (select count(*) from v_xq_failed_no_disposition where quantity_number is null)
         || ' of these tags exist only as Metrc report rows, so their current state, room and quantity cannot be shown. Re-running the Metrc package sync over them would fill those fields.'
union all
select 4, 'Harvest open past the limit',
       (select count(*) from v_xq_harvest_open_past_limit),
       (select count(*) from v_xq_harvest_open_past_limit where severity like '1%' or severity like '2%'),
       (select round(sum(packaged_lb),1) from v_xq_harvest_open_past_limit),
       'metrc_harvests, via v_harvest_forensic and v_overdue_harvests',
       (select max(metrc_as_of) from v_xq_harvest_open_past_limit),
       'harvest_open_max_days',
       'None. Every harvest the Metrc API returns is assessed.'
order by 1;

comment on view public.v_xq_summary is
'TICKET C2. One row per Metrc exception queue: how many items, how many need action now, the pounds involved, the Metrc source, when that source was captured, the rule row used, and - required by rule A3 - what the queue could NOT assess and why.';

revoke all on public.v_xq_harvest_moisture,
              public.v_xq_never_submitted,
              public.v_xq_failed_no_disposition,
              public.v_xq_harvest_open_past_limit,
              public.v_xq_summary
  from public;

grant select on public.v_xq_harvest_moisture,
                public.v_xq_never_submitted,
                public.v_xq_failed_no_disposition,
                public.v_xq_harvest_open_past_limit,
                public.v_xq_summary
  to authenticated, service_role, tg_desktop_reader;;
