-- Settings screen backend (HR brain, project zsmdejhgdyyaakqsjhmk) — idempotent.
-- Personal account settings for the logged-in employee: Profile, Notifications,
-- Privacy, Security. All access via SECURITY DEFINER RPCs (RLS on, no anon table
-- policies) — the app authenticates through pin_login and calls RPCs under the
-- anon role, exactly like every sibling HR RPC.
--
-- Verified MISSING on live 2026-07-17 (every one returned 404 / undefined_function
-- via the anon PostgREST endpoint):
--   update_profile, update_notification_prefs, update_privacy_prefs, change_pin,
--   get_account_settings, get_security_events.
--
-- REUSED live (not recreated here):
--   emergency_contacts + get_my_emergency_contacts / save_emergency_contact
--     (see 20260716120000_emergency_contacts.sql) — Profile > Emergency Contact.
--   audit_log(actor_person, action, detail, created_at) — real sign-in history
--     powering the Security event log, last-login and account-age KPIs.
--
-- Live column shapes reused: people(id, full_name, login_id, email, phone,
--   display_name, is_active, pin_hash), audit_log(id, actor_person, action,
--   detail jsonb, created_at). people has NO bio/pronouns/language columns, so
--   those personal fields live in user_settings.profile_extra (jsonb).

create extension if not exists pgcrypto;

-- ── Per-person preference store ─────────────────────────────────────────────
-- One row per employee. notification_prefs / privacy_prefs are free-form maps
-- keyed by the UI toggle keys; profile_extra holds bio / pronouns / language
-- (fields that have no dedicated column on people).
create table if not exists public.user_settings (
  person_id          uuid primary key,
  notification_prefs jsonb       not null default '{}'::jsonb,
  privacy_prefs      jsonb       not null default '{}'::jsonb,
  profile_extra      jsonb       not null default '{}'::jsonb,
  updated_at         timestamptz not null default now()
);

alter table public.user_settings enable row level security;

-- ── Read: everything the Settings screen needs in one round-trip ────────────
create or replace function public.get_account_settings(p_person_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'person', (
      select jsonb_build_object(
        'id',           p.id,
        'full_name',    p.full_name,
        'email',        p.email,
        'phone',        p.phone,
        'display_name', p.display_name,
        'login_id',     p.login_id
      )
      from public.people p
      where p.id = p_person_id
    ),
    'notification_prefs', coalesce((select us.notification_prefs from public.user_settings us where us.person_id = p_person_id), '{}'::jsonb),
    'privacy_prefs',      coalesce((select us.privacy_prefs      from public.user_settings us where us.person_id = p_person_id), '{}'::jsonb),
    'profile_extra',      coalesce((select us.profile_extra      from public.user_settings us where us.person_id = p_person_id), '{}'::jsonb),
    'emergency_contacts', (select count(*) from public.emergency_contacts ec where ec.person_id = p_person_id),
    'first_seen',         (select min(created_at) from public.audit_log where actor_person = p_person_id),
    'last_login',         (select max(created_at) from public.audit_log where actor_person = p_person_id and action ilike '%login%'),
    'sign_ins_7d',        (select count(*) from public.audit_log where actor_person = p_person_id and action ilike '%login%' and created_at > now() - interval '7 days')
  );
$$;

-- ── Read: real security / activity events for this employee (audit_log) ─────
create or replace function public.get_security_events(p_person_id uuid, p_limit int default 20)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',         s.id,
           'action',     s.action,
           'detail',     s.detail,
           'created_at', s.created_at
         ) order by s.created_at desc), '[]'::jsonb)
  from (
    select id, action, detail, created_at
    from public.audit_log
    where actor_person = p_person_id
    order by created_at desc
    limit greatest(coalesce(p_limit, 20), 1)
  ) s;
$$;

