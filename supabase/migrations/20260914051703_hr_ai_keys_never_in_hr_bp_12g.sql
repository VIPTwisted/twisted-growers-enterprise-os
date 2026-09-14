-- BP-12g · "Every HR AI feature calls TG's gateway; hr.ai_providers holds no keys".
-- Measured 14 Sep 2026: hr.ai_providers has 0 rows and 0 keys; every hr ai_* function is
-- deterministic (no net.http, no model call). What could drift is the clone's own key store:
-- ai_provider_upsert would accept an API key into hr.ai_providers.api_key_encrypted and
-- ai_provider_decrypt_key would hand it back. Both are now shut: a provider row may exist as
-- a NAME (which TG gateway model to prefer), never as a key. Keys live only on the OS Sync
-- page (integration_secrets); the gateway is the OS's surface (Bible §5, §12g).
set search_path = hr, public, extensions;

create or replace function hr.ai_provider_upsert(p_actor uuid, p_entity_node uuid, p_id uuid, p_name text, p_kind text, p_base_url text, p_api_key text, p_models jsonb, p_cost_tier text, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = hr, public, extensions as $$
declare v_id uuid;
begin
  if not hr._ai_is_admin(p_actor) then
    return jsonb_build_object('ok', false, 'error', 'admin only');
  end if;
  if nullif(trim(coalesce(p_api_key, '')), '') is not null then
    return jsonb_build_object('ok', false, 'error',
      'The HR platform keeps no AI keys. Keys are entered once on the OS Sync page (Settings › Sync) and every HR AI feature goes through the TG gateway. Save the provider by name only.');
  end if;
  if p_id is null then
    insert into hr.ai_providers (tenant_id, entity_node_id, name, kind, base_url, api_key_encrypted, models, cost_tier, enabled, created_by)
    values (hr.tg_tenant_id(), p_entity_node, p_name, coalesce(p_kind, 'gateway'), p_base_url, null, coalesce(p_models, '[]'::jsonb), p_cost_tier, coalesce(p_enabled, true), p_actor)
    returning id into v_id;
  else
    update hr.ai_providers set name = coalesce(p_name, name), kind = coalesce(p_kind, kind), base_url = coalesce(p_base_url, base_url),
           api_key_encrypted = null, models = coalesce(p_models, models), cost_tier = coalesce(p_cost_tier, cost_tier),
           enabled = coalesce(p_enabled, enabled), updated_at = now()
     where id = p_id returning id into v_id;
  end if;
  return jsonb_build_object('ok', v_id is not null, 'id', v_id, 'note', 'saved without a key — the TG gateway carries the credential');
end $$;

create or replace function hr.ai_provider_decrypt_key(p_id uuid)
returns text language sql stable security definer set search_path = hr, public, extensions as $$
  select null::text;  -- there is nothing to decrypt: HR holds no keys (Bible §12g)
$$;

-- belt and braces: the column can never carry a value again
alter table hr.ai_providers drop constraint if exists ai_providers_no_keys;
alter table hr.ai_providers add constraint ai_providers_no_keys check (api_key_encrypted is null);

notify pgrst, 'reload schema';;
