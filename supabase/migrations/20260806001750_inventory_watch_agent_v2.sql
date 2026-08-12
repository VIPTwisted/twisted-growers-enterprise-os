create table if not exists inventory_alerts (
  id bigserial primary key,
  fingerprint text unique not null,
  severity text not null check (severity in ('critical','elevated','watch')),
  area text not null, headline text not null, detail text not null,
  what_to_do text not null, drill text, pounds numeric, dollars numeric,
  first_raised timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  times_seen int not null default 1,
  resolved_at timestamptz, resolved_by text, resolution_note text
);
alter table inventory_alerts enable row level security;
drop policy if exists ia_all on inventory_alerts;
create policy ia_all on inventory_alerts for all to authenticated using (true) with check (true);
create index if not exists ia_open on inventory_alerts (resolved_at, severity);

create or replace function tg_inventory_watch()
returns table(open_alerts int, auto_resolved int)
language plpgsql security definer set search_path=public as $$
declare v_res int := 0; v_open int := 0; v_cost numeric; v_start timestamptz := now();
begin
  select value into v_cost from conversion_factors where key='target_cost_per_lb';

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill, pounds, dollars)
  select 'limit:'||stream||coalesce(location,''), 'elevated', 'Inventory control',
    stream||' is '||lower(status),
    coalesce(on_hand_lb,0)||' lb on hand'||case when max_lb is not null then ' against a ceiling of '||max_lb||' lb' else '' end||
    case when max_age_days is not null then '. Oldest package '||oldest_days||' days against a limit of '||max_age_days else '' end,
    'Move it, sell it, process it, or raise the limit deliberately.', 'storage_limit_status',
    on_hand_lb, round(on_hand_lb*v_cost)
  from v_storage_limit_status
  where status in ('OVER THE STORAGE LIMIT','MATERIAL OLDER THAN THE LIMIT','APPROACHING THE LIMIT')
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    detail=excluded.detail, pounds=excluded.pounds, dollars=excluded.dollars, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill, pounds, dollars)
  select 'ourfail:'||stream, 'critical', 'Quality',
    round(sum(pounds),1)||' lb of our own '||lower(stream)||' failed testing',
    sum(packages)||' packages we grew and packaged, then failed. Oldest '||max(oldest_days)||' days.',
    'Find the root cause, then decide remediate or destroy and record it in Metrc.',
    'failed_testing_by_origin', round(sum(pounds),1), round(sum(pounds)*v_cost)
  from v_stock_on_hand where lab_state='TestFailed' and origin='Grown by us' group by stream
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    headline=excluded.headline, detail=excluded.detail, pounds=excluded.pounds, dollars=excluded.dollars, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill, pounds, dollars)
  select 'untested:'||stream, 'critical', 'Quality',
    round(sum(pounds),1)||' lb of '||lower(stream)||' never submitted for testing',
    sum(packages)||' packages, oldest '||max(oldest_days)||' days. Untested product cannot be sold.',
    'Submit it or record a disposition.', 'lab_results', round(sum(pounds),1), round(sum(pounds)*v_cost)
  from v_stock_on_hand where lab_state='NotSubmitted' group by stream having sum(pounds) > 1
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    headline=excluded.headline, detail=excluded.detail, pounds=excluded.pounds, dollars=excluded.dollars, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill, pounds)
  select 'massbal:'||harvest, 'critical', 'Mass balance',
    'Harvest '||harvest||' does not reconcile', verdict,
    'Wet weight must equal packaged plus waste plus evaporated moisture. Find which figure is wrong and correct it in Metrc.',
    'moisture_accounting', abs(reconciliation_gap_lb)
  from v_moisture_accounting
  where finished is not null and abs(coalesce(reconciliation_gap_lb,0)) > greatest(2, wet_lb*0.02)
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    detail=excluded.detail, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill)
  select 'tpsitting:'||supplier, 'elevated', 'Third party',
    count(*)||' purchased packages from '||supplier||' sitting untouched',
    'Oldest received '||max(days_since_received)||' days ago with nothing drawn from it.',
    'Process it or sell it. Purchased material sitting still is cash already spent.', 'third_party_lifecycle'
  from v_third_party_lifecycle where position like 'SITTING%' group by supplier
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    detail=excluded.detail, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill)
  select 'labslow:'||coalesce(category,'unknown'), 'watch', 'Laboratory',
    'Laboratory turnaround on '||category||' is slow',
    'Average '||coalesce(avg_turnaround_days,0)||' days, worst '||slowest_turnaround_days||'. '||took_over_14_days||' packages took over 14 days.',
    'Chase the laboratory. Every day waiting is a day the product cannot be sold.', 'lab_turnaround_summary'
  from v_lab_turnaround_summary where coalesce(slowest_turnaround_days,0) > 14
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    detail=excluded.detail, resolved_at=null;

  insert into inventory_alerts (fingerprint, severity, area, headline, detail, what_to_do, drill, pounds)
  select 'question:'||question_key, 'elevated', 'Unanswered',
    'A question has been open '||days_open||' days with '||coalesce(exposure_lb,0)||' lb riding on it',
    question||' -- blocks: '||coalesce(what_is_blocked,'reporting'),
    'Answer it. Until it is answered the figures it feeds cannot be trusted.', 'open_questions', exposure_lb
  from v_open_questions where days_open > 3
  on conflict (fingerprint) do update set last_seen=now(), times_seen=inventory_alerts.times_seen+1,
    headline=excluded.headline, pounds=excluded.pounds, resolved_at=null;

  update inventory_alerts set resolved_at=now(), resolved_by='automatic',
    resolution_note='No longer detected on the sweep - the underlying problem is gone.'
   where resolved_at is null and last_seen < v_start;
  get diagnostics v_res = row_count;
  select count(*) into v_open from inventory_alerts where resolved_at is null;
  return query select v_open, v_res;
