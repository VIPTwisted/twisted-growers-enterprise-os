-- Agent I applying TG-08's authored migration, 12 Aug 2026. The authoring agent held only the
-- read-only tg_desktop_reader role and could not apply it.
-- File: supabase/migrations/20260812210000_keys_and_connections_accepts_a_key_and_never_hands_one_back.sql
--
-- IT CLOSES THREE CLEAR-TEXT ROUTES TO EVERY STORED CREDENTIAL, all measured live today:
--   1. app_secrets.value column SELECT granted to `authenticated`, with an enabled raw
--      data_browser nav row over the table - so any signed-in owner read every key in a browser.
--   2. v_secret_status.masked exposed left(value,7)||right(value,4) = ELEVEN characters, to
--      `authenticated` AND `tg_desktop_reader`. It leaked nothing only because the single
--      registered key was unset; it would have started leaking the moment one was pasted.
--   3. tg_read_secret(text) is SECURITY DEFINER, returns the value verbatim, has NO role check in
--      its body, and `authenticated` held EXECUTE - any logged-in employee could read any
--      credential over PostgREST. This is the severe one.
--
-- NOT TOUCHED, deliberately: sheet_sources.push_token, still clear text with ss_r as
-- FOR SELECT USING (true) to authenticated. That is the owner's live P0 and gets its own decision.
--
-- V2: the original set nav_registry.range_kind = null, which is NOT NULL. Left untouched instead -
-- date_policy = 'not_applicable' is what actually stops the date filter.

alter table public.app_secrets add column if not exists value_is_set boolean not null default false;
alter table public.app_secrets add column if not exists value_last4  text;
alter table public.app_secrets add column if not exists value_set_at timestamptz;

comment on column public.app_secrets.value_last4 is
  'The last four characters ONLY, and only when the stored value is at least twelve characters '
  'long. Below that a four-character tail is a large fraction of the secret, so this stays null '
  'and the page shows "set" with no hint at all.';

update public.app_secrets
   set value_is_set = (coalesce(value, '') <> ''),
       value_last4  = case when length(coalesce(value, '')) >= 12 then right(value, 4) end,
       value_set_at = case when coalesce(value, '') <> '' then updated_at end
 where value_is_set is distinct from (coalesce(value, '') <> '');

create or replace view public.v_secret_status as
  select s.key, s.label, s.help,
         case when s.value_is_set then 'SET' else 'NOT SET' end   as status,
         case when s.value_is_set and s.value_last4 is not null
              then '••••' || s.value_last4 end                    as masked,
         s.updated_at,
         s.value_set_at                                           as last_set_at,
         coalesce(u.display_name, 'unknown')                      as last_set_by
    from public.app_secrets s
    left join public.app_users u on u.user_id = s.updated_by;

comment on view public.v_secret_status is
  'What is configured, when it was last set, and by whom. It does not reference app_secrets.value '
  'and it never will: the last-four hint is computed at write time into value_last4. A key nobody '
  'can date is a key nobody can rotate with confidence, which is why last_set_at and last_set_by '
  'are here and why this page must never be date-filtered -- a key set in July is still set today.';

create or replace function public.tg_set_secret(p_key text, p_value text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
        v_val text := btrim(coalesce(p_value, ''));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid() and u.role in ('owner', 'executive')) then
    raise exception 'Only an owner or an executive can set a key.' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'A key needs a name.' using errcode = '22023';
  end if;
  if v_val = '' then
    raise exception 'Nothing was pasted. To remove a key use the Remove button, which says so.'
      using errcode = '22023';
  end if;

  insert into app_secrets (key, value, value_is_set, value_last4, value_set_at, updated_by, updated_at)
  values (v_key, v_val, true,
          case when length(v_val) >= 12 then right(v_val, 4) end,
          now(), auth.uid(), now())
  on conflict (key) do update
     set value = excluded.value, value_is_set = true,
         value_last4 = excluded.value_last4, value_set_at = now(),
         updated_by = auth.uid(), updated_at = now();

  insert into audit_events (actor, entity, entity_id, action, new_value)
  values (auth.uid(), 'app_secrets', v_key, 'set', jsonb_build_object('set', true));
end $function$;

comment on function public.tg_set_secret(text, text) is
  'Store or replace a credential. Owner or executive only. Returns void ON PURPOSE: the page '
  're-reads v_secret_status afterwards and shows the registry''s own state rather than what this '
  'function claimed, so the screen cannot say "saved" about something that did not save.';

