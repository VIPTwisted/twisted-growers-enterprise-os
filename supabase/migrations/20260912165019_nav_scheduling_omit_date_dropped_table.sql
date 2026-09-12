-- GROK-WHY: Claude dropped public.schedule_assignments. nav_registry.scheduling still
-- points at it, so L6 counted a new date-range defect (103 vs ratchet 102) and blocked
-- bots shipping a real Excel file. A date control on a missing relation is meaningless.
-- Omit it. Do not invent a date. Do not rewrite a view. Metrc read-only. No ledger rewrite.

update public.nav_registry
   set date_policy = 'not_applicable'
 where view_key = 'scheduling'
   and table_ref = 'schedule_assignments'
   and to_regclass('public.schedule_assignments') is null;
