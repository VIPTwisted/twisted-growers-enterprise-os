/* tg_raise_item_alerts was closing every OTHER producer's alerts.
 *
 * Its opening statement resolved any alert_outbox row with no matching v_item_flags
 * entry. It assumed it owned the whole outbox. It does not: watchdog findings (source
 * 'guard'), feed alerts, sync digests and backlog digests all write there too, and
 * none of them has an item-flag row. Every one was closed within the hour with the
 * note "The flag is no longer open." — a sentence that was simply not true of them.
 *
 * THE TIMING MADE IT TOTAL. cron runs this at :40 and tg_send_alert_emails at :45.
 * Alerts were therefore resolved five minutes before the sender looked, every hour,
 * forever. Nothing from any other producer could ever be emailed. This is the third
 * independent break in the same chain, after f_alert_all_admins omitting days_open and
 * the recipient view being gated on a caller permission a cron job cannot satisfy.
 * Any one of the three alone was enough to deliver nothing.
 *
 * MEASURED 17 Aug 2026, by producer, share closed with that note:
 *   guard             8 of 8    100%   (the harvest-cycle findings raised that morning)
 *   backlog_digest    6 of 6    100%
 *   sync_digest       2 of 2    100%
 *   metrc_corrections 72 of 512  14%   (legitimate — these ARE item flags)
 *   v_potency_vs_coa   9 of 185   5%   (legitimate)
 *
 * THE FIX SCOPES THE RESOLVER TO WHAT IT OWNS.
 * It may now only close a row whose source is one the item-flag system actually
 * produces. If a source disappears from v_item_flags entirely its alerts stay OPEN
 * rather than being silently closed — that is the safe direction to fail. An alert
 * left open is a nuisance; an alert closed without anyone deciding is a lie.
 */

create or replace function public.tg_raise_item_alerts()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_resolved int; v_new int; v_escalated int;
begin
  with gone as (
    update alert_outbox o set resolved_at = now(),
           resolved_note = 'The flag is no longer open.'
    where o.resolved_at is null
      /* OWN WHAT YOU RAISED, NOTHING ELSE. Without this line every watchdog finding,
         feed alert and digest in the outbox is closed by this job within the hour. */
      and exists (select 1 from v_item_flags f2 where f2.source = o.source)
      and not exists (select 1 from v_item_flags f
                      where f.entity_type = o.entity_type and f.entity_key = o.entity_key
                        and f.source = o.source and f.source_ref = o.source_ref)
    returning 1)
  select count(*) into v_resolved from gone;

  with matched as (
    select distinct on (f.entity_type, f.entity_key, f.source, f.source_ref, r.role, c.channel)
           f.entity_type, f.entity_key, f.source, f.source_ref, f.severity,
           f.headline, f.detail, f.why, f.what_to_do, f.raised_on,
           r.role, r.remind_every_days, c.channel,
           (current_date - f.raised_on) as days_open
    from v_item_flags f
    join item_alert_route r
      on r.active
     and f_severity_rank(f.severity) <= f_severity_rank(r.severity)
     and (r.source is null or r.source = f.source)
    cross join lateral (values ('in_app', r.notify_in_app), ('email', r.notify_email)) c(channel, enabled)
    where c.enabled
    order by f.entity_type, f.entity_key, f.source, f.source_ref, r.role, c.channel,
             (r.source is null), f_severity_rank(r.severity), r.remind_every_days
  ), candidate as (
    select m.*,
           (select max(o.created_at) from alert_outbox o
             where o.entity_type=m.entity_type and o.entity_key=m.entity_key
               and o.source=m.source and o.source_ref=m.source_ref
               and o.role=m.role and o.channel=m.channel and o.resolved_at is null) as last_open_alert,
           (select count(*) from alert_outbox o
             where o.entity_type=m.entity_type and o.entity_key=m.entity_key
               and o.source=m.source and o.source_ref=m.source_ref
               and o.role=m.role and o.channel=m.channel) as sent_before
    from matched m
  ), inserted as (
    insert into alert_outbox (entity_type, entity_key, source, source_ref, severity, role,
                              channel, reminder_number, subject, body, raised_on, days_open)
    select d.entity_type, d.entity_key, d.source, d.source_ref, d.severity, d.role,
           d.channel, d.sent_before + 1,
           case when d.sent_before = 0 then upper(d.severity) || ': ' || d.headline
                when d.days_open = 0   then 'REOPENED: ' || d.headline
                else 'STILL OPEN (' || (d.sent_before + 1) || ' reminders, '
                     || d.days_open || ' days): ' || d.headline end,
           d.headline || E'\n\n' || d.detail
             || E'\n\nWhy it matters: ' || d.why
             || E'\n\nWhat to do: ' || d.what_to_do
             || E'\n\nItem: ' || d.entity_type || ' ' || d.entity_key
             || '   Raised: ' || d.raised_on || ' (' || d.days_open || ' days open)'
             || E'\nThis will keep coming back until someone records a decision - fix it, or say why not.',
           d.raised_on, d.days_open
    from candidate d
    where d.last_open_alert is null
       or d.last_open_alert < now() - make_interval(days => d.remind_every_days)
    returning 1)
  select count(*) into v_new from inserted;

  with esc as (
    insert into alert_outbox (entity_type, entity_key, source, source_ref, severity, role,
                              channel, escalated_from, reminder_number, subject, body,
                              raised_on, days_open)
    select distinct on (f.entity_type, f.entity_key, f.source, f.source_ref, r.escalate_to)
           f.entity_type, f.entity_key, f.source, f.source_ref, f.severity, r.escalate_to,
           'in_app', r.role, 1,
           'ESCALATED after ' || (current_date - f.raised_on) || ' days: ' || f.headline,
           'This was raised with ' || r.role || ' ' || (current_date - f.raised_on)
             || ' days ago and is still open.' || E'\n\n' || f.detail
             || E'\n\nWhat to do: ' || f.what_to_do
             || E'\n\nItem: ' || f.entity_type || ' ' || f.entity_key,
           f.raised_on, current_date - f.raised_on
    from v_item_flags f
    join item_alert_route r
      on r.active and f_severity_rank(f.severity) <= f_severity_rank(r.severity)
     and (r.source is null or r.source = f.source)
     and r.escalate_after_days is not null and r.escalate_to is not null
    where (current_date - f.raised_on) >= r.escalate_after_days
      and not exists (select 1 from alert_outbox o
                      where o.entity_type=f.entity_type and o.entity_key=f.entity_key
                        and o.source=f.source and o.source_ref=f.source_ref
                        and o.role=r.escalate_to and o.escalated_from = r.role
                        and o.resolved_at is null)
    returning 1)
  select count(*) into v_escalated from esc;

  return jsonb_build_object('ok', true, 'resolved', v_resolved,
                            'raised_or_reminded', v_new, 'escalated', v_escalated);
end $function$;

comment on function public.tg_raise_item_alerts() is
  'Raises, reminds and escalates item flags. Fixed 17 Aug 2026: its resolver closed '
  'EVERY unresolved alert_outbox row with no v_item_flags match, including watchdog '
  'findings, feed alerts and digests it did not raise — and it runs at :40, five '
  'minutes before the :45 sender, so nothing from another producer could ever be '
  'emailed. It may now only close rows whose source the item-flag system actually '
  'produces. Agent I.';

/* Reopen what it closed that was never its to close. These are genuinely open. */
update public.alert_outbox
   set resolved_at = null,
       resolved_note = null
 where resolved_note = 'The flag is no longer open.'
   and not exists (select 1 from v_item_flags f where f.source = alert_outbox.source);;
