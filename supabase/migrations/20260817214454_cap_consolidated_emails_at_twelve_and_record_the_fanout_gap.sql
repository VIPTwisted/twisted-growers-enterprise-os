/* Cap consolidated emails at twelve, and record the per-recipient fan-out gap.
 *
 * Owner, 17 Aug 2026: "6 is okay keep under 12 emails."
 *
 * THE FAN-OUT GAP, measured while proving the first send.
 * tg_send_alert_emails joins each outbox ROW to every matching RECIPIENT, so one row
 * with role 'owner' and two owner addresses produces TWO HTTP calls. But the stamping
 * step updates by o.id, so the row keeps ONE send_request_id and one outcome. The
 * other call's result is attached to nothing.
 *
 * That is exactly what happened on the first live send: 6 requests came back 200 for
 * twistedgrowersma@gmail.com and 8 came back 403 for vincent@twistedgrowers.com, whose
 * domain is not yet verified at Resend. The 200s were recorded. The 403s were not
 * attached to any row and would have gone unnoticed — a silent failure inside the
 * machinery built to prevent silent failures.
 *
 * This migration records the cap and the gap. It does not restructure the sender:
 * alert_outbox has one row per (alert, role) and fixing this properly means one row
 * per (alert, recipient), which changes the grain of the table and every reader of it.
 * That is its own piece of work with its own review, not a footnote to a config change.
 * Until then the gap is written down here and tracked, rather than left to be
 * rediscovered by someone wondering why an address stopped receiving.
 */

update public.configurations
   set value = value
     || jsonb_build_object(
          'max_emails_per_run', 12,
          'max_emails_why',
            'Owner, 17 Aug 2026: "6 is okay keep under 12 emails." A consolidated run '
            || 'may produce at most 12 messages. Beyond that, group further rather than '
            || 'truncate — nothing is ever dropped to honour a cap.',
          'known_gap_fanout',
            'tg_send_alert_emails fans one outbox row out to every matching recipient '
            || 'but records only one send_request_id, so a failure to the second address '
            || 'is not attached to any row. Measured 17 Aug 2026: 6x200 to '
            || 'twistedgrowersma@gmail.com recorded, 8x403 to vincent@twistedgrowers.com '
            || 'not recorded. Fixing it means one outbox row per recipient, which changes '
            || 'the grain of the table.',
          'second_address_blocked',
            'vincent@twistedgrowers.com cannot receive until twistedgrowers.com is '
            || 'verified at resend.com/domains. Resend restricts an unverified account to '
            || 'the account holder''s own address. Nothing is wrong with the platform.')
 where key = 'alert_email';

comment on column public.alert_outbox.send_request_id is
  'The pg_net request id for THIS row. Note: the sender fans a row out to every '
  'matching recipient but stores only one id, so a multi-recipient row records only one '
  'outcome. Known gap, recorded in configurations.alert_email.known_gap_fanout on '
  '17 Aug 2026.';;
