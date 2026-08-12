-- Chain-of-custody red flags, computed live from Metrc reality.
create or replace view v_custody_alerts as
-- Lineage break: a package with no source harvest recorded
select 'Lineage break' as flag, 'critical' as severity, p.license, p.tag as identifier,
  coalesce(p.item_name,'(unnamed)') as item, coalesce(p.location,'(no location)') as location,
  coalesce(p.quantity,0)::numeric as quantity, coalesce(p.uom,'ea') as uom,
  'Package has no source harvest recorded - the seed to sale chain cannot be proven for this package' as detail,
  p.packaged_on as reference_date
from metrc_packages p
where p.source_state in ('active','onhold','intransit')
  and coalesce(nullif(p.raw->>'SourceHarvestNames',''), nullif(p.raw->>'SourcePackageLabels','')) is null
union all
-- Held product
select 'On hold in Metrc', 'critical', p.license, p.tag, coalesce(p.item_name,'(unnamed)'),
  coalesce(p.location,'(no location)'), coalesce(p.quantity,0)::numeric, coalesce(p.uom,'ea'),
  'Package is on hold in Metrc - resolve the hold or record the disposition', p.packaged_on
from metrc_packages p where (p.raw->>'IsOnHold')::boolean and p.source_state in ('active','onhold')
union all
-- Failed testing still sitting in inventory
select 'Failed testing unresolved', 'critical', p.license, p.tag, coalesce(p.item_name,'(unnamed)'),
  coalesce(p.location,'(no location)'), coalesce(p.quantity,0)::numeric, coalesce(p.uom,'ea'),
  'Failed a laboratory test and is still in inventory - remediate or destroy and record it', p.packaged_on
from metrc_packages p where p.lab_testing_state = 'TestFailed' and p.source_state in ('active','onhold')
union all
-- Quantity shrank with no recorded adjustment reason
select 'Unexplained quantity loss', 'elevated', p.license, p.tag, coalesce(p.item_name,'(unnamed)'),
  coalesce(p.location,'(no location)'),
  round((coalesce((p.raw->>'InitialQuantity')::numeric,0) - coalesce(p.quantity,0))::numeric, 2), coalesce(p.uom,'ea'),
  'Quantity dropped from ' || (p.raw->>'InitialQuantity') || ' to ' || coalesce(p.quantity,0)
    || ' with no adjustment reason recorded', p.packaged_on
from metrc_packages p
where coalesce((p.raw->>'InitialQuantity')::numeric,0) - coalesce(p.quantity,0) > 0.01
  and p.source_state in ('active','onhold')
union all
-- Manifest that never closed out
select 'Transfer not received', 'elevated', p.license, p.tag, coalesce(p.item_name,'(unnamed)'),
  coalesce(p.location,'(manifested)'), coalesce(p.quantity,0)::numeric, coalesce(p.uom,'ea'),
  'In transit for ' || (current_date - p.packaged_on) || ' days - confirm the receiving facility accepted it', p.packaged_on
from metrc_packages p
where p.source_state = 'intransit' and p.packaged_on < current_date - 3
union all
-- Harvest under investigation or recall
select 'Under investigation', 'critical', h.license, h.name, coalesce(h.raw->>'SourceStrainNames', h.name),
  coalesce(h.raw->>'DryingLocationName','(no room)'), coalesce((h.raw->>'CurrentWeight')::numeric,0), coalesce(h.raw->>'UnitOfWeightName','g'),
  'Harvest is flagged under investigation or recall in Metrc - do not move or sell until cleared', h.harvest_start
from metrc_harvests h
where (h.raw->>'IsOnInvestigation')::boolean or (h.raw->>'IsOnInvestigationHold')::boolean or (h.raw->>'IsOnInvestigationRecall')::boolean
union all
-- Item with no location at all (the custody gap itself)
select 'No location recorded', 'critical', l.license, l.identifier, l.item, l.location, l.quantity, l.uom,
  'This item has no recorded location - custody cannot be proven to the Cannabis Control Commission', l.since_date
from v_inventory_locator l
where l.location is null or l.location in ('(no location)','(no room recorded)')
union all
-- We are flying blind: the mirror has gone stale
select 'Metrc data stale', 'elevated', 'BOTH', 'sync', 'Metrc mirror', 'System',
  round(extract(epoch from (now() - max(r.started_at))) / 3600, 1), 'hours since last sync',
  'No successful Metrc sync in over 2 hours - the custody picture may be out of date', current_date
from metrc_sync_runs r having max(r.started_at) < now() - interval '2 hours';

-- Permanent monitoring log so the trend is never lost
create table if not exists custody_alert_log (
  id uuid primary key default gen_random_uuid(),
  captured_at timestamptz default now(),
  flag text, severity text, license text, identifier text, item text, location text,
  quantity numeric, uom text, detail text, reference_date date,
  resolved_at timestamptz, resolved_by text, resolution_note text
);
alter table custody_alert_log enable row level security;
create policy cal_read on custody_alert_log for select to authenticated using (true);
create policy cal_write on custody_alert_log for all to authenticated
  using (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')))
  with check (exists (select 1 from app_users au where au.user_id = auth.uid() and au.role::text in ('owner','executive','manager')));
create index if not exists custody_log_open_idx on custody_alert_log (flag, identifier) where resolved_at is null;

-- The monitor: records new flags, auto-resolves ones that cleared. Runs forever on a schedule.
create or replace function tg_custody_monitor() returns table(new_flags int, resolved int, open_total int) as $$
declare n int := 0; r int := 0; t int := 0;
begin
  insert into custody_alert_log (flag, severity, license, identifier, item, location, quantity, uom, detail, reference_date)
  select a.flag, a.severity, a.license, a.identifier, a.item, a.location, a.quantity, a.uom, a.detail, a.reference_date
  from v_custody_alerts a
  where not exists (
    select 1 from custody_alert_log l
    where l.flag = a.flag and l.identifier = a.identifier and l.resolved_at is null
  );
  get diagnostics n = row_count;
  update custody_alert_log l set resolved_at = now(), resolved_by = 'monitor',
    resolution_note = 'Condition no longer present in Metrc'
  where l.resolved_at is null
    and not exists (select 1 from v_custody_alerts a where a.flag = l.flag and a.identifier = l.identifier);
  get diagnostics r = row_count;
  select count(*) into t from custody_alert_log where resolved_at is null;
  new_flags := n; resolved := r; open_total := t; return next;
end $$ language plpgsql;

select cron.unschedule(jobid) from cron.job where jobname = 'custody-monitor';
select cron.schedule('custody-monitor', '*/20 * * * *', $$ select tg_custody_monitor() $$);

insert into nav_registry (category, category_order, label, item_order, icon, view_key, table_ref, description, enabled, admin_only, sync_enabled)
select 'Inventory', (select category_order from nav_registry where category='Inventory' limit 1),
       v.l, v.io, v.ic, v.vk, v.tr, v.d, true, false, false
from (values
  ('Custody Red Flags', 4, 'bell', 'custody_alerts', 'v_custody_alerts', 'Live chain of custody red flags: lineage breaks, holds, failed testing left in inventory, unexplained quantity loss, transfers never received, investigations, unlocated items, and stale Metrc data.'),
  ('Custody Alert History', 5, 'shield', 'custody_alert_log', 'custody_alert_log', 'Every custody red flag ever raised, when it was raised, and when it cleared - the permanent audit record a regulator would ask for.')
) v(l, io, ic, vk, tr, d)
where not exists (select 1 from nav_registry nr where nr.view_key = v.vk);
select * from tg_custody_monitor();;
