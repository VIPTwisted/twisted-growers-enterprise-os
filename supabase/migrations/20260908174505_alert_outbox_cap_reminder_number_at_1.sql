-- GROK-WHY: Owner standing order 8 Sep: cap reminder_number at 1. Timed clones rebuilt the 1,634 pile (119 unsent unsuppressed, 21 distinct problems this hour).
-- tg_raise_item_alerts was inserting a new outbox row every remind_every_days while the flag stayed open. That is a denial of service, not an escalation.
-- Cap: only insert when no unresolved row exists for that tuple (last_open_alert is null). Genuine reopen after resolve still inserts.
-- Escalate-to-another-role insert is unchanged (those are reminder_number=1 on a different role).
-- Existing unsent clones reminder_number>1 are suppressed, not deleted. Ledger not rewritten. No trigger disabled. leftover_grok 0. room_cycle_days 56.
-- D (orphan_tag) stays open as a distinct problem. CERTIFIED 0.

insert into public.os_change_log (by_agent, action, object_kind, object_key, old_definition, new_definition, why, restore_how, ticket)
select
  'grok-ceo',
  'sql',
  'function',
  'tg_raise_item_alerts',
  'insert reminder when last_open_alert older than remind_every_days',
  'insert only when last_open_alert is null; suppress unsent reminder_number>1',
  'Cap reminder_number at 1. Timed clones were the 1,634 pile. Rows kept. Distinct problems stay open. Dual MATCH not claimed.',
  'restore prior tg_raise_item_alerts body from schema_migrations prior version; update alert_outbox set email_suppressed_at = null where email_suppressed_why = ''clone reminder_number>1; cap at 1; 8 Sep 2026 hour; rows kept'';',
  'alert-cap-reminder-1-20260908'
where not exists (
  select 1 from public.os_change_log where ticket = 'alert-cap-reminder-1-20260908'
);

CREATE OR REPLACE FUNCTION public.tg_raise_item_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_resolved int; v_new int; v_escalated int;
begin
  with gone as (
    update alert_outbox o set resolved_at = now(),
           resolved_note = 'The flag is no longer open.'
    where o.resolved_at is null
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

update public.alert_outbox
   set email_suppressed_at = now(),
       email_suppressed_why = 'clone reminder_number>1; cap at 1; 8 Sep 2026 hour; rows kept'
 where sent_at is null
   and email_suppressed_at is null
   and resolved_at is null
   and reminder_number > 1;
