# Work order — TG-08 Integrations & Connectors: alert delivery

**Raised 9 August 2026 by Agent A** (Metrc & Document Importer) after measuring the
alert queue while wiring the report-upload nag. **Not Agent A's lane** — Edge Functions
and third-party providers belong to TG-08. Raised, not fixed.

**Every figure below was measured live on 9 Aug 2026. Re-measure before acting;
counts in this project move daily.**

---

```
WORK ORDER — TG-08 INTEGRATIONS & CONNECTORS
SUBJECT: 299 alerts are queued and nothing has ever sent one. 179 are critical.

YOU ARE: TG-08, Integrations & Connectors. You own Edge Functions, third-party
providers and the secrets vault.

RULE ZERO: Never do anything that can break the system. Read-only first. Verify
after every step. If something does not match this brief, STOP and report rather
than improvise — this brief may be hours out of date.

DO NOT TOUCH:
  - App.jsx, budz.jsx, styles.css, rules.css        (Agent B; theme is LOCKED)
  - Any metrc_* table, metrc_rpt_* table, or import function   (Agent A)
  - alert_outbox rows themselves — do not mark anything sent, do not clear the
    queue, do not delete. It is the evidence that delivery has never worked.
  - tg_send_alert_emails() and tg_confirm_alert_emails(). They are CORRECT.
    See below. Changing them is not the fix.

------------------------------------------------------------------ THE PROBLEM

Every guard, watchdog sweep and agent finding on this platform writes its alert
to alert_outbox. 299 sit there unsent, 179 of them critical, 60 added in the
last 24 hours alone. Nobody has ever received one. Rule J3 requires that an
unresolvable guard issue is PUSHED to every admin rather than left in a table
waiting to be noticed — so detection across the whole platform currently
terminates in a table nobody is paged from. Everything Agent A built on 9 Aug
(report-upload nag, backfill convergence, naming guards) also lands here.

------------------------------------------------------------------ EVIDENCE

Measured 9 Aug 2026:

  alert_outbox where sent_at is null ............... 299
    of which severity = 'critical' ................. 179
    added in the last 24 hours ..................... 60
    oldest queued .................................. 7 Aug 2026
    rows with a send_error ......................... 0
    rows ever dispatched (dispatched_at not null) .. 0
    distinct roles targeted ........................ 6

ZERO send errors alongside ZERO sends is the tell. Nothing has ever ATTEMPTED
delivery. This is not a failing sender; it is an absent one.

THE SENDER IS NOT BROKEN — DO NOT "FIX" IT.
tg_send_alert_emails() is well built and honest. It reads configurations where
key = 'alert_email', finds enabled = false, and returns:

    { "ok": true, "dispatched": 0, "queued": 299,
      "state": "email_not_configured", "why": ..., "to_turn_on": ... }

It deliberately does NOT stamp sent_at on a mere attempt — pg_net is async, and
tg_confirm_alert_emails() only sets sent_at when a 2xx actually comes back. That
is correct design and matches the house rule that claiming delivery on the
strength of having tried is the same error as marking a flag fixed.

The real defect is that cron alert-email-send runs HOURLY (45 * * * *) and
returns ok:true with dispatched:0 into a void. Nothing reads the return value,
so an honest "I am not configured" has been shouted 24 times a day for two days
and heard by nobody. That is the false-green pattern one level up.

THE CONFIG ROW ALREADY TELLS YOU WHAT IS MISSING.
select value from configurations where key = 'alert_email';
  enabled ......... false
  provider ........ null
  send_function ... null
  from_address .... null
  to_turn_on ...... "Deploy a send function, then set enabled=true, provider,
                     send_function and from_address on this row. Nothing else
                     needs building - tg_send_alert_emails already routes
                     through it."

CONFIRMED: 25 Edge Functions are deployed and NONE of them sends email.
(metrc-sync, integration-settings, sheet-sync, seed-templates, seed-tables,
clickup-sync, clickup-customize, metrc-probe, metrc-report-import,
metrc-lab-sync, metrc-reference-sync, budz-chat, sheet-push, metrc-documents,
manifest-parse, metrc-catalog-sync, metrc-lab-backfill, metrc-delivery-detail,
coa-extract, report-ingest, document, parse-documents, bridge-queue,
hr-clickup-push, apex-sync.)

ONE BLOCKER HAS PARTLY CLEARED SINCE THE CONFIG NOTE WAS WRITTEN.
The 7 Aug note says "alert_recipient is empty". It is not, as of 9 Aug:
  alert_recipient rows ........................ 2
  v_alert_email_recipients resolved addresses . 2
  employees carrying an email address ......... 29  (from the Metrc MC281714
                                                     Employees export, 9 Aug)
So addresses now EXIST in the building. Two are wired. Rule J3 says all admins,
not two — but WHICH staff receive WHICH alerts is a business decision and is
NOT yours to infer. See "not yours to decide" below.

------------------------------------------------------------------ TASKS

TASK 1 — Deploy an email send function.  [highest value; unblocks everything]
  DO:     Choose a transactional provider (Resend, Postmark, SendGrid — the
          owner has not specified one; if he has no preference, recommend one
          and say why). Put the API key in the SECRETS VAULT / Supabase function
          secrets. NEVER a literal in code — there is already a standing finding
          about a shared x-admin-key literal across 16 functions; do not add to
          it. Deploy an Edge Function that accepts { to, subject, body } and
          returns 2xx only on genuine acceptance by the provider.
  VERIFY: Invoke it once by hand to a single address you control. Confirm a 2xx
          AND that the mail actually arrives. A 2xx from a misconfigured
          provider that silently drops is exactly the failure this platform
          keeps hitting.

TASK 2 — Wire it into the config row. Do not change the sender.
  DO:     update configurations set value = value
            || jsonb_build_object('enabled', true, 'provider', '<name>',
                                  'send_function', '<slug>',
                                  'from_address', '<address>')
          where key = 'alert_email';
  VERIFY: select tg_send_alert_emails(1);   -- limit 1 on purpose
          Expect state to change from 'email_not_configured' to a dispatch.
          Then WAIT for cron alert-email-confirm (50 * * * *) or call
          tg_confirm_alert_emails() and confirm sent_at is set and send_error
          is null. sent_at set with no 2xx behind it means Task 1 is not done.

TASK 3 — Send ONE, not 299.
  DO:     The first live run must be limited. tg_send_alert_emails takes
          p_limit (default 100). Call it with 1. Two days of backlog fired at
          once will land 299 emails — 179 marked critical — in the owner's inbox
          simultaneously and will train him to filter the entire channel on day
          one. Ask the owner how he wants the backlog handled before releasing
          it: send all, send criticals only, digest it, or mark the historic
          ones as superseded.
  VERIFY: exactly one row moves to sent_at, and it is the one you expected.

TASK 4 — Make the silence audible. [this is the actual root cause]
  DO:     Nothing reads tg_send_alert_emails' return value, so it has reported
          "not configured" hourly for two days into nowhere. Record each run's
          returned state somewhere durable and raise a finding when the state is
          anything other than a successful dispatch for N consecutive runs.
          Agent A built backfill_watch on 9 Aug for exactly this shape of
          problem (a job that runs and achieves nothing) — reuse that pattern
          rather than inventing a second one. Ask Agent A before extending it.
  VERIFY: Turn the config off deliberately, run the job, and confirm a finding
          is raised. A guard nobody has watched fail is a guard nobody knows
          works — ship the negative fixture with it.

------------------------------------------------------------------ HOUSE RULES THAT BITE HERE

  E1  Never `drop view ... cascade`. Use `create or replace`.
  E6  Never `grant ... to anon`. A send function must not be anon-callable.
  E5  Any new SECURITY DEFINER function needs `set search_path = public, pg_temp`.
  H2  alert_outbox history is evidence. Do not delete or truncate it.
  A2  Whatever you set on the config row records who set it and when.
  J3  An unresolvable guard issue is PUSHED to every admin, not left in a table.
  J4  Every alert carries who/what/when/where/why/how/solutions/recommendation.
      The bodies already in the queue follow this shape — do not reformat them.
  MIT/Google/Microsoft bar: if it blocks, it ships with positive AND negative
      fixtures. Task 4 is not done without the negative one.

------------------------------------------------------------------ NOT YOURS TO DECIDE — REPORT, DO NOT INFER (A5)

  1. WHICH PROVIDER. Costs money and is the owner's call. Recommend, don't buy.
  2. WHO RECEIVES WHICH ALERTS. 29 staff addresses now exist; 2 are wired. Rule
     J3 says all admins. Mapping a person to a severity or a department is a
     business decision. Do NOT populate alert_recipient from the employee list
     on your own initiative — a Metrc agent badge is not consent to be paged.
  3. WHAT TO DO WITH THE 299-DEEP BACKLOG. See Task 3.
  4. WHETHER STAFF WITHOUT PLATFORM ACCOUNTS SHOULD BE EMAILED AT ALL. There
     are 29 employees and 2 app_users.

------------------------------------------------------------------ REPORT BACK

State plainly:
  - What changed, with the exact SQL or function slug.
  - What you VERIFIED and how — say "confirmed" only for what you measured, and
    "assessed" for judgement. An email you did not watch arrive is not delivered.
  - What you did NOT touch and why.
  - Anything you found belonging to another lane — hand it on, do not fix it.
  - Anything in this brief that was already stale when you read it. Three of the
    five items in the list this came from were stale; assume this one may be too.
```

---

## Provenance

| | |
|---|---|
| Raised by | Agent A, 9 Aug 2026 |
| Raised to | TG-08 Integrations & Connectors |
| Why not Agent A | Edge Functions and third-party providers are outside the Metrc import lane |
| Evidence | `alert_outbox`, `configurations.alert_email`, `list_edge_functions`, `alert_recipient`, `v_alert_email_recipients`, `employees` |
| Related | Rule J3 (push to every admin) · Rule J4 (alert shape) · `backfill_watch` pattern for Task 4 |

**Correction on the record:** this was handed to Agent A as *"76 alerts queued, no email
provider."* The count was **299**, not 76 — nearly four times larger — and the queue had
grown 60 in the preceding 24 hours. The framing "detection works, delivery is zero" was
correct. The sender being *broken* was not: it is correctly built and correctly reports
that it is unconfigured.
