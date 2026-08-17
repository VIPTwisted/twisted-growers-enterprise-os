/* A UI permission check was deciding who the system may email.
 *
 * v_alert_email_recipients ends with `AND f_role_can('admin_settings')`. That is a
 * CALLER-CONTEXT check: it asks whether the person running the query is allowed to see
 * the recipient list. Correct for a settings screen. Fatal inside a view that a
 * BACKGROUND JOB must read.
 *
 * tg_send_alert_emails runs from cron through pg_net. There is no authenticated user,
 * so auth.uid() is null, so f_role_can returns false, so the view returns zero rows,
 * so the sender reports "Nobody has an email address on file" — while alert_recipient
 * holds two active addresses and the owner is looking at both of them on screen.
 *
 * MEASURED 17 Aug 2026, in the background context the job actually runs in:
 *   auth.uid()                     null
 *   f_role_can('admin_settings')   false
 *   v_alert_email_recipients       0 rows
 *   alert_recipient (active,email) 2 rows
 *
 * This is the SECOND independent reason no alert has ever left the building, after
 * f_alert_all_admins omitting alert_outbox.days_open. Both had to be fixed; either one
 * alone still delivered nothing. Neither announced itself, because "no recipients" and
 * "queued successfully" are both things a quiet system says.
 *
 * THE FIX IS A SPLIT, NOT A RELAXATION.
 * The gate is not removed — it still guards the screen, which is what it was for. The
 * sender gets its own view with no caller check, granted to no login role and reachable
 * only from SECURITY DEFINER code. Dropping the gate from the original view would have
 * exposed staff addresses to anyone who could reach PostgREST.
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
   and not exists (select 1 from public.alert_recipient r
                    where lower(btrim(r.email)) = lower(au.email::text) and r.active);

comment on view public.v_alert_email_recipients_internal is
  'Alert recipients WITHOUT the f_role_can caller check, for background senders that '
  'have no authenticated user. The gated view v_alert_email_recipients remains the one '
  'the settings screen reads. Created 17 Aug 2026 after the gate was measured returning '
  'false under cron, emptying the recipient list and making the sender report "nobody '
  'has an email address" while two were on file. NOT granted to anon or authenticated — '
  'reachable only from SECURITY DEFINER code. Agent I.';

/* Deliberately no grant to anon or authenticated. The UI keeps the gated view. */
revoke all on public.v_alert_email_recipients_internal from anon, authenticated;

create or replace function public.tg_send_alert_emails(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare cfg jsonb; v_enabled boolean; v_fn text; v_addresses int; v_queued int; v_dispatched int := 0;
begin
  select value into cfg from configurations where key = 'alert_email';
  v_enabled := coalesce((cfg->>'enabled')::boolean, false);
  v_fn      := nullif(btrim(coalesce(cfg->>'send_function','')), '');

  select count(*) into v_queued from alert_outbox
   where channel='email' and sent_at is null and dispatched_at is null
     and resolved_at is null and email_suppressed_at is null;

  /* The INTERNAL view. Reading the gated one here is the bug this migration fixes. */
  select count(*) into v_addresses from v_alert_email_recipients_internal;

  if not v_enabled then
    return jsonb_build_object('ok', true, 'dispatched', 0, 'queued', v_queued,
      'state', 'email_not_configured', 'why', cfg->>'why_off', 'to_turn_on', cfg->>'to_turn_on');
  end if;
  if v_fn is null then
    return jsonb_build_object('ok', false, 'dispatched', 0, 'queued', v_queued,
      'state', 'enabled_but_no_send_function',
      'why', 'alert_email.enabled is true but send_function is not set, so there is nothing to call.');
  end if;
  if v_addresses = 0 then
    return jsonb_build_object('ok', false, 'dispatched', 0, 'queued', v_queued,
      'state', 'enabled_but_no_addresses',
      'why', 'No active recipient has an email address. Add rows to alert_recipient.');
  end if;

  with to_send as (
    select o.id, o.subject, o.body, o.severity, r.email, r.full_name
    from alert_outbox o
    join v_alert_email_recipients_internal r on r.role = o.role
    where o.channel='email' and o.sent_at is null and o.dispatched_at is null
      and o.resolved_at is null and o.email_suppressed_at is null
    order by case o.severity when 'critical' then 1 when 'elevated' then 2 else 3 end, o.created_at
    limit p_limit
  ), called as (
    select t.id, tg_call_function(v_fn, jsonb_build_object(
             'to', t.email, 'name', t.full_name, 'subject', t.subject,
             'body', t.body, 'severity', t.severity)) as request_id
    from to_send t
  ), stamped as (
    update alert_outbox o
       set dispatched_at = now(), send_request_id = c.request_id
      from called c where c.id = o.id
      returning 1)
  select count(*) into v_dispatched from stamped;

  return jsonb_build_object('ok', true, 'dispatched', v_dispatched,
    'queued_before', v_queued, 'addresses', v_addresses,
    'state', 'dispatched - not yet confirmed delivered',
    'next', 'tg_confirm_alert_emails() marks them sent only when the provider answers 2xx.');
end $function$;

comment on function public.tg_send_alert_emails(integer) is
  'Hands queued email alerts to the send function. Reads '
  'v_alert_email_recipients_internal, NOT the role-gated view — the gate evaluates the '
  'caller, and a cron job has no caller, which silently emptied the recipient list. '
  'Skips rows with email_suppressed_at set. Never stamps sent_at on the strength of '
  'having tried. Agent I, 17 Aug 2026.';;
