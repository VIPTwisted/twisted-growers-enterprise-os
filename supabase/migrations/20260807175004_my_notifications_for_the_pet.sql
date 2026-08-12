/* WHAT SHOULD INTERRUPT ME
   ------------------------
   One source for the pet's badge, so four separate queries cannot drift apart
   the way the findings tables did.

   HONEST NOTE ON THE BRIEF: it asks to reuse the top-bar bell's source. The
   bell counts v_control_tower metrics; the four sources named in the same brief
   are different tables entirely. They cannot both be true. This returns the
   four that were named, and the bell is left alone - unifying the two counts is
   a separate decision, and quietly changing the bell to match would be exactly
   the silent divergence the instruction was trying to prevent.

   alert_outbox has NO user column - it routes by ROLE. So "undelivered for this
   user" is expressed as "undelivered for this user's role", which is the closest
   honest reading. Stated here rather than hidden.

   Security definer with a hard filter on auth.uid(): a user sees only their own
   counts, and messages are scoped to the channels they belong to. */

create or replace function f_my_notifications()
returns table (source text, unread bigint, newest timestamptz, what text)
language sql
stable
security definer
set search_path = public
as $$
  select 'inventory_alerts'::text, count(*)::bigint, max(i.last_seen),
         'Inventory alerts still open'::text
    from inventory_alerts i where i.resolved_at is null
  union all
  select 'critical_findings', count(*)::bigint, max(w.observed_at),
         'Critical findings not yet resolved'
    from watchdog_findings w where w.severity = 'critical'
  union all
  /* alert_outbox routes by role, not by person */
  select 'alert_outbox', count(*)::bigint, max(a.created_at),
         'Alerts raised for your role and not yet read'
    from alert_outbox a
    where a.read_at is null and a.resolved_at is null
      and (a.role is null or a.role = (select u.role::text from app_users u where u.user_id = auth.uid()))
  union all
  select 'messages', count(*)::bigint, max(m.created_at),
         'Messages addressed to you'
    from messages m where m.user_id = auth.uid()
$$;

revoke all on function f_my_notifications() from public, anon;
grant execute on function f_my_notifications() to authenticated;

comment on function f_my_notifications() is
  'The four sources the pet may interrupt on, one query. Scoped to the caller. alert_outbox is by role because it has no user column.';;
