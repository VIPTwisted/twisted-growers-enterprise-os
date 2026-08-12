-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-029 (reviewers V, X, W).
-- Owner: the dashboard commentary should be about THE TIME PERIOD THE USER SELECTS - pick
-- "This Month" on the date bar and the paragraph rewrites for this month, against the period
-- before it, in words.
--
-- MECHANISM: a function the front end calls through RPC with the date bar's selection. Every
-- range change recomputes the sentences from the canonical views - nothing stored, nothing
-- stale. The comparison window is always the SAME LENGTH immediately before the selection, so
-- "up on the prior period" is honest arithmetic, never a seasonal illusion presented as trend.
--
-- HONESTY RULES APPLIED: numbers computed at call time from the same views the tiles read (one
-- figure, one value); a window with nothing in it SAYS SO rather than rendering an empty
-- paragraph; fresh-frozen harvests excluded from dry scoring (the population fix of two hours
-- ago); no forecasts - only arithmetic on what happened (A1).
--
-- UNDO: drop function tg_period_narrative(date, date);

create or replace function public.tg_period_narrative(p_from date, p_to date)
returns table (page text, section_key text, narrative text, tone text, drill text)
language plpgsql stable security invoker
as $fn$
declare
  v_days int := greatest((p_to - p_from) + 1, 1);
  v_prev_from date := p_from - v_days;
  v_prev_to   date := p_from - 1;
begin
  -- ── Harvest & dry discipline for the selected window ──
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

  -- ── Findings raised and cleared in the window ──
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

  -- ── Third-party material received in the window ──
  return query
  with cur as (
    select count(*) as tags, round(sum(lb_received),1) as lb
    from v_third_party_forensic where date_received between p_from and p_to
  ),
  prev as (
    select round(sum(lb_received),1) as lb
    from v_third_party_forensic where date_received between v_prev_from and v_prev_to
  )
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
 'CEO-style narrative FOR THE DATE RANGE THE USER SELECTED - the front end calls this through '
 'RPC with the date bar''s from/to, and every range change rewrites the paragraphs from the same '
 'canonical views the tiles read. Comparison is always the equal-length window immediately '
 'before. An empty window says so in words. No forecasts, only arithmetic on what happened (A1). '
 'Each paragraph carries a drill key - a paragraph is a claim like any tile (C1).';;
