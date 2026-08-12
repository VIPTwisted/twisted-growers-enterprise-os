-- Agent I (Database COO), 12 Aug 2026. DBI-039 (reviewers V, X, W).
-- Two statement timeouts on the deployed Command page, both mine, same root: page-load paths
-- computing over heavy views. v_global_management aggregates v_findings (a five-branch UNION
-- over every findings source) on every load; tg_period_narrative scans v_harvest_forensic for
-- both windows on every date change. THE RULE, now enforced everywhere: a page load reads a
-- table; heavy derivation happens on the 10-minute refresh cycle.
-- UNDO: drop materialized view mv_global_management; drop materialized view mv_harvest_dry_stats;
--       restore tg_refresh_dashboards from supplement_tiles_materialized_page_reads_never_compute;
--       restore tg_period_narrative from period_narrative_fast_sources.

create materialized view if not exists public.mv_global_management as
select * from v_global_management;

create unique index if not exists mv_global_management_uq
  on public.mv_global_management (department);

comment on materialized view public.mv_global_management is
 'The global band, precomputed. v_global_management aggregates v_findings - a five-branch UNION '
 'over every findings source - and computing that on page load produced "canceling statement due '
 'to statement timeout" at the top of Command on 12 Aug 2026. The page reads THIS; the 10-minute '
 'cycle does the work. Front end: point the global band at mv_global_management.';

create materialized view if not exists public.mv_harvest_dry_stats as
select harvest_name,
       harvest_started_date,
       (harvest_name ~* '\mFF\M') as is_fresh_frozen,
       dry_days_to_first_package
from v_harvest_forensic
where harvest_started_date is not null;

create unique index if not exists mv_harvest_dry_stats_uq
  on public.mv_harvest_dry_stats (harvest_name, harvest_started_date);

comment on materialized view public.mv_harvest_dry_stats is
 'Per-harvest dry statistics, one narrow row per harvest, refreshed every 10 minutes. Exists '
 'because tg_period_narrative scanned v_harvest_forensic live for two windows on every date-bar '
 'change and timed out under the page''s query budget. ~400 rows; the narrative reads this in '
 'microseconds.';

create or replace function public.tg_refresh_dashboards()
returns void language plpgsql security definer set search_path to 'public'
as $function$
begin
  refresh materialized view concurrently mv_department_dashboard_base;
  refresh materialized view concurrently mv_dept_dash_supplement;
  refresh materialized view concurrently mv_global_management;
  refresh materialized view concurrently mv_harvest_dry_stats;
end $function$;

comment on function public.tg_refresh_dashboards() is
 'The 10-minute dashboard cycle: base tiles, supplement tiles, the global band and the harvest '
 'dry stats. All CONCURRENTLY so readers never block. Every dashboard-facing derivation joins '
 'THIS cycle - live computation on page load is how Command timed out twice on 12 Aug 2026.';

create or replace function public.tg_period_narrative(p_from date, p_to date)
returns table (page text, section_key text, narrative text, tone text, drill text)
language plpgsql stable security invoker
as $fn$
declare
  v_days int := greatest((p_to - p_from) + 1, 1);
  v_prev_from date := p_from - v_days;
  v_prev_to   date := p_from - 1;
