-- AdminPanel backend gaps (HR brain, project zsmdejhgdyyaakqsjhmk).
-- src/screens/AdminPanel.jsx already reuses live RPCs for everything else:
--   get_roster, hr_list_roles, hr_list_nodes, hr_create_employee,
--   admin_update_person, write_audit, get_audit_log, hr_integrations_list,
--   hr_integration_set_status, hr_logs_list.
-- Verified missing on live (2026-07-17):
--   * set_person_pin exists but is permission-denied for anon (42501) and
--     admin_create_person likewise -> a scoped, validated admin_reset_pin is
--     authored here instead of widening grants on unknown code.
--   * No location profile storage (address/phone/hours/staffing per org node).
--   * No security policy / IP allow-list storage.
-- Idempotent — safe to re-run. RLS on; no anon table policies (all access via
-- SECURITY DEFINER RPCs, EXECUTE granted to anon + authenticated exactly like
-- every sibling HR RPC; the app authenticates through pin_login).
-- Live column shapes reused: people(id, full_name, login_id, is_active, pin_hash),
-- org_nodes(id, name, node_type, tenant_id, path), roles(id, name),
-- assignments(person_id, node_id, role_id, effective_from, status).

create extension if not exists pgcrypto;

-- ── 1. Location profiles (Location Management tab) ───────────────────────────
-- One editable operations profile per org node. Headcount/manager are NOT
-- stored here — the UI derives them live from get_roster (single source of
-- truth); this table only holds facts that exist nowhere else.
create table if not exists public.hr_location_profiles (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid,
  node_id       uuid not null unique references public.org_nodes(id) on delete cascade,
  address       text not null default '',
  phone         text not null default '',
  hours         text not null default '',
  status        text not null default 'Active',        -- Active | Under Review | Closed
  max_headcount integer,
  min_staffing  integer,
  updated_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.hr_location_profiles enable row level security;

create or replace function public.get_location_profiles(p_node_ids uuid[] default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'node_id', lp.node_id, 'address', lp.address, 'phone', lp.phone,
           'hours', lp.hours, 'status', lp.status,
           'max_headcount', lp.max_headcount, 'min_staffing', lp.min_staffing,
           'updated_at', lp.updated_at)), '[]'::jsonb)
  from hr_location_profiles lp
  where p_node_ids is null
     or array_length(p_node_ids, 1) is null
     or lp.node_id = any(p_node_ids);
$$;

-- Partial update semantics: a NULL argument keeps the stored value, so the UI
-- can save one field without clobbering the rest.
create or replace function public.upsert_location_profile(
  p_node_id       uuid,
  p_address       text    default null,
  p_phone         text    default null,
  p_hours         text    default null,
  p_status        text    default null,
  p_max_headcount integer default null,
  p_min_staffing  integer default null,
  p_actor         uuid    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_id uuid;
begin
  if p_node_id is null then
    return jsonb_build_object('ok', false, 'error', 'node_id is required');
  end if;
  select tenant_id into v_tenant from org_nodes where id = p_node_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'unknown org node');
  end if;
  if p_status is not null and p_status not in ('Active', 'Under Review', 'Closed') then
    return jsonb_build_object('ok', false, 'error', 'invalid status');
  end if;

  insert into hr_location_profiles as lp
    (tenant_id, node_id, address, phone, hours, status,
     max_headcount, min_staffing, updated_by)
  values
    (v_tenant, p_node_id, coalesce(p_address, ''), coalesce(p_phone, ''),
     coalesce(p_hours, ''), coalesce(p_status, 'Active'),
     p_max_headcount, p_min_staffing, p_actor)
  on conflict (node_id) do update set
    address       = coalesce(p_address,       lp.address),
    phone         = coalesce(p_phone,         lp.phone),
    hours         = coalesce(p_hours,         lp.hours),
    status        = coalesce(p_status,        lp.status),
    max_headcount = coalesce(p_max_headcount, lp.max_headcount),
    min_staffing  = coalesce(p_min_staffing,  lp.min_staffing),
    updated_by    = coalesce(p_actor,         lp.updated_by),
    updated_at    = now()
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'node_id', p_node_id);
end; $$;

-- ── 2. Security policy + IP allow-list (Security & Audit tab) ────────────────
-- Singleton per tenant. Values previously lived only in component state (lost
-- on refresh); this makes the policy real and durable.
create table if not exists public.hr_security_settings (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique,
  min_pw_len          integer not null default 8,
  session_timeout_min integer not null default 30,
  max_failed_logins   integer not null default 5,
  require_2fa         boolean not null default false,
  ip_whitelist        jsonb   not null default '[]'::jsonb,
  updated_by          uuid,
  updated_at          timestamptz not null default now()
);
alter table public.hr_security_settings enable row level security;

