/* THE AGENTS NOW RECORD WHAT THEY FOUND
   -------------------------------------
   819 of 843 open findings carried no quantity at all - no pounds, no dollars.
   So nothing could be ranked worst-first and the pricing function had nothing
   to price. The cause was not that the data was missing: v_awaiting_allocation,
   v_inventory_aging and v_custody_alerts all carry quantity AND uom. The agent
   recorded DAYS as its metric and dropped the weight on the floor.

   Two changes:
     1. agent_findings gains a pounds column.
     2. tg_intelligence_sweep converts quantity to pounds using the platform's
        own f_to_pounds/f_is_weight resolvers - never assuming a unit - and
        prices it through f_price_per_lb, which states its own basis and
        refuses to guess.

   Where a package is counted in each rather than weighed, pounds stays null.
   That is correct: 500 pre-rolls is not a weight, and inventing one is exactly
   the failure these rules exist to prevent. */

alter table agent_findings add column if not exists pounds numeric;
comment on column agent_findings.pounds is
  'Weight the finding concerns, in pounds. Null when the item is counted rather than weighed - never guessed.';

create or replace function tg_intelligence_sweep()
returns table(new_findings integer, open_total integer)
language plpgsql
as $function$
declare n int := 0; t int := 0; cpp numeric;
begin
  select cost_per_pound into cpp from cost_model where scope='cultivation' order by effective_from desc limit 1;
  with found as (
    select 'Schedule discipline' as agent, 'critical' as severity,
      'Pull or dry ran late in ' || coalesce(room,'a room') as headline,
      coalesce(detail,'') || ' - scheduled ' || scheduled_date || ', ' || rule_verdict as detail,
      days_off_schedule as metric, 'days late' as units,
      null::numeric as dollars, null::numeric as pounds,
      coalesce(room,'') as scope,
      'Late is a violation of the hard rule. Plan a weekend crew or a second shift rather than slipping the next date.' as action,
      'late_violations' as drill_to,
      'late:' || coalesce(room,'') || ':' || coalesce(scheduled_date::text,'') as fingerprint
    from v_late_violations where rule_verdict like 'VIOLATION%'
    union all
    select 'Loss and yield', case when waste_pct > 25 then 'critical' else 'elevated' end,
      scope_type || ' ' || scope || ' is wasting ' || waste_pct || ' percent',
      waste_lbs || ' pounds wasted across ' || harvests || ' harvests',
      waste_pct, 'percent waste', cost_of_waste, waste_lbs, scope,
      'Investigate this ' || lower(scope_type) || '. At ' || coalesce(cpp,0) || ' dollars per pound that waste has cost ' || cost_of_waste || ' dollars.',
      'loss_analysis', 'waste:' || scope_type || ':' || scope
    from v_cost_of_loss where waste_pct > 15
    union all
    select 'Room turnaround', 'critical', harvest || ' is blocking ' || room, drying_status,
      days_since_takedown, 'days since takedown', null, null, room,
      'This room cannot be replanted until drying finishes. Finish it or move the material.',
      'harvest_lifecycle', 'blocking:' || harvest
    from v_harvest_lifecycle where verdict = 'BLOCKING THE ROOM'
    union all
    select 'Weight reporting', 'elevated', 'Weights missing for ' || harvest, weights_status,
      days_since_takedown, 'days since takedown', null, null, room,
      'Cultivation must record the weights. Nothing downstream can be costed or allocated without them.',
      'harvest_lifecycle', 'weights:' || harvest
    from v_harvest_lifecycle where verdict = 'MISSING WEIGHTS'
    union all
    /* now carries weight and value - it always had quantity and uom */
    select 'Compliance watch', severity, flag || ' - ' || item, detail, quantity, uom,
      case when f_is_weight(uom)
           then round(f_to_pounds(quantity, uom) * (select rate from f_price_per_lb(item) limit 1), 2) end,
      case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end,
      coalesce(location,''), 'Resolve this in Metrc. It is live compliance exposure.',
      'custody_alerts', 'custody:' || flag || ':' || identifier
    from v_custody_alerts
    union all
    select 'Cash velocity', severity, 'Aging stock: ' || item,
      action || ' - ' || days_here || ' days in ' || location, days_here, 'days',
      case when f_is_weight(uom)
           then round(f_to_pounds(quantity, uom) * (select rate from f_price_per_lb(category) limit 1), 2) end,
      case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end,
      location,
      'Move it, sell it, or decide its disposition. Every day it sits is capital doing nothing.',
      'inventory_aging', 'aging:' || identifier || ':' || severity
    from v_inventory_aging where severity in ('critical','elevated')
    union all
    select 'Allocation control', 'elevated', 'No approved allocation: ' || item,
      approval_state || ' - ' || quantity || ' ' || uom || ' in ' || location,
      days_in_system, 'days in system',
      case when f_is_weight(uom)
           then round(f_to_pounds(quantity, uom) * (select rate from f_price_per_lb(material_class) limit 1), 2) end,
      case when f_is_weight(uom) then round(f_to_pounds(quantity, uom), 2) end,
      location,
      'Every material needs an approved allocation before it moves. Raise a request or approve the pending one.',
      'awaiting_allocation', 'alloc:' || identifier
    from v_awaiting_allocation where days_in_system > 30 and coalesce(allocation_status,'no request') = 'no request'
    union all
    select 'Schedule discipline', 'elevated',
      event_type || ' lands on a ' || falls_on || ' in ' || coalesce(room,'a room'),
      coalesce(detail,'') || ' on ' || event_date, days_away, 'days away', null, null, coalesce(room,''),
      'Plan a weekend crew or a second shift now. The date does not move.',
      'weekend_watch', 'weekend:' || event_type || ':' || event_date
    from v_weekend_watch where action like 'PLAN A WEEKEND%'
  ),
  deduped as (
    select distinct on (fingerprint) * from found
    order by fingerprint, case severity when 'critical' then 0 when 'elevated' then 1 else 2 end
  )
  insert into agent_findings (agent, severity, headline, detail, metric, units, dollars, pounds, scope, action, drill_to, fingerprint)
  select d.agent, d.severity, d.headline, d.detail, d.metric, d.units, d.dollars, d.pounds, d.scope, d.action, d.drill_to, d.fingerprint
  from deduped d
  where not exists (select 1 from agent_findings a where a.fingerprint = d.fingerprint and a.resolved_at is null);
  get diagnostics n = row_count;
  select count(*) into t from agent_findings where resolved_at is null;
  new_findings := n; open_total := t; return next;
end $function$;;
