-- Keys & Connections must ACCEPT a key, and must never hand one back.
-- Agent TG-08 (Integrations & Connectors), 12 August 2026.
--
-- THE ORDER. The owner has a Resend API key in his hand and will not open the Supabase
-- dashboard: "no im not going into supa", "you need to add way for me to add key and secrets
-- here right now i cant". Settings -> Keys & Connections already exists, is admin_only, and
-- its own description says "Paste service keys here." There has never been anywhere to paste.
--
-- WHAT WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN (live, 12 Aug 2026, read-only role):
--
--   has_column_privilege(role, 'app_secrets','value','SELECT')
--     anon false · authenticated TRUE · service_role true · tg_desktop_reader false
--
--   RLS on app_secrets: one policy, `sec_write`, FOR ALL to authenticated, qual = caller is
--   owner. FOR ALL includes SELECT. So an owner, in a browser, can read every stored key in
--   clear text -- and nav_registry row `app-secrets` (label "App Secrets", archetype
--   data_browser, table_ref app_secrets, ENABLED) is a page that does exactly that.
--
--   v_secret_status.masked = left(value,7) || '…' || right(value,4). That is ELEVEN
--   characters of the secret, not four, and `authenticated` and `tg_desktop_reader` both hold
--   SELECT on the view. Nothing leaks today only because the single registered key is unset.
--   The moment a key is pasted, eleven characters of it become readable by a reporting role.
--
--   tg_read_secret(p_key text) is SECURITY DEFINER, returns app_secrets.value verbatim, has
--   NO role check in its body at all, and EXECUTE is held by `authenticated`. Any logged-in
--   employee can call it over PostgREST and receive any key in clear text.
--
-- Three routes to the same failure the owner named as a live P0. This migration closes all
-- three and builds the paste field on top of a vault that cannot be read back.
--
-- THE DESIGN RULE THIS FILE OBEYS. The order was: "No view exposes a secret value. Not
-- masked-in-SQL -- ABSENT." So `value` is not masked inside the view; the view stops
-- referencing the column entirely. The last four characters are computed ONCE, at write time,
-- into a separate non-secret column. After this runs, `pg_get_viewdef('v_secret_status')`
-- contains no bare word `value` at all, which is a property a check can assert -- and the DO
-- block at the end of this file asserts it before the transaction is allowed to commit.
--
-- THE GATE, AND WHY IT IS NOT f_caller_is_admin(). f_caller_is_admin() resolves to
-- f_role_can('admin_settings'), which role_capability grants to `admin` and `cfo` as well.
-- Credential write is narrower than general admin settings. app_secrets is owner-only today
-- and the integration-settings endpoint is owner-or-executive, so owner-or-executive is what
-- these functions use: the same test as `admin_only` / isExec, which is what decides whether
-- the menu entry is visible at all. A gate that disagrees with the menu produces a page a
-- person can open and cannot use, which is rule 3 -- a wrong label costs more than no label.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT TOUCH. `sheet_sources.push_token` is stored in clear
-- text, `authenticated` holds the column grant, and policy `ss_r` is `FOR SELECT ... USING
-- (true)` -- so EVERY logged-in user can read it, not only the reporting role. One token is
-- present, 48 characters. That is the owner's live P0 and it is reported, not fixed here,
-- because it belongs to the sheet-sync surface and deserves its own owner-visible decision.
--
-- UNDO. Every statement is additive or a REVOKE. To reverse: `create or replace view
-- v_secret_status` with the previous body (it is in the baseline migration), re-grant
-- `select on app_secrets to authenticated`, re-grant `execute on tg_read_secret to
-- authenticated`, and set nav_registry.date_policy back to 'auto'. The three new columns and
-- the two new functions may be left in place harmlessly.

begin;

-- ---------------------------------------------------------------------------
-- 1. Non-secret metadata, so nothing downstream ever needs to look at `value`.
-- ---------------------------------------------------------------------------
alter table public.app_secrets add column if not exists value_is_set boolean not null default false;
alter table public.app_secrets add column if not exists value_last4  text;
alter table public.app_secrets add column if not exists value_set_at timestamptz;

comment on column public.app_secrets.value_last4 is
  'The last four characters ONLY, and only when the stored value is at least twelve characters '
  'long. Below that a four-character tail is a large fraction of the secret, so this stays null '
  'and the page shows "set" with no hint at all.';