-- Returns the stored policy, or honest defaults (persisted=false) before the
-- first save — the UI shows exactly which one it has.
create or replace function public.get_security_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
        'min_pw_len', s.min_pw_len,
        'session_timeout_min', s.session_timeout_min,
        'max_failed_logins', s.max_failed_logins,
        'require_2fa', s.require_2fa,
        'ip_whitelist', s.ip_whitelist,
        'updated_at', s.updated_at,
        'persisted', true)
     from hr_security_settings s
     order by s.updated_at desc limit 1),
    jsonb_build_object(
      'min_pw_len', 8, 'session_timeout_min', 30, 'max_failed_logins', 5,
      'require_2fa', false, 'ip_whitelist', '[]'::jsonb,
      'updated_at', null, 'persisted', false));
$$;

create or replace function public.save_security_settings(
  p_min_pw_len          integer default null,
  p_session_timeout_min integer default null,
  p_max_failed_logins   integer default null,
  p_require_2fa         boolean default null,
  p_ip_whitelist        jsonb   default null,
  p_actor               uuid    default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from org_nodes order by tenant_id limit 1;  -- single-tenant HR
  if v_tenant is null then
    return jsonb_build_object('ok', false, 'error', 'no tenant configured');
  end if;
  if p_min_pw_len is not null and (p_min_pw_len < 4 or p_min_pw_len > 64) then
    return jsonb_build_object('ok', false, 'error', 'min password length out of range');
  end if;
  if p_session_timeout_min is not null and (p_session_timeout_min < 1 or p_session_timeout_min > 1440) then
    return jsonb_build_object('ok', false, 'error', 'session timeout out of range');
  end if;
  if p_max_failed_logins is not null and (p_max_failed_logins < 1 or p_max_failed_logins > 100) then
    return jsonb_build_object('ok', false, 'error', 'max failed logins out of range');
  end if;
  if p_ip_whitelist is not null and jsonb_typeof(p_ip_whitelist) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'ip_whitelist must be an array');
  end if;

  insert into hr_security_settings as s
    (tenant_id, min_pw_len, session_timeout_min, max_failed_logins,
     require_2fa, ip_whitelist, updated_by)
  values
    (v_tenant, coalesce(p_min_pw_len, 8), coalesce(p_session_timeout_min, 30),
     coalesce(p_max_failed_logins, 5), coalesce(p_require_2fa, false),
     coalesce(p_ip_whitelist, '[]'::jsonb), p_actor)
  on conflict (tenant_id) do update set
    min_pw_len          = coalesce(p_min_pw_len,          s.min_pw_len),
    session_timeout_min = coalesce(p_session_timeout_min, s.session_timeout_min),
    max_failed_logins   = coalesce(p_max_failed_logins,   s.max_failed_logins),
    require_2fa         = coalesce(p_require_2fa,         s.require_2fa),
    ip_whitelist        = coalesce(p_ip_whitelist,        s.ip_whitelist),
    updated_by          = coalesce(p_actor,               s.updated_by),
    updated_at          = now();

  return public.get_security_settings() || jsonb_build_object('ok', true);
end; $$;

-- ── 3. Admin PIN reset ───────────────────────────────────────────────────────
-- set_person_pin exists live but EXECUTE is denied to anon; this validated
-- variant follows the pin_login bcrypt convention (pgcrypto crypt/gen_salt).
create or replace function public.admin_reset_pin(
  p_person_id uuid,
  p_pin       text,
  p_actor     uuid default null
) returns jsonb language plpgsql security definer
  set search_path = public, extensions as $$
declare v_name text;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'person id is required');
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN must be 4-8 digits');
  end if;

  update people
     set pin_hash = crypt(p_pin, gen_salt('bf'))
   where id = p_person_id
  returning full_name into v_name;

  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'person not found');
  end if;
  return jsonb_build_object('ok', true, 'person_id', p_person_id, 'full_name', v_name);
end; $$;

-- ── Grants (execute-only on definer RPCs; no anon table policies) ────────────
revoke all on function public.get_location_profiles(uuid[])                                              from public;
revoke all on function public.upsert_location_profile(uuid, text, text, text, text, integer, integer, uuid) from public;
revoke all on function public.get_security_settings()                                                    from public;
revoke all on function public.save_security_settings(integer, integer, integer, boolean, jsonb, uuid)    from public;
revoke all on function public.admin_reset_pin(uuid, text, uuid)                                          from public;

grant execute on function public.get_location_profiles(uuid[])                                              to anon, authenticated;
grant execute on function public.upsert_location_profile(uuid, text, text, text, text, integer, integer, uuid) to anon, authenticated;
grant execute on function public.get_security_settings()                                                    to anon, authenticated;
grant execute on function public.save_security_settings(integer, integer, integer, boolean, jsonb, uuid)    to anon, authenticated;
grant execute on function public.admin_reset_pin(uuid, text, uuid)                                          to anon, authenticated;

-- Verify after apply:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public' and proname in
--   ('get_location_profiles','upsert_location_profile','get_security_settings',
--    'save_security_settings','admin_reset_pin');