-- ── Write: profile (people row + bio/pronouns/language in profile_extra) ────
create or replace function public.update_profile(
  p_person_id uuid,
  p_full_name text,
  p_email     text,
  p_phone     text,
  p_bio       text default null,
  p_pronouns  text default null,
  p_language  text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing person');
  end if;

  update public.people
     set full_name = coalesce(nullif(btrim(p_full_name), ''), full_name),
         email     = p_email,
         phone     = p_phone
   where id = p_person_id
  returning full_name into v_name;

  if v_name is null then
    return jsonb_build_object('ok', false, 'error', 'person not found');
  end if;

  insert into public.user_settings (person_id, profile_extra, updated_at)
  values (
    p_person_id,
    jsonb_strip_nulls(jsonb_build_object('bio', p_bio, 'pronouns', p_pronouns, 'language', p_language)),
    now()
  )
  on conflict (person_id) do update
     set profile_extra = public.user_settings.profile_extra
                         || jsonb_strip_nulls(jsonb_build_object('bio', p_bio, 'pronouns', p_pronouns, 'language', p_language)),
         updated_at    = now();

  return jsonb_build_object('ok', true, 'person_id', p_person_id, 'full_name', v_name);
end; $$;

-- ── Write: notification preferences ─────────────────────────────────────────
create or replace function public.update_notification_prefs(p_person_id uuid, p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing person');
  end if;
  insert into public.user_settings (person_id, notification_prefs, updated_at)
  values (p_person_id, coalesce(p_prefs, '{}'::jsonb), now())
  on conflict (person_id) do update
     set notification_prefs = coalesce(p_prefs, '{}'::jsonb),
         updated_at         = now();
  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: privacy preferences ──────────────────────────────────────────────
create or replace function public.update_privacy_prefs(p_person_id uuid, p_prefs jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing person');
  end if;
  insert into public.user_settings (person_id, privacy_prefs, updated_at)
  values (p_person_id, coalesce(p_prefs, '{}'::jsonb), now())
  on conflict (person_id) do update
     set privacy_prefs = coalesce(p_prefs, '{}'::jsonb),
         updated_at    = now();
  return jsonb_build_object('ok', true);
end; $$;

-- ── Write: change own PIN (verifies current PIN; bcrypt via pgcrypto) ───────
-- Follows the pin_login / admin_reset_pin convention (crypt + gen_salt('bf')).
create or replace function public.change_pin(
  p_person_id  uuid,
  p_current_pin text,
  p_new_pin     text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  if p_person_id is null then
    return jsonb_build_object('ok', false, 'error', 'missing person');
  end if;
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,8}$' then
    return jsonb_build_object('ok', false, 'error', 'too_short');
  end if;

  select pin_hash into v_hash from public.people where id = p_person_id;
  if v_hash is null then
    return jsonb_build_object('ok', false, 'error', 'person not found');
  end if;
  if crypt(coalesce(p_current_pin, ''), v_hash) <> v_hash then
    return jsonb_build_object('ok', false, 'error', 'wrong_pin');
  end if;

  update public.people
     set pin_hash = crypt(p_new_pin, gen_salt('bf'))
   where id = p_person_id;

  -- Best-effort audit trail; never let a logging hiccup abort the PIN change.
  begin
    insert into public.audit_log (actor_person, action, entity_type, entity_id, detail)
    values (p_person_id, 'PIN Changed', 'people', p_person_id, jsonb_build_object('via', 'settings'));
  exception when others then null;
  end;

  return jsonb_build_object('ok', true);
end; $$;

-- ── Grants (execute-only on definer RPCs; no anon table policies) ───────────
revoke all on function public.get_account_settings(uuid)                     from public;
revoke all on function public.get_security_events(uuid, int)                 from public;
revoke all on function public.update_profile(uuid, text, text, text, text, text, text) from public;
revoke all on function public.update_notification_prefs(uuid, jsonb)         from public;
revoke all on function public.update_privacy_prefs(uuid, jsonb)              from public;
revoke all on function public.change_pin(uuid, text, text)                   from public;

grant execute on function public.get_account_settings(uuid)                     to anon, authenticated;
grant execute on function public.get_security_events(uuid, int)                 to anon, authenticated;
grant execute on function public.update_profile(uuid, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.update_notification_prefs(uuid, jsonb)         to anon, authenticated;
grant execute on function public.update_privacy_prefs(uuid, jsonb)              to anon, authenticated;
grant execute on function public.change_pin(uuid, text, text)                   to anon, authenticated;

-- Verify after apply:
-- select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname='public' and proname in
--  ('get_account_settings','get_security_events','update_profile',
--   'update_notification_prefs','update_privacy_prefs','change_pin');
