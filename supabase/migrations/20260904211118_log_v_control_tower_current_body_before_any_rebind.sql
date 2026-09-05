insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'rebind',
  'view',
  'public.v_control_tower',
  pg_get_viewdef('public.v_control_tower'::regclass, true),
  'PENDING — not applied. Ticket B: rebind zeros to Metrc/Apex. This row is the restore snapshot of the empty-table body.',
  'Captured before any rebind so the owner can put the 12-metric empty-OS-table version back. Tiles stay. Do not drop the view.',
  'create or replace view public.v_control_tower as <old_definition from this row>;',
  'ticket-b-tower-two-clock';
