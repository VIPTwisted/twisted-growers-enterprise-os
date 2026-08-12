-- The Chief Executive view: what the agents found, priced, ranked, with the action.
create or replace view v_ceo_dashboard as
select
  'Money at stake' as line,
  '$' || to_char(coalesce((select sum(dollars) from agent_findings where resolved_at is null),0),'FM999,999,999') as headline,
  (select count(*) from agent_findings where resolved_at is null and dollars > 0)::text || ' findings carry a dollar figure' as detail,
  1 as sort
union all
select 'Critical findings',
  (select count(*) from agent_findings where resolved_at is null and severity='critical')::text,
  (select string_agg(distinct agent, ', ') from agent_findings where resolved_at is null and severity='critical'), 2
union all
select 'Schedule violations',
  (select count(*) from v_late_violations where rule_verdict like 'VIOLATION%')::text,
  'Hard rule: a pull or dry may be early, never late. ' ||
    coalesce((select count(*) from v_weekend_watch where action like 'PLAN A WEEKEND%')::text,'0') ||
    ' upcoming events land on a weekend and need a crew planned', 3
union all
select 'Compliance exposure',
  (select count(*) from v_custody_alerts)::text,
  (select count(*) from metrc_packages where lab_testing_state='TestFailed' and source_state in ('active','onhold'))::text ||
    ' failed-testing packages still in inventory · ' ||
    (select count(*) from metrc_transfers where direction='outgoing' and raw->>'ReceivedDateTime' is null and created_on < current_date - 3)::text ||
    ' manifests never confirmed received', 4
union all
select 'Cost of waste to date',
  '$' || to_char(coalesce((select sum(cost_of_waste) from v_cost_of_loss where scope_type='Room'),0),'FM999,999,999'),
  'At $' || coalesce((select cost_per_pound from cost_model where scope='cultivation' order by effective_from desc limit 1),0)::text ||
    ' per pound. Worst room: ' || coalesce((select scope from v_cost_of_loss where scope_type='Room' order by cost_of_waste desc limit 1),'none'), 5
union all
select 'Material without approved allocation',
  (select count(*) from v_awaiting_allocation)::text,
  'Every material grown or bought needs an approved allocation before it moves', 6
union all
select 'Capital sitting too long',
  (select count(*) from v_inventory_aging where severity in ('critical','elevated'))::text,
  'Aging stock flagged critical or elevated', 7
union all
select 'Custody proof',
  coalesce((select location_known_pct::text || '%' from v_custody_compliance where category='ALL TRACKED INVENTORY'),'—'),
  coalesce((select compliance_status from v_custody_compliance where category='ALL TRACKED INVENTORY'),''), 8
order by sort;

-- What the agents recommend, ranked by money then severity.
create or replace view v_ceo_recommendations as
select severity, agent, headline, detail, scope,
  coalesce(dollars,0) as dollars_at_stake, action as recommended_action, drill_to, detected_at
from agent_findings
where resolved_at is null
order by coalesce(dollars,0) desc,
  case severity when 'critical' then 0 when 'elevated' then 1 else 2 end,
  detected_at desc;

-- Restrict both to owner and executive only; hide from every other role.
insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, true, false
from (values
  ('Chief Executive Dashboard', 1, 'gauge', 'ceo_dashboard', 'v_ceo_dashboard', 'The Chief Executive view: money at stake, critical findings, schedule violations, compliance exposure, the cost of waste to date, material without an approved allocation, capital sitting too long, and custody proof - all computed live by the watching agents.'),
  ('Agent Recommendations', 4, 'shield', 'ceo_recommendations', 'v_ceo_recommendations', 'Every recommendation the watching agents have made, ranked by dollars at stake then severity, each naming the exact action to take.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
insert into nav_role_visibility (view_key, role, visible)
select vk, r.role, r.role in ('owner','executive')
from (values ('ceo_dashboard'),('ceo_recommendations')) k(vk)
cross join (values ('owner'),('executive'),('manager'),('member'),('limited'),('guest')) r(role)
on conflict (view_key, role) do update set visible = excluded.visible;
select line, headline, detail from v_ceo_dashboard;;
