-- Measured on the page 13 Sep 2026 23:03 UTC: removing a sync that had been run from the page failed on
-- sync_registry_run_key_fkey. Those rows are the page's own Run-now receipts for that registry row; with the
-- row gone they point at nothing, so they go with it. Metrc / Apex / cron run history is a different table
-- and is never touched. Admin-gated, registry row only, cron job and function left alone.
create or replace function public.f_sync_remove(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.sync_registry%rowtype; n_receipts int;
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  select * into r from public.sync_registry where key = p_key;
  if r.key is null then raise exception 'No sync called %.', p_key; end if;
  delete from public.sync_registry_run where key = p_key;
  get diagnostics n_receipts = row_count;
  delete from public.sync_registry where key = p_key;
  return jsonb_build_object('ok', true, 'key', r.key, 'label', r.label, 'run_now_receipts_removed', n_receipts, 'cron_job_left_alone', r.cron_jobname);
end $$;;