-- Backfill from what is already stored. This is the one and only place outside the setter
-- where `value` is read, and it emits a length test and a four-character tail, never the value.
update public.app_secrets
   set value_is_set = (coalesce(value, '') <> ''),
       value_last4  = case when length(coalesce(value, '')) >= 12 then right(value, 4) end,
       value_set_at = case when coalesce(value, '') <> '' then updated_at end
 where value_is_set is distinct from (coalesce(value, '') <> '');

-- ---------------------------------------------------------------------------
-- 2. The view stops touching the secret. Columns 1-6 keep their names, types and
--    order, so this is a CREATE OR REPLACE and never a drop (rule E1). Two columns
--    are appended, which CREATE OR REPLACE VIEW permits.
-- ---------------------------------------------------------------------------
create or replace view public.v_secret_status as
  select s.key,
         s.label,
         s.help,
         case when s.value_is_set then 'SET' else 'NOT SET' end                as status,
         case when s.value_is_set and s.value_last4 is not null
              then '••••' || s.value_last4 end                                 as masked,
         s.updated_at,
         s.value_set_at                                                        as last_set_at,
         coalesce(u.display_name, 'unknown')                                   as last_set_by
    from public.app_secrets s
    left join public.app_users u on u.user_id = s.updated_by;

comment on view public.v_secret_status is
  'What is configured, when it was last set, and by whom. It does not reference app_secrets.value '
  'and it never will: the last-four hint is computed at write time into value_last4. A key nobody '
  'can date is a key nobody can rotate with confidence, which is why last_set_at and last_set_by '
  'are here and why this page must never be date-filtered -- a key set in July is still set today.';

-- ---------------------------------------------------------------------------
-- 3. Write path. One verb per function; no function both stores and returns a value.
-- ---------------------------------------------------------------------------

-- Store or replace a key. Signature unchanged (text, text) so nothing that may already call
-- it breaks; the body gains the gate, the metadata and the refusals.
create or replace function public.tg_set_secret(p_key text, p_value text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
        v_val text := btrim(coalesce(p_value, ''));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid()
                    and u.role in ('owner', 'executive')) then
    raise exception 'Only an owner or an executive can set a key.'
      using errcode = '42501';
  end if;

  if v_key = '' then
    raise exception 'A key needs a name.' using errcode = '22023';
  end if;

  -- Refuse the empty paste. Without this, a stray Save wipes a working credential and the
  -- page truthfully reports NOT SET, which reads as "it was never there".
  if v_val = '' then
    raise exception 'Nothing was pasted. To remove a key use the Remove button, which says so.'
      using errcode = '22023';
  end if;

  insert into app_secrets (key, value, value_is_set, value_last4, value_set_at, updated_by, updated_at)
  values (v_key, v_val, true,
          case when length(v_val) >= 12 then right(v_val, 4) end,
          now(), auth.uid(), now())
  on conflict (key) do update
     set value        = excluded.value,
         value_is_set = true,
         value_last4  = excluded.value_last4,
         value_set_at = now(),
         updated_by   = auth.uid(),
         updated_at   = now();

  -- Audit the EVENT, never the value. audit_secret_touch() does the same for
  -- integration_secrets; this keeps app_secrets on the same footing.
  insert into audit_events (actor, entity, entity_id, action, new_value)
  values (auth.uid(), 'app_secrets', v_key, 'set', jsonb_build_object('set', true));
end $function$;

comment on function public.tg_set_secret(text, text) is
  'Store or replace a credential. Owner or executive only. Returns void ON PURPOSE: the page '
  're-reads v_secret_status afterwards and shows the registry''s own state rather than what this '
  'function claimed, so the screen cannot say "saved" about something that did not save.';

-- Name a well-known key in plain English, with no value attached. This is a different verb
-- from storing one, which is why it is a different function and not a widened tg_set_secret.
create or replace function public.tg_secret_register(p_key text, p_label text, p_help text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid()
                    and u.role in ('owner', 'executive')) then
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

