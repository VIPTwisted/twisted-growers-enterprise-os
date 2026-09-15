-- White-label: the tenant settings row is keyed (tenant_id, node_id = the company node) — a NULL node_id would never
-- match the unique key and every save would add a row.
set search_path = public;

create or replace function hr.tg_settings_get()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce((select c.settings from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id = hr.tg_tenant_id() limit 1), '{}'::jsonb)
         || jsonb_build_object('company_name', coalesce((select c.settings->>'company_name' from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id = hr.tg_tenant_id() limit 1),
                                                        (select n.name from hr.org_nodes n where n.id = hr.tg_tenant_id())),
                               'settings_saved', exists (select 1 from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id = hr.tg_tenant_id()))
$$;

create or replace function hr.tg_settings_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_person uuid := hr.current_person_id(); v_rank int; v_out jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Settings are an object of key → value.'; end if;
  select min(r.rank) into v_rank from hr.assignments a join hr.roles r on r.id = a.role_id where a.person_id = v_person and a.status = 'active';
  if not (public.f_caller_is_admin() or coalesce(v_rank, 999) <= 10) then
    raise exception 'Only an administrator or an HR-manager role may change the company settings.' using errcode = '42501';
  end if;
  insert into hr.tenant_config (tenant_id, node_id, settings, updated_at)
  values (hr.tg_tenant_id(), hr.tg_tenant_id(), p, now())
  on conflict (tenant_id, node_id) do update set settings = hr.tenant_config.settings || excluded.settings, updated_at = now();
  begin
    insert into hr.audit_log (actor_person, action, entity_type, entity_id, detail)
    values (v_person, 'Settings saved', 'tenant_config', hr.tg_tenant_id(), jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  exception when others then null; end;
  select hr.tg_settings_get() into v_out;
  return v_out;
end $$;
notify pgrst, 'reload schema';;