create or replace function public.tg_secret_register(p_key text, p_label text, p_help text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid() and u.role in ('owner', 'executive')) then
    raise exception 'Only an owner or an executive can register a key.' using errcode = '42501';
  end if;
  if v_key = '' then
    raise exception 'A key needs a name.' using errcode = '22023';
  end if;

  insert into app_secrets (key, value, value_is_set, label, help, updated_by, updated_at)
  values (v_key, '', false, nullif(btrim(coalesce(p_label, '')), ''),
          nullif(btrim(coalesce(p_help, '')), ''), auth.uid(), now())
  on conflict (key) do update
     set label = coalesce(nullif(btrim(coalesce(p_label, '')), ''), app_secrets.label),
         help  = coalesce(nullif(btrim(coalesce(p_help,  '')), ''), app_secrets.help);
end $function$;

create or replace function public.tg_secret_forget(p_key text, p_drop_registration boolean default false)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid() and u.role in ('owner', 'executive')) then
    raise exception 'Only an owner or an executive can remove a key.' using errcode = '42501';
  end if;

  if p_drop_registration then
    delete from app_secrets where key = v_key;
  else
    update app_secrets
       set value = '', value_is_set = false, value_last4 = null, value_set_at = null,
           updated_by = auth.uid(), updated_at = now()
     where key = v_key;
  end if;

  insert into audit_events (actor, entity, entity_id, action, new_value)
  values (auth.uid(), 'app_secrets', v_key,
          case when p_drop_registration then 'deregistered' else 'cleared' end,
          jsonb_build_object('set', false));
end $function$;

-- Close the three read routes. A table-level grant cannot have one column carved out of it, so
-- the table grant goes and the non-secret columns are granted back BY NAME. RLS restricts rows;
-- this restricts COLUMNS for everybody, owner included - which is what "can never be read back
-- into a browser" has to mean if the sentence is to be true.
revoke select on public.app_secrets from authenticated;
grant  select (key, label, help, value_is_set, value_last4, value_set_at, updated_by, updated_at)
       on public.app_secrets to authenticated;

-- budz-chat is the sole repo caller and uses the SERVICE ROLE client, so it keeps working.
revoke execute on function public.tg_read_secret(text) from authenticated;

grant execute on function public.tg_set_secret(text, text)            to authenticated;
grant execute on function public.tg_secret_register(text, text, text) to authenticated;
grant execute on function public.tg_secret_forget(text, boolean)      to authenticated;

insert into public.app_secrets (key, value, value_is_set, label, help, updated_at)
values ('ALERT_EMAIL_API_KEY', '', false,
        'Alert email key',
        'Resend API key. Lets the platform email you when a sync goes dark. Get it at resend.com → API Keys.',
        now())
on conflict (key) do update set label = excluded.label, help = excluded.help;

update public.app_secrets
   set label = coalesce(label, 'Artificial intelligence key'),
       help  = coalesce(help, 'Anthropic API key. Powers the free-form assistant. Every report and '
                              'suggestion button works without it.')
 where key = 'ANTHROPIC_API_KEY';

-- A DATE FILTER ON A REGISTRY OF WHAT IS CONFIGURED IS A WAY TO HIDE CONFIGURATION. The page
-- opened on this_month_td, so a key set in July read as absent and the operator's next move is to
-- paste a second one. updated_at stays a COLUMN; it is not a lens.
update public.nav_registry
   set date_policy = 'not_applicable', default_range = null
 where view_key in ('app_secrets', 'integration-secrets', 'app-secrets');

update public.nav_registry set archetype = 'rules_editor' where view_key = 'app_secrets';

-- Retire the raw browser over the same table: once `value` is ungranted, its `select *` renders a
-- permission error, and displaying the secret was the only thing it did that Keys & Connections
-- does not. Two pages over one table where the poorer one leaks - delete one, do not improve both.
update public.nav_registry
   set enabled = false,
       description = 'Retired 12 Aug 2026. It browsed the raw app_secrets table, including the '
                     'value column, which is no longer readable from a browser by anyone. Use '
                     'Settings → Keys & Connections, which shows what is set, its last four '
                     'characters, and when and by whom — and lets you paste a new one.'
 where view_key = 'app-secrets';

update public.nav_registry
   set description = 'Paste service keys here. Values are stored server side and can never be read '
                     'back into a browser — this page shows only whether a key is set, its last four '
                     'characters, and when and by whom it was last set.'
 where view_key = 'app_secrets';

do $$
declare v_def text;
begin
  v_def := pg_get_viewdef('public.v_secret_status'::regclass, true);
  if v_def ~ '\mvalue\M' then
    raise exception 'v_secret_status references the bare column `value`. A secrets registry view '
                    'must not read the secret, not even to mask it. Refusing to commit.';
  end if;
  if has_column_privilege('authenticated', 'public.app_secrets', 'value', 'SELECT') then
    raise exception 'authenticated can still SELECT app_secrets.value. Refusing to commit.';
  end if;
  if has_function_privilege('authenticated', 'public.tg_read_secret(text)', 'EXECUTE') then
    raise exception 'authenticated can still EXECUTE tg_read_secret. Refusing to commit.';
  end if;
end $$;;