begin
  return query
  with cur as (
    select count(*) as harvests,
           count(*) filter (where not is_fresh_frozen and dry_days_to_first_package is not null) as scored,
           count(*) filter (where not is_fresh_frozen and dry_days_to_first_package > 14) as too_long,
           round(avg(dry_days_to_first_package) filter (where not is_fresh_frozen),1) as avg_days,
           count(*) filter (where is_fresh_frozen) as ff
    from mv_harvest_dry_stats where harvest_started_date between p_from and p_to
  ),
  prev as (
    select round(avg(dry_days_to_first_package) filter (where not is_fresh_frozen),1) as avg_days,
           count(*) filter (where not is_fresh_frozen and dry_days_to_first_package is not null) as scored
    from mv_harvest_dry_stats where harvest_started_date between v_prev_from and v_prev_to
  )
  select 'cultivation', 'harvests_period',
    case when c.harvests = 0 then
      format('No harvests were cut between %s and %s. The prior %s days had %s.',
             to_char(p_from,'DD Mon'), to_char(p_to,'DD Mon'), v_days, coalesce(p.scored,0))
    else
      format('%s harvests cut in this window (%s fresh-frozen). Of the %s dry harvests scored, %s blew the 14-day packaging window; the average was %s days%s.',
        c.harvests, c.ff, c.scored, c.too_long, coalesce(c.avg_days::text,'—'),
        case when p.avg_days is not null and c.avg_days is not null then
          format(' — %s than the prior %s days'' %s',
                 case when c.avg_days < p.avg_days then 'better' when c.avg_days > p.avg_days then 'worse' else 'level with' end,
                 v_days, p.avg_days)
        else '' end)
    end,
    case when c.too_long > 0 then 'bad' else 'good' end, 'dry_time_discipline'
  from cur c cross join prev p;

  return query
  with cur as (
    select count(*) filter (where observed_at::date between p_from and p_to) as raised,
           count(*) filter (where cleared_at::date  between p_from and p_to) as cleared
    from watchdog_findings
  ),
  prev as (
    select count(*) filter (where observed_at::date between v_prev_from and v_prev_to) as raised
    from watchdog_findings
  )
  select 'command', 'findings_period',
    format('%s findings raised and %s cleared in this window — the queue %s. The prior %s days raised %s. Every disagreement becomes a named finding within the hour, so a rising count means more found, not necessarily more broken.',
           c.raised, c.cleared,
           case when c.cleared > c.raised then 'shrank' when c.cleared < c.raised then 'grew' else 'held level' end,
           v_days, p.raised),
    case when c.cleared >= c.raised then 'good' else 'bad' end, 'finding_causes'
  from cur c cross join prev p;

  return query
  with pop as (
    select (p2.raw->>'ReceivedDateTime')::date as recv_on,
           f_to_pounds(coalesce(nullif(p2.raw->>'ReceivedQuantity','')::numeric, p2.quantity),
                       coalesce(nullif(p2.raw->>'ReceivedUnitOfMeasureAbbreviation',''), p2.uom)) as lb
    from metrc_packages p2
    where coalesce(p2.raw->>'ReceivedFromManifestNumber','') <> ''
      and coalesce(p2.raw->>'ItemFromFacilityLicenseNumber','') not in ('MC281714','MP281909','')
      and not exists (select 1 from counterparty_role cr
                       where cr.counts_as_purchase = false
                         and cr.facility_name = p2.raw->>'ReceivedFromFacilityName')
      and (p2.raw->>'ReceivedDateTime')::date between v_prev_from and p_to
  ),
  cur as (select count(*) as tags, round(sum(lb),1) as lb from pop where recv_on between p_from and p_to),
  prev as (select round(sum(lb),1) as lb from pop where recv_on between v_prev_from and v_prev_to)
  select 'finance', 'third_party_period',
    case when c.tags = 0 then
      format('No third-party material was received between %s and %s%s.',
             to_char(p_from,'DD Mon'), to_char(p_to,'DD Mon'),
             case when coalesce(p.lb,0) > 0 then format(' — the prior %s days brought in %s lb', v_days, p.lb) else '' end)
    else
      format('%s third-party packages received, %s lb%s. Cost basis remains declared transfer price, not cash evidence.',
             c.tags, c.lb,
             case when coalesce(p.lb,0) > 0 then format(' — against %s lb in the prior %s days', p.lb, v_days) else '' end)
    end,
    'info', 'third_party_forensic'
  from cur c cross join prev p;
end $fn$;

comment on function public.tg_period_narrative(date, date) is
 'CEO narrative for the selected date range. v3 12 Aug 2026: the harvest leg reads '
 'mv_harvest_dry_stats (10-minute matview, ~400 narrow rows) after live v_harvest_forensic '
 'scans timed out on the deployed page. All three legs now read cheap sources; the whole '
 'function answers in milliseconds.';;
