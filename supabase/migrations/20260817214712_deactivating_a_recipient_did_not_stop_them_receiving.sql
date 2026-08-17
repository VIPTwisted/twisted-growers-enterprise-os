/* Deactivating a recipient did not stop them receiving.
 *
 * Both recipient views UNION alert_recipient with auth.users, so anyone with a platform
 * login is included by default. The exclusion on the auth.users branch reads:
 *
 *     not exists (select 1 from alert_recipient r
 *                  where lower(btrim(r.email)) = lower(au.email) and r.active)
 *
 * The `and r.active` is the bug. Setting a recipient inactive makes that NOT EXISTS
 * true, so the address falls straight through the second branch and keeps receiving.
 * Turning someone off was therefore impossible if they had a login, and the screen
 * would show them as inactive while the sender kept mailing them.
 *
 * FOUND 17 Aug 2026 within a minute of the owner asking to stop sending to
 * vincent@twistedgrowers.com. Deactivating the row returned it to the list immediately,
 * sourced from 'auth.users (platform login)'.
 *
 * A ROW THAT EXISTS IS A DECISION. The exclusion must test only for the row, not for
 * its active flag: a row present and inactive means somebody deliberately turned this
 * address off, and that must outrank a default. No row at all means the address was
 * never considered, and defaulting a platform user in is reasonable there.
 *
 * Rule H1 in spirit: turning an alert off is a decision that gets recorded, not a
 * deletion — and a recorded decision has to actually take effect.
 */

create or replace view public.v_alert_email_recipients_internal as
select r.role, r.full_name, r.email,
       'alert_recipient'::text as from_where,
       r.is_platform_user
  from public.alert_recipient r
 where r.active
   and coalesce(btrim(r.email), '') <> ''
union
select coalesce(u.role::text, 'member') as role,
       coalesce(u.display_name, au.email::text) as full_name,
       au.email::text as email,
       'auth.users (platform login)'::text as from_where,
       true as is_platform_user
  from auth.users au
  left join public.app_users u on u.user_id = au.id
 where au.email is not null
   /* No `and r.active`. An inactive row is an explicit opt-out and must win. */
   and not exists (select 1 from public.alert_recipient r
                    where lower(btrim(r.email)) = lower(au.email::text));

comment on view public.v_alert_email_recipients_internal is
  'Alert recipients for background senders, without the f_role_can caller check. The '
  'auth.users branch excludes any address that has an alert_recipient row AT ALL, '
  'active or not — an inactive row is a deliberate opt-out and outranks the default. '
  'Before 17 Aug 2026 it tested r.active, so deactivating a recipient silently returned '
  'them to the list through this branch. Not granted to anon or authenticated. Agent I.';

revoke all on public.v_alert_email_recipients_internal from anon, authenticated;

/* Same bug, same fix, in the screen's view — otherwise Settings would show a different
   recipient list from the one that actually receives, which is its own kind of lie. */
create or replace view public.v_alert_email_recipients as
select r.role, r.full_name, r.email,
       'alert_recipient'::text as from_where,
       r.is_platform_user
  from public.alert_recipient r
 where r.active
   and coalesce(btrim(r.email), '') <> ''
   and public.f_role_can('admin_settings')
union all
select coalesce(u.role::text, 'member') as role,
       coalesce(u.display_name, au.email::text) as full_name,
       au.email::text as email,
       'auth.users (platform login)'::text as from_where,
       true as is_platform_user
  from auth.users au
  left join public.app_users u on u.user_id = au.id
 where au.email is not null
   and not exists (select 1 from public.alert_recipient r
                    where lower(btrim(r.email)) = lower(au.email::text))
   and public.f_role_can('admin_settings');

comment on view public.v_alert_email_recipients is
  'Recipient list for the SETTINGS SCREEN — gated on f_role_can(''admin_settings''). '
  'Background senders must use v_alert_email_recipients_internal instead: this gate '
  'evaluates the caller and a cron job has none, which emptied the list and stopped '
  'every alert. Both views now treat an inactive alert_recipient row as an opt-out that '
  'outranks the auth.users default. Agent I, 17 Aug 2026.';;
