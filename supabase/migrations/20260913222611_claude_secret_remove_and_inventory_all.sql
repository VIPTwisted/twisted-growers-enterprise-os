-- Owner, 13 Sep 2026: "add all AI and bot tokens, keys and secrets on this page so admin can add whatever
-- they need to". The inventory lists every secret in both stores whether or not a sync names it, and a
-- secret can be removed — except the two the machine path cannot live without.
create or replace function public.tg_secret_remove(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.f_caller_is_admin() then raise exception 'Owner, executive or admin only.' using errcode = '42501'; end if;
  if p_name in ('TG_ADMIN_KEY', 'SUPABASE_ANON_KEY') then
    raise exception '% is what every scheduled sync authenticates with. Rotate it (paste a new value); it cannot be removed.', p_name;
  end if;
  if exists (select 1 from public.integration_secrets where name = p_name) then
    delete from public.integration_secrets where name = p_name;
    return jsonb_build_object('ok', true, 'removed', p_name, 'store', 'integration_secrets');
  end if;
  perform public.tg_secret_forget(p_name, true);
  return jsonb_build_object('ok', true, 'removed', p_name, 'store', 'app_secrets');
end $$;
grant execute on function public.tg_secret_remove(text) to authenticated;

drop function public.f_secret_inventory();
create function public.f_secret_inventory()
returns table (name text, store text, present boolean, masked text, updated_at timestamptz, used_by text[], label text, help text)
language sql stable security definer set search_path = public as $$
  with needed as (select distinct unnest(secrets) as name from public.sync_registry where enabled),
  known as (
    select i.name, 'integration_secrets'::text as store, true as present, '••••' || right(i.value, 4) as masked, i.updated_at, null::text as label, null::text as help
      from public.integration_secrets i
    union all
    select s.key, 'app_secrets', (s.status = 'SET'), s.masked, coalesce(s.last_set_at, s.updated_at), s.label, s.help from public.v_secret_status s
  ),
  all_names as (select name from needed union select name from known)
  select a.name,
         coalesce(k.store, case when a.name like 'METRC_%' or a.name in ('APEX_API_KEY','CLICKUP_TOKEN','TG_ADMIN_KEY','SUPABASE_ANON_KEY','APEX_API_BASE','APEX_COMPANY_ID') then 'integration_secrets' else 'app_secrets' end) as store,
         coalesce(k.present, false) as present, k.masked, k.updated_at,
         coalesce((select array_agg(r.key order by r.sort) from public.sync_registry r where a.name = any(r.secrets)), '{}') as used_by,
         k.label, k.help
  from all_names a left join known k on k.name = a.name
  where public.f_caller_is_admin()
  order by coalesce(k.present, false), a.name
$$;
grant execute on function public.f_secret_inventory() to authenticated;;
