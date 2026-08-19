/* EVERY PAGE OPENS ON THIS MONTH — owner instruction, 19 Aug 2026:
 *
 *   "WHERE IS DATE RANGE? WE WANT DEFAULT ON ALL PAGES TO BE THIS MONTH AND
 *    THEN FULLY CHANGE AND PULL DATES. WE DON'T WANT TO SEE, WHEN WE LOG IN,
 *    FULLY HISTORY."
 *
 * f_date_default fell back to 'all' for any page whose report registry entry
 * carries no date_column — which is most of them. So signing in put two and a
 * half years of history on the screen and called it today's position. The
 * owner has never asked for that view as a default; he asks for it by pressing
 * All, which still works.
 *
 * ORDER OF PRECEDENCE IS UNCHANGED and still puts the person first:
 *   1. what this user chose on this page,
 *   2. what this user set as their own default,
 *   3. THIS MONTH — the company default, from here on,
 * and only a deliberate press of All shows everything. A page with no date
 * column simply has nothing to filter, so opening it on this month costs
 * nothing and keeps one consistent answer to "what am I looking at". */

create or replace function public.f_date_default(p_user uuid, p_view_key text)
returns jsonb
language sql stable parallel safe
as $function$
  select jsonb_build_object(
    'preset_key', coalesce(
        (select p.preset_key from user_page_date_default p
          where p.user_id = p_user and p.view_key = p_view_key),
        (select u.default_date_preset from user_settings u where u.user_id = p_user),
        'this_month'),
    'custom_from', (select p.custom_from from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key),
    'custom_to',   (select p.custom_to from user_page_date_default p
                     where p.user_id = p_user and p.view_key = p_view_key),
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

comment on function public.f_date_default(uuid, text) is
  'What date range a page opens on. Precedence: this user on this page, then this user''s own '
  'default, then THIS MONTH as the company default — owner ruling 19 Aug 2026: "we do not want to '
  'see, when we log in, fully history." Signing in used to show two and a half years on any page '
  'whose registry entry had no date_column. All history is still one press of All away. Agent I.';;
