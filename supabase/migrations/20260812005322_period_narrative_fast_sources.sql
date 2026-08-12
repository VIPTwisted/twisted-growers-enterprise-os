-- Agent I (Database COO), 12 Aug 2026. Filed under DBI-029. The deployed page showed the
-- honest banner "period story could not be computed: statement timeout" - my function reads
-- v_third_party_forensic, whose lateral chains are far too heavy for a page-load budget. The
-- page told the truth about my slow SQL; the fix is faster TRUE sources, not a longer timeout.
--
-- Third-party paragraph now reads metrc_packages directly: received-in-window = a non-empty
-- ReceivedFromManifestNumber (actually crossed the fence), made by an outside licence
-- (ItemFromFacilityLicenseNumber not ours - the OWNERSHIP field, not the delivered-by trap),
-- excluding counterparties the owner ruled are not purchases (counterparty_role). Same truth,
-- milliseconds not seconds. Harvest and findings sections were never the timeout.
-- UNDO: restore from migration period_narrative_follows_date_selection.

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
           count(*) filter (where not (harvest_name ~* '\mFF\M') and dry_days_to_first_package is not null) as scored,
           count(*) filter (where not (harvest_name ~* '\mFF\M') and dry_days_to_first_package > 14) as too_long,
           round(avg(dry_days_to_first_package) filter (where not (harvest_name ~* '\mFF\M')),1) as avg_days,
           count(*) filter (where harvest_name ~* '\mFF\M') as ff
    from v_harvest_forensic where harvest_started_date between p_from and p_to
  ),
  prev as (
    select round(avg(dry_days_to_first_package) filter (where not (harvest_name ~* '\mFF\M')),1) as avg_days,
           count(*) filter (where not (harvest_name ~* '\mFF\M') and dry_days_to_first_package is not null) as scored
    from v_harvest_forensic where harvest_started_date between v_prev_from and v_prev_to
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

  -- Third-party: fast true source. Received = non-empty inbound manifest; outside = the
  -- ownership field; Eagle-Eyes-class custody counterparties excluded per owner ruling.
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
 'CEO-style narrative for the user-selected date range, called by the page with the date bar''s '
 'from/to. v2 12 Aug 2026: the third-party section reads metrc_packages directly - the deployed '
 'page honestly reported a statement timeout because v1 read v_third_party_forensic, whose '
 'lateral chains blow a page-load budget. Faster TRUE sources, never a longer timeout. Ownership '
 'from ItemFromFacilityLicenseNumber; custody counterparties excluded per counterparty_role.';;