end $$;

select * from tg_inventory_watch();

drop view if exists v_inventory_alerts cascade;
create view v_inventory_alerts as
select severity, area, headline, detail, what_to_do, drill, pounds, dollars,
  (current_date - first_raised::date) as days_open, times_seen, first_raised::date as raised
from inventory_alerts where resolved_at is null
order by case severity when 'critical' then 1 when 'elevated' then 2 else 3 end, coalesce(dollars,0) desc;

drop view if exists v_inventory_alert_history cascade;
create view v_inventory_alert_history as
select severity, area, headline, detail, pounds, dollars,
  first_raised::date as raised, resolved_at::date as resolved,
  (resolved_at::date - first_raised::date) as days_to_resolve,
  coalesce(resolved_by,'still open') as resolved_by, resolution_note, times_seen
from inventory_alerts order by first_raised desc;

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Command', (select category_order from nav_registry where view_key='tower' limit 1), v.l, v.o, v.i, v.k, v.t, v.d, true, false, false
from (values
 ('Inventory Alerts', 3, 'bell', 'inventory_alerts', 'v_inventory_alerts',
  'Every discrepancy the watch agent has found and nobody has fixed yet. Swept twice a day. An alert clears itself the moment the underlying problem is gone, so this list is never stale.'),
 ('Alert History', 31, 'archive', 'inventory_alert_history', 'v_inventory_alert_history',
  'Every alert ever raised, when, how long it took to clear and how it was resolved. Permanent record for audit.')
) v(l,o,i,k,t,d)
where not exists (select 1 from nav_registry n where n.view_key = v.k);
insert into nav_role_visibility (view_key, role, visible)
select k, r.role, r.vis from (values ('inventory_alerts'),('inventory_alert_history')) x(k),
 (values ('owner',true),('executive',true),('planner',true),('dept_head',true),('staff',false),('readonly',true)) r(role,vis)
on conflict (view_key, role) do update set visible = excluded.visible;

select cron.schedule('inventory-watch-am', '17 6 * * *', $$select tg_inventory_watch();$$);
select cron.schedule('inventory-watch-pm', '17 13 * * *', $$select tg_inventory_watch();$$);;