-- Remove a stored credential. The registration row survives by default so the key keeps its
-- name and its help and shows honestly as NOT SET -- a key that vanishes from the list is
-- indistinguishable from a key that was never named.
create or replace function public.tg_secret_forget(p_key text, p_drop_registration boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_key text := upper(btrim(coalesce(p_key, '')));
begin
  if not exists (select 1 from app_users u
                  where u.user_id = auth.uid()
                    and u.role in ('owner', 'executive')) then
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

-- ---------------------------------------------------------------------------
-- 4. Close the three read routes.
-- ---------------------------------------------------------------------------

-- 4a. `authenticated` holds table-level SELECT on app_secrets, and in Postgres a table-level
--     grant cannot have one column carved out of it. So the table grant goes and the
--     non-secret columns are granted back by name. RLS still restricts the ROWS to an owner;
--     this restricts the COLUMNS for everybody, owner included, which is what "can never be
--     read back into a browser" has to mean if the sentence is to be true.
revoke select on public.app_secrets from authenticated;
grant  select (key, label, help, value_is_set, value_last4, value_set_at, updated_by, updated_at)
       on public.app_secrets to authenticated;

-- 4b. tg_read_secret returns the value in clear text and has no gate of its own. Only server
--     side callers have any business with it. budz-chat is the sole caller in the repository
--     and it uses the SERVICE ROLE client (app/supabase/functions/budz-chat/index.ts line 11
--     builds `sb` from SUPABASE_SERVICE_ROLE_KEY, line 456 calls the RPC on it), so it keeps
--     working. Verified by reading the file, not by assuming.
revoke execute on function public.tg_read_secret(text) from authenticated;

-- 4c. The new write path is reachable from the browser; the gate is inside each function.
grant execute on function public.tg_set_secret(text, text)              to authenticated;
grant execute on function public.tg_secret_register(text, text, text)   to authenticated;
grant execute on function public.tg_secret_forget(text, boolean)        to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The first key the owner actually needs, named in plain English.
-- ---------------------------------------------------------------------------
insert into public.app_secrets (key, value, value_is_set, label, help, updated_at)
values ('ALERT_EMAIL_API_KEY', '', false,
        'Alert email key',
        'Resend API key. Lets the platform email you when a sync goes dark. Get it at resend.com → API Keys.',
        now())
on conflict (key) do update
   set label = excluded.label,
       help  = excluded.help;

update public.app_secrets
   set label = coalesce(label, 'Artificial intelligence key'),
       help  = coalesce(help, 'Anthropic API key. Powers the free-form assistant. Every report and '
                              'suggestion button works without it.')
 where key = 'ANTHROPIC_API_KEY';

-- ---------------------------------------------------------------------------
-- 6. The page stops being a report.
-- ---------------------------------------------------------------------------
-- A DATE FILTER ON A REGISTRY OF WHAT IS CONFIGURED IS A WAY TO HIDE CONFIGURATION. The page
-- opened on `this_month_td`, so a key set in July read as absent, and the operator's next move
-- is to paste a second one. `not_applicable` is the established value for exactly this kind of
-- page -- 75 rows already carry it, including company_licenses, labs and permission-catalog.
-- updated_at stays a COLUMN, because rotating with confidence needs it; it is not a lens.
update public.nav_registry
   set date_policy   = 'not_applicable',
       default_range = null,
       range_kind    = null
 where view_key in ('app_secrets', 'integration-secrets', 'app-secrets');

-- Declare the archetype rather than leaving it null. `rules_editor` already covers 34 pages
-- whose job is to SET something rather than read a ledger, which is exactly what this is. An
-- existing value, not a new one -- a second word for the same idea is the defect
-- `hold_the_ddc_discipline` names. page-architecture.mjs is red on DB state today (153 pages
-- with no archetype against a ceiling of 129) and this takes one row off that count. It does
-- not change what renders: App.jsx routes app_secrets through the `special` map, which is
-- consulted before any archetype.
update public.nav_registry set archetype = 'rules_editor' where view_key = 'app_secrets';

-- The description promised a capability the page did not have. It has it now, so the sentence
-- can stay -- but "can never be read back into a browser" was NOT true when it was written and
-- is only true from this migration onwards.
update public.nav_registry
   set description = 'Paste service keys here. Values are stored server side and can never be read '
                     'back into a browser — this page shows only whether a key is set, its last four '
                     'characters, and when and by whom it was last set.'
 where view_key = 'app_secrets';

-- ---------------------------------------------------------------------------
-- 7. A check that would have caught the thing this file fixes.
--    Asserted here, before commit. See the report for what is NOT guarded.
-- ---------------------------------------------------------------------------
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
end $$;

commit;
