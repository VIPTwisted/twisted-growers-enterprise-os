/* Enforce sync-only email at the route, not after the fact.
 *
 * Owner, 17 Aug 2026: email only when there is an issue with syncing.
 *
 * Suppressing alerts after they are queued is cleanup, and cleanup that has to run
 * every hour forever is a design that leaks. tg_raise_item_alerts writes new email rows
 * at :40 every hour for any route with notify_email, so the policy has to be applied
 * where the alert is BORN or it is re-broken hourly. Two such rows appeared within
 * three minutes of the policy being set, both for the cfo, neither a sync failure.
 *
 * FIVE routes carried notify_email and none of them is about syncing:
 *   ceo / (any) / critical, cfo / metrc_corrections / elevated,
 *   executive / (any) / critical, manager / (any) / critical, owner / (any) / critical
 *
 * notify_in_app stays TRUE on every one. Nothing stops being raised, nothing stops
 * being visible, nothing is deleted. Only the interruption changes.
 *
 * REVERSIBLE ON PURPOSE. The prior value is written into each row's why, so restoring
 * it is a matter of reading the row rather than reading this migration.
 */

update public.item_alert_route
   set notify_email = false,
       why = coalesce(why || ' | ', '')
             || 'notify_email was TRUE until 17 Aug 2026, turned off under the owner''s '
             || 'sync-only email policy. notify_in_app remains true — this alert is '
             || 'still raised, still visible and still escalates. Restore by setting '
             || 'notify_email back to true on this row.'
 where notify_email;

/* The two rows the hourly job had already produced under the old routes. Suppressed
   from email, left open in the platform, with the reason on the row. */
update public.alert_outbox
   set email_suppressed_at = now(),
       email_suppressed_why =
         'Raised by tg_raise_item_alerts at 21:40 on 17 Aug 2026, minutes before the '
         || 'sync-only email policy was applied at the route. Not a sync failure, so it '
         || 'does not email. Still open in the platform.'
 where channel = 'email'
   and sent_at is null and dispatched_at is null
   and resolved_at is null and email_suppressed_at is null
   and coalesce(source,'') not in ('sync_digest','backlog_digest');

comment on column public.item_alert_route.notify_email is
  'Whether this route emails. All routes were set false on 17 Aug 2026 under the '
  'owner''s sync-only email policy — only sync failures reach an inbox, hourly, '
  '07:00-18:00. notify_in_app is unaffected. Each row''s why records its prior value.';;
