/* An alert can be recorded, unresolved, AND deliberately not emailed.
 *
 * The owner's 17 Aug instruction is that only sync failures reach email. 887 rows were
 * already queued in alert_outbox when that was set, and tg_send_alert_emails orders by
 * severity then age — so the first send after configuring the provider would have
 * delivered the entire backlog, which is precisely what he asked not to happen.
 *
 * The existing states could not express this. sent_at means delivered, dispatched_at
 * means handed to the provider, resolved_at means the underlying problem is closed.
 * Reusing any of them would have been a lie: these alerts are not delivered, not
 * dispatched, and absolutely not resolved. They are simply not for email.
 *
 * So the state gets its own column, and it carries a reason. A row suppressed without
 * a written why is indistinguishable from one lost.
 */

alter table public.alert_outbox
  add column if not exists email_suppressed_at  timestamptz,
  add column if not exists email_suppressed_why text;

comment on column public.alert_outbox.email_suppressed_at is
  'Set when an alert is deliberately excluded from EMAIL while remaining open in the '
  'platform. Not sent, not dispatched, not resolved — a fourth state, because reusing '
  'any of the other three would misreport what happened. Agent I, 17 Aug 2026.';

comment on column public.alert_outbox.email_suppressed_why is
  'Required in practice by every path that suppresses. A suppressed row with no reason '
  'cannot be told apart from a lost one.';

/* The backlog. Sync digests are exempt — they are the one thing that DOES email. */
update public.alert_outbox
   set email_suppressed_at = now(),
       email_suppressed_why =
         'Owner instruction 17 Aug 2026: only sync failures reach email. This alert was '
         || 'queued before that policy existed and is still open in the platform — it is '
         || 'excluded from the inbox, not from the record. Nothing here has been resolved '
         || 'or deleted.'
 where channel = 'email'
   and sent_at is null
   and dispatched_at is null
   and resolved_at is null
   and email_suppressed_at is null
   and coalesce(source,'') <> 'sync_digest';

/* Teach the sender about the new state. Without this the column would exist and be
   ignored, which is worse than not having it. */
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
  select count(*) into v_addresses from v_alert_email_recipients;

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
      'why', 'Nobody has an email address on file. Add rows to alert_recipient.');
  end if;

  with to_send as (
    select o.id, o.subject, o.body, o.severity, r.email, r.full_name
    from alert_outbox o
    join v_alert_email_recipients r on r.role = o.role
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
  'Hands queued email alerts to the send function. Skips rows with email_suppressed_at '
  'set — recorded and open, but deliberately not emailed per the owner''s 17 Aug 2026 '
  'sync-only policy. Still never stamps sent_at on the strength of having tried.';;
