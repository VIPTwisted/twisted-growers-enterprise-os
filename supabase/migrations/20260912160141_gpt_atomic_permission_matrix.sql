set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Both operations retain caller privileges and existing row-level security.
create or replace function public.f_permission_matrix(p_role text)
returns jsonb language plpgsql stable security invoker
set search_path = public, pg_temp
as $function$
declare permissions jsonb; visibility jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to read permissions'; end if;
  if not exists (select 1 from public.app_roles where role = p_role) then
    raise exception 'The selected role is not registered';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.view_key), '[]'::jsonb)
    into permissions from public.page_permissions p where p.role = p_role;
  select coalesce(jsonb_agg(to_jsonb(v) order by v.view_key), '[]'::jsonb)
    into visibility from public.nav_role_visibility v where v.role = p_role;
  return jsonb_build_object(
    'role', p_role, 'permissions', permissions, 'visibility', visibility,
    'revision', md5(jsonb_build_array(permissions, visibility)::text),
    'nav', (select coalesce(jsonb_agg(to_jsonb(n) order by n.category_order,n.item_order,n.id), '[]'::jsonb) from public.nav_registry n where n.enabled),
    'roles', (select coalesce(jsonb_agg(to_jsonb(r) order by r.rank,r.role), '[]'::jsonb) from public.app_roles r)
  );
end
$function$;
revoke all on function public.f_permission_matrix(text) from public, anon;
grant execute on function public.f_permission_matrix(text) to authenticated;

create or replace function public.f_save_permission_matrix(p_role text, p_revision text, p_pages jsonb)
returns jsonb language plpgsql volatile security invoker
set search_path = public, pg_temp
as $function$
declare before_snapshot jsonb; after_snapshot jsonb; requested integer; wrote_permissions integer; wrote_visibility integer;
begin
  if auth.uid() is null or public.f_caller_is_admin() is not true then
    raise exception 'Permission changes require the governed admin settings capability';
  end if;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_array_length(p_pages) = 0 then
    raise exception 'No permission changes were supplied';
  end if;
  requested := jsonb_array_length(p_pages);
  if exists (select 1 from jsonb_array_elements(p_pages) r
    where jsonb_typeof(r) is distinct from 'object'
       or jsonb_typeof(r->'view_key') is distinct from 'string'
       or not exists (select 1 from public.nav_registry n where n.view_key = r->>'view_key')
       or exists (select 1 from unnest(array['menu','can_view','can_edit','can_approve','can_export','can_delete']) k
                  where jsonb_typeof(r->k) is distinct from 'boolean')) then
    raise exception 'Every page must be registered and carry explicit boolean permissions';
  end if;
  if (select count(distinct r->>'view_key') from jsonb_array_elements(p_pages) r) <> requested then
    raise exception 'Duplicate pages are not permitted';
  end if;
  if exists (select 1 from jsonb_array_elements(p_pages) r where (r->>'menu')::boolean and not (r->>'can_view')::boolean) then
    raise exception 'A visible menu requires page view permission';
  end if;
  -- Includes older clients that write the tables directly. These small configuration
  -- tables are locked only for this bounded transaction, never across a user edit.
  lock table public.page_permissions, public.nav_role_visibility in share row exclusive mode;
  before_snapshot := public.f_permission_matrix(p_role);
  if p_revision is null or p_revision is distinct from before_snapshot->>'revision' then
    raise exception 'Permissions changed after this page was loaded. Reload and review before saving';
  end if;
  insert into public.page_permissions(role,view_key,can_view,can_edit,can_approve,can_export,can_delete,updated_by,updated_at)
  select p_role,r->>'view_key',(r->>'can_view')::boolean,(r->>'can_edit')::boolean,
    (r->>'can_approve')::boolean,(r->>'can_export')::boolean,(r->>'can_delete')::boolean,auth.uid(),clock_timestamp()
  from jsonb_array_elements(p_pages) r
  on conflict(role,view_key) do update set
    can_view=excluded.can_view,can_edit=excluded.can_edit,can_approve=excluded.can_approve,
    can_export=excluded.can_export,can_delete=excluded.can_delete,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  get diagnostics wrote_permissions = row_count;
  insert into public.nav_role_visibility(role,view_key,visible,updated_at)
  select p_role,r->>'view_key',(r->>'menu')::boolean,clock_timestamp() from jsonb_array_elements(p_pages) r
  on conflict(view_key,role) do update set visible=excluded.visible,updated_at=excluded.updated_at;
  get diagnostics wrote_visibility = row_count;
  if wrote_permissions <> requested or wrote_visibility <> requested then
    raise exception 'Permission save did not confirm every requested page';
  end if;
  after_snapshot := public.f_permission_matrix(p_role);
  if exists (select 1 from jsonb_array_elements(p_pages) r
    left join public.page_permissions p on p.role=p_role and p.view_key=r->>'view_key'
    left join public.nav_role_visibility v on v.role=p_role and v.view_key=r->>'view_key'
    where p.view_key is null or v.view_key is null or v.visible is distinct from (r->>'menu')::boolean
      or p.can_view is distinct from (r->>'can_view')::boolean or p.can_edit is distinct from (r->>'can_edit')::boolean
      or p.can_approve is distinct from (r->>'can_approve')::boolean or p.can_export is distinct from (r->>'can_export')::boolean
      or p.can_delete is distinct from (r->>'can_delete')::boolean) then
    raise exception 'Returned permissions differ from the proposed changes';
  end if;
  return after_snapshot || jsonb_build_object('saved_count',requested);
end
$function$;
revoke all on function public.f_save_permission_matrix(text,text,jsonb) from public, anon;
grant execute on function public.f_save_permission_matrix(text,text,jsonb) to authenticated;

-- Menu edits use the same existing governed capability as page-action edits.
alter policy nrv_write on public.nav_role_visibility
  using ((select public.f_caller_is_admin()))
  with check ((select public.f_caller_is_admin()));

-- Publish configuration only. Realtime still enforces each subscriber's SELECT policies.
do $publication$
declare target text;
begin
  foreach target in array array['nav_registry','nav_role_visibility','page_permissions','app_users'] loop
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
      execute format('alter publication supabase_realtime add table public.%I',target);
    end if;
  end loop;
end
$publication$;
