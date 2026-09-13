-- Owner, 13 Sep 2026: ClickUp is a clone inside the OS (Workspace); it is not one of our syncs.
-- The two external-ClickUp connectors leave the Sync page. Rows kept, disabled, reason recorded.
update public.sync_registry
   set enabled = false,
       note = coalesce(note, '') || ' Retired 13 Sep 2026 — owner: the OS Workspace is a ClickUp clone; external ClickUp is not one of our syncs.'
 where key in ('clickup_pull', 'clickup_hr_push');
