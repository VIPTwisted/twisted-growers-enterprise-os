-- Register the remaining data movers (matview refreshes, snapshots, document links, recurring materialisation);
-- checks and housekeeping (integrity, role clearance, stuck-run closer, sync-review, sweeps) are tracker items, not syncs.
insert into public.sync_registry (key, system, label, what, kind, runner, cron_jobname, secrets, run_source, lane, sort, note) values
 ('metrc_document_links', 'Metrc', 'Metrc document links', 'Nightly at 05:30: the manifest and COA links for every package, before the file backfill.', 'edge_function', 'metrc-documents?mode=urls', 'metrc-document-links', '{METRC_LICENSES,METRC_VENDOR_KEYS,METRC_USER_KEY}', 'metrc:documents', 'Claude', 14, null),
 ('recurring_materialize', 'OS', 'Recurring tasks materialised', 'Daily at 05:00: recurring task templates become the day''s task rows.', 'cron', 'tg_materialize_recurring', 'materialize-recurring', '{}', 'cron', 'Claude', 84, null),
 ('mv_certificate_resolved', 'OS', 'Certificate-resolved matview', 'Every 15 min.', 'cron', 'refresh-certificate-resolved', 'refresh-certificate-resolved', '{}', 'cron', 'Watchdog', 85, null),
 ('mv_document_search', 'OS', 'Document search index', 'Hourly at :17.', 'cron', 'f_refresh_document_search', 'refresh-document-search', '{}', 'cron', 'Claude', 86, null),
 ('mv_forensic_panel', 'OS', 'Forensic audit panel', 'Every 10 min.', 'cron', 'refresh-forensic-panel', 'refresh-forensic-panel', '{}', 'cron', 'Watchdog', 87, null),
 ('mv_harvest_links', 'OS', 'Harvest links', 'Every 10 min.', 'cron', 'tg_refresh_harvest_links', 'refresh-harvest-links', '{}', 'cron', 'Claude', 88, null),
 ('mv_manifest_invoice_truth', 'OS', 'Manifest ↔ invoice truth', 'Every 15 min.', 'cron', 'refresh-manifest-invoice-truth', 'refresh-manifest-invoice-truth', '{}', 'cron', 'GPT', 89, null),
 ('mv_package_origin', 'OS', 'Package origin', 'Hourly at :18.', 'cron', 'refresh-package-origin', 'refresh-package-origin', '{}', 'cron', 'Claude', 90, null),
 ('mv_tag_evidence', 'OS', 'Tag evidence', 'Hourly at :45.', 'cron', 'tg_refresh_tag_evidence', 'refresh-tag-evidence', '{}', 'cron', 'Claude', 91, null),
 ('mv_tower_inventory', 'OS', 'Tower inventory', 'Every 30 min.', 'cron', 'refresh-tower-inventory', 'refresh-tower-inventory', '{}', 'cron', 'Claude', 92, null),
 ('snapshot_dashboards', 'OS', 'Dashboard snapshots', 'Daily at 05:05: yesterday''s tile values kept for trend lines.', 'cron', 'tg_snapshot_dashboards', 'snapshot-dashboards', '{}', 'cron', 'Claude', 93, null),
 ('snapshot_tile_drill', 'OS', 'Tile ↔ drill snapshots', 'Every 30 min: each tile compared to its own drill.', 'cron', 'tg_snapshot_tile_drill', 'snapshot-tile-drill', '{}', 'cron', 'Watchdog', 94, null)
on conflict (key) do nothing;
update public.sync_registry r set schedule = j.schedule from cron.job j where j.jobname = r.cron_jobname and r.schedule is distinct from j.schedule;

-- the completeness check names data movers only; checks and housekeeping live on the tracker, not the sync page
create or replace function public.f_deployment_checks_run_sync()
returns table (ran int, failed int, warned int)
language plpgsql security definer set search_path to 'public', 'cron' as $$
declare n int; d text;
begin
  select count(*), string_agg(jobname, ', ' order by jobname) into n, d
  from cron.job j
  where j.active
    and (j.command ilike '%tg_call_function%' or j.command ilike '%refresh materialized view%'
         or j.jobname ~ '^(refresh-|snapshot-|materialize-|metrc-(dispatcher|backfill|nightly)|apex-sync|sheet-sync|hr-drain|retire-)')
    and not exists (select 1 from public.sync_registry r where r.cron_jobname = j.jobname);
  perform f_deployment_check_record('sync.registry_complete', case when n = 0 then 'PASS' else 'WARN' end,
    n || ' unregistered', case when n = 0 then 'Every data-moving cron job has a registry row.' else 'Add a sync_registry row for: ' || left(d, 400) end);
  return query select 1, 0, case when n = 0 then 0 else 1 end;
end $$;
select * from public.f_deployment_checks_run_sync();
