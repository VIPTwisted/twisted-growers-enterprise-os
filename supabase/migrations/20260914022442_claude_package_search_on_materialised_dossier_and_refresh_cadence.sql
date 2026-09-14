-- Measured 03:04 UTC through PostgREST as the owner: f_package_360 0.35–0.9 s; f_package_search 2.8 s (v_tag_master
-- is computed in full for a LIKE); and the page hit the 8 s statement timeout exactly at :00 while the 15-minute
-- refresh (33 s of heavy views) ran. Search moves to the materialised dossier (indexed, milliseconds); the refresh
-- runs every 30 minutes — the dossier, lifecycle, gaps and events are stated with their as-of; the ledger,
-- master, documents and every tag_event stay live.
create or replace function public.f_package_search(p_q text)
returns table (tag text, item text, strain text, room text, on_hand_lb numeric, finished boolean, licence text)
language plpgsql stable security definer set search_path = public as $$
declare q text := upper(btrim(p_q)); r text := public.current_app_role()::text;
begin
  if r is null or not exists (select 1 from public.nav_role_visibility v where v.role = r and v.view_key = 'rpt-packages-inventory' and v.visible) then return; end if;
  if length(q) < 4 then return; end if;
  return query
  select d.package_tag, d.item_name, d.strain, d.room, d.pounds, d.finished, d.licence
    from public.mv_package_dossier d
   where d.package_tag like '%' || q || '%' or upper(coalesce(d.item_name, '')) like '%' || q || '%' or upper(coalesce(d.strain, '')) like '%' || q || '%'
   order by (d.package_tag like '%' || q) desc, d.finished asc nulls last, d.packaged_on desc nulls last
   limit 20;
end $$;
select cron.unschedule('package-360-refresh');
select cron.schedule('package-360-refresh', '7,37 * * * *', $c$ set statement_timeout = '5min'; select public.tg_refresh_package_360('cron'); $c$);
update public.sync_registry set schedule = '7,37 * * * *', what = 'Refreshes the four materialised sources behind the Package 360 page (dossier, lifecycle, gaps, events) twice an hour at :07 and :37; the page states each as-of. Ledger, master, documents and every tag_event stay live.', updated_at = now() where key = 'package_360_refresh';
update public.matview_heal_policy set max_age = interval '40 minutes' where refresh_fn = 'tg_refresh_package_360';;
