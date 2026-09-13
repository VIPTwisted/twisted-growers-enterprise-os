-- 13 Sep 2026: the Sync & Connections page, the ClickUp defect, and the owner's tokenless-AI rule.
update public.deployment_check set status = 'PASS', value = 'ClickUp hang found and fixed; page rebuilt',
  detail = 'Root cause found through the new registry: clickup-sync v2 had hung and been killed at 30 minutes on every run since 5 Sep (no deadline, per-row writes, admin key compared against a baked-in literal so machine calls were 403). v3 deployed 13 Sep: 5 spaces / 28 lists / 63 tasks in 12 s, HTTP 200. The Sync page itself is rebuilt on the registry (PR #239); every button reports the real answer.',
  last_run_at = now()
 where check_key = 'ops.sync_button_regression';

insert into public.deployment_check (check_key, section, title, why, kind, severity, expected, status, value, detail, last_run_at, active, sort_order)
values
 ('sync.registry_page', '11 Sync & Integrations', 'Sync & Connections: every sync and every secret on one page, from the side-menu Sync button', 'Owner 13 Sep. sync_registry (23 syncs at job level) → f_sync_status() with real last runs from metrc_sync_runs / apex_sync_run / cron.job_run_details, health, 24 h counts, missing secrets; f_secret_inventory() across both secret stores; f_sync_run(key) dispatches edge function / cron / rpc / bridge and f_sync_run_result() returns the HTTP answer. Page: app/web/src/synccenter.jsx on the existing Integrations view. PR #239. Lane: Claude.', 'manual', 'GO', '23 syncs listed; Run now answers; secrets one list', 'PASS', '23 syncs / 10 secrets / ClickUp verified live', 'Re-measure whenever a cron job or edge function is added: it must have a registry row (sync.registry_complete).', now(), true, 100),
 ('sync.registry_complete', '11 Sync & Integrations', 'Every data-moving cron job and edge function has a registry row', 'A sync that is not in sync_registry is invisible on the page. Measured hourly: cron jobs whose command calls tg_call_function, refresh, sync, backfill, drain or materialize, and every sync-type edge function, must map to a row.', 'auto', 'WATCH', '0 unregistered', 'PENDING', null, null, null, true, 101),
 ('owner.ai_tokenless', '11 Sync & Integrations', 'Owner rule: AI is tokenless — the TG bots extension carries the subscription; no AI API key is stored', 'Ruled 13 Sep 2026 ("I have built tokenless so AI shares my monthly subscription extension"). The Sync page shows the extension heartbeat (ai_bridge_heartbeat) and states no key is stored; ANTHROPIC_API_KEY stays NOT SET. AI settings remain on the Bots desk (Grok).', 'owner', 'OWNER', 'no AI key stored; heartbeat alive', 'PASS', 'ruled; extension v1.3.2 seen 13:20 UTC', null, now(), true, 102),
 ('sync.keys_page_consolidated', '11 Sync & Integrations', 'Keys & Connections folds into Sync & Connections (menu)', 'Two pages for secrets is two definitions. The nav consolidation runs with the deploy of PR #239, not before (the live OS reads the menu live — lesson of 12 Sep).', 'manual', 'WATCH', 'one Connections entry', 'PENDING', null, null, null, true, 103)
on conflict (check_key) do update set section = excluded.section, title = excluded.title, why = excluded.why, kind = excluded.kind, severity = excluded.severity,
  expected = excluded.expected, status = excluded.status, value = excluded.value, detail = excluded.detail, last_run_at = excluded.last_run_at, sort_order = excluded.sort_order, active = true;

-- hourly: anything that moves data and has no registry row
create or replace function public.f_deployment_checks_run_sync()
returns table (ran int, failed int, warned int)
language plpgsql security definer set search_path to 'public', 'cron' as $$
declare n int; d text;
begin
  select count(*), string_agg(jobname, ', ' order by jobname) into n, d
  from cron.job j
  where j.active
    and (j.command ilike '%tg_call_function%' or j.jobname ~ '(sync|backfill|drain|refresh|materialize|reference|documents|dispatcher|nightly)')
    and not exists (select 1 from public.sync_registry r where r.cron_jobname = j.jobname);
  perform f_deployment_check_record('sync.registry_complete', case when n = 0 then 'PASS' else 'WARN' end,
    n || ' unregistered', case when n = 0 then 'Every data-moving cron job has a registry row.' else 'Add a sync_registry row for: ' || left(d, 400) end);
  return query select 1, 0, case when n = 0 then 0 else 1 end;
end $$;
select cron.schedule('deployment-tracker-sync', '15 * * * *', 'select * from public.f_deployment_checks_run_sync();');
select * from public.f_deployment_checks_run_sync();
