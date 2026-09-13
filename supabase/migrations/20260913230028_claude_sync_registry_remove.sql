-- Owner, 13 Sep 2026: "how do I add, edit, modify". An admin who registers a sync by mistake must be able to
-- take it off the page again. This removes the REGISTRY row only: the cron job, the edge function and the
-- run history it pointed at are untouched — the registry is the map, not the territory. Admin-gated.
create or replace function public.f_sync_remove(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.sync_registry%rowtype;
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  delete from public.sync_registry where key = p_key returning * into r;
  if r.key is null then raise exception 'No sync called %.', p_key; end if;
  return jsonb_build_object('ok', true, 'key', r.key, 'label', r.label, 'cron_job_left_alone', r.cron_jobname);
end $$;
grant execute on function public.f_sync_remove(text) to authenticated;;
