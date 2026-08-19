/* ═══════════════════════════════════════════════════════════════════════════
   "SAVED. EVERY PAGE WILL NOW OPEN ON CUSTOM FOR YOU." — AND IT DID NOT.

   The date default has two scopes: this page, and everywhere. The page scope
   writes preset_key, custom_from and custom_to into user_page_date_default and
   works correctly. The everywhere scope writes ONLY default_date_preset into
   user_settings — which has no column that could hold a custom range — so the
   two dates were dropped on the floor while the page said it had saved them.
   On reopen f_date_default returned preset_key='custom' with both dates null,
   the client read 'custom' and set both ends to blank, and the page opened on
   ALL DATES: the precise thing the owner ruled against on 19 Aug 2026.

   Two nullable columns and one coalesce. The page scope still outranks the user
   scope — that precedence is unchanged and is why the page-level lookups stay
   first in every branch below. */

alter table user_settings add column if not exists custom_from date;
alter table user_settings add column if not exists custom_to   date;

comment on column user_settings.custom_from is
  'Start of this user''s own custom default range, used when default_date_preset = ''custom''. Read by f_date_default AFTER the per-page value in user_page_date_default, which outranks it.';
comment on column user_settings.custom_to is
  'End of this user''s own custom default range. See custom_from.';

create or replace function public.f_date_default(p_user uuid, p_view_key text)
 returns jsonb
 language sql
 stable parallel safe
 set search_path = public
as $function$
  select jsonb_build_object(
    'preset_key', coalesce(
        (select p.preset_key from user_page_date_default p
          where p.user_id = p_user and p.view_key = p_view_key),
        (select u.default_date_preset from user_settings u where u.user_id = p_user),
        'this_month'),
    /* A custom range is only meaningful alongside the preset that won. Page
       scope first, then the user's own — the same order as preset_key above, so
       the three fields can never come back describing two different decisions. */
    'custom_from', coalesce(
        (select p.custom_from from user_page_date_default p
          where p.user_id = p_user and p.view_key = p_view_key),
        (select u.custom_from from user_settings u
          where u.user_id = p_user
            and not exists (select 1 from user_page_date_default p2
                             where p2.user_id = p_user and p2.view_key = p_view_key))),
    'custom_to', coalesce(
        (select p.custom_to from user_page_date_default p
          where p.user_id = p_user and p.view_key = p_view_key),
        (select u.custom_to from user_settings u
          where u.user_id = p_user
            and not exists (select 1 from user_page_date_default p2
                             where p2.user_id = p_user and p2.view_key = p_view_key))),
    'scope', coalesce((select u.date_default_scope from user_settings u
                        where u.user_id = p_user), 'remember_last'),
    'source', case
       when exists (select 1 from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key)
            then 'this user, this page'
       when exists (select 1 from user_settings u
                     where u.user_id = p_user and u.default_date_preset is not null)
            then 'this user''s own default'
       else 'the company default — this month (owner ruling, 19 Aug 2026)'
     end);
$function$;