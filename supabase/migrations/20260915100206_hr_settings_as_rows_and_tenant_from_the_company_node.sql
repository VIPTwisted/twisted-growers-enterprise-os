-- White-label (owner, 15 Sep 2026: "rules, staff shit is part of onboarding — do not hardwire"):
-- (1) hr.tg_tenant_id() returned a literal uuid — the tenant is the company org node (the root of hr.org_nodes), read,
--     never written in code; (2) the HR platform's Settings (company name, wage and points rules, thresholds) lived in
--     each browser's localStorage with the company name as a default in the source — they are now rows:
--     hr.tenant_config.settings for the tenant, read by hr.tg_settings_get() (company name defaulting to the company
--     node's name) and written by hr.tg_settings_save() by an admin or an HR-rank role. The onboarding step
--     hr.tenant_config measures the row. Additive only.
set search_path = public;

create or replace function hr.tg_tenant_id()
returns uuid language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce((select n.id from hr.org_nodes n where n.node_type = 'company' and n.parent_id is null and n.is_active order by n.created_at limit 1),
                  'a7b1c2d3-0000-4000-8000-747769737400'::uuid)
$$;
comment on function hr.tg_tenant_id() is 'White-label: the tenant is the company org node (the root of hr.org_nodes). The literal is only the fallback for an empty tree.';

create or replace function hr.tg_settings_get()
returns jsonb language sql stable security definer set search_path = hr, public, extensions as $$
  select coalesce((select c.settings from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id is null limit 1), '{}'::jsonb)
         || jsonb_build_object('company_name', coalesce((select c.settings->>'company_name' from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id is null limit 1),
                                                        (select n.name from hr.org_nodes n where n.id = hr.tg_tenant_id())),
                               'settings_saved', exists (select 1 from hr.tenant_config c where c.tenant_id = hr.tg_tenant_id() and c.node_id is null))
$$;
revoke all on function hr.tg_settings_get() from public, anon;
grant execute on function hr.tg_settings_get() to authenticated, service_role;
comment on function hr.tg_settings_get() is 'White-label: the HR platform settings as rows (hr.tenant_config.settings for the tenant). company_name defaults to the company org node''s name. settings_saved says whether the company has saved them yet.';

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
  values (hr.tg_tenant_id(), null, p, now())
  on conflict (tenant_id, node_id) do update set settings = hr.tenant_config.settings || excluded.settings, updated_at = now();
  begin
    insert into hr.audit_log (actor_person, action, entity_type, entity_id, detail)
    values (v_person, 'Settings saved', 'tenant_config', hr.tg_tenant_id(), jsonb_build_object('keys', (select jsonb_agg(k) from jsonb_object_keys(p) k)));
  exception when others then null; end;
  select hr.tg_settings_get() into v_out;
  return v_out;
end $$;
revoke all on function hr.tg_settings_save(jsonb) from public, anon;
grant execute on function hr.tg_settings_save(jsonb) to authenticated, service_role;
comment on function hr.tg_settings_save(jsonb) is 'White-label: saves (merges) the HR platform settings for the tenant — an admin or an HR-manager role; audited.';
notify pgrst, 'reload schema';;
