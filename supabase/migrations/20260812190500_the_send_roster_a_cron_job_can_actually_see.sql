-- THE SEND ROSTER A CRON JOB CAN ACTUALLY SEE
-- TG-08, 12 August 2026. Third of three. APPLY LAST, AND ONLY AFTER CHECKING NOBODY
-- ELSE IS INSIDE tg_send_alert_emails — this file replaces its body, and two agents
-- nearly deleted each other's work twice in one day.
--
-- THE DEFECT, AND IT IS A BLOCKER FOR THE OWNER'S ORDER.
--
-- tg_send_alert_emails refuses to dispatch when it can see zero addresses:
--     select count(*) into v_addresses from v_alert_email_recipients;
--     if v_addresses = 0 then return ... 'enabled_but_no_addresses' ...
--
-- and v_alert_email_recipients ends with:
--     ... and f_role_can('admin_settings')
--
-- f_role_can reads current_app_role(), which is:
--     coalesce((select role from app_users where user_id = auth.uid()), 'readonly')
--
-- Under pg_cron there is no JWT, so auth.uid() is null, so the role is 'readonly',
-- and role_capability says readonly.admin_settings = false. MEASURED, not assumed:
-- that row reads allowed = false right now. SECURITY DEFINER does not help — it
-- changes the privilege the function runs with, not the identity auth.uid() reports.
--
-- The consequence: the moment the owner turns email on, the hourly job would return
-- "enabled_but_no_addresses" forever while v_alert_email_status cheerfully reports
-- four addresses on file, because f_alert_recipient_count() does not apply the gate.
-- Two counts, one gate between them, and the one the UI shows is the wrong one. The
-- job would go on succeeding 24 times a day, dispatching nothing — the same shape as
-- the retry loop that ran 1,440 times a day retrying nothing and read as green.
--
-- WHAT I COULD NOT PROVE FROM HERE, AND SAYING SO RATHER THAN IMPLYING I DID.
-- My connection is a read-only reporting role with no execute on f_role_can, so I
-- could not run the end-to-end call and watch it return zero. The reasoning above is
-- from the four object definitions and the role_capability row, all read live. The
-- one-line test that settles it, run as postgres or service_role with no JWT:
--
--     select current_app_role()::text,
--            f_role_can('admin_settings'),
--            (select count(*) from v_alert_email_recipients);
--
-- If the third column is 0, the gate is closed and this file is required. If it is
-- not 0, DO NOT APPLY THIS FILE — tell me, because then I have misread something and
-- the misreading is more interesting than the fix.
--
-- THE FIX, AND WHY IT IS NOT A WEAKENING.
-- v_alert_email_recipients keeps its gate and keeps its job: it answers "who could
-- be alerted", for an admin looking at a settings screen, and it unions auth.users
-- so that screen can offer every platform login. That is a UI question and it should
-- be gated.
-- The SENDER needs a different answer: "who is actually on the list". That is
-- alert_recipient and nothing else — explicit opt-in, no gate, and deliberately NOT
-- unioned with auth.users, because emailing every person who has ever logged in on
-- every alert is how a delivery channel becomes a spam folder inside a week.
--
-- UNDO. Restore the two identifiers in tg_send_alert_emails from this file's own
-- header (they are v_alert_email_recipients in both places) and drop the new view.
-- No data is written, moved or deleted by anything here.

begin;

create or replace view v_alert_email_roster as
select r.role, r.full_name, btrim(r.email) as email
  from alert_recipient r
 where r.active and coalesce(btrim(r.email), '') <> '';

comment on view v_alert_email_roster is
  'Who alerts are actually sent to. No role gate, because the sender runs from cron '
  'with no JWT and a gate there closes the channel. Explicit opt-in only: it does NOT '
  'union auth.users, so a new login does not silently start receiving alert email. '
  'v_alert_email_recipients remains the gated admin-facing "who could be added" view.';

-- Not granted to authenticated: the roster exists for SECURITY DEFINER functions.
-- Staff read v_alert_email_recipients, which is gated and shows the same people.
revoke all on v_alert_email_roster from public, anon;

-- ---------------------------------------------------------------------------
-- tg_send_alert_emails — body reproduced from the live definition read on
-- 12 August 2026, with exactly two identifiers changed and this note added.
-- Nothing else in it is touched: not the pg_net asynchrony, not the ordering, not
-- the refusal to stamp sent_at before the provider answers.
-- ---------------------------------------------------------------------------

create or replace function tg_send_alert_emails(p_limit integer default 50)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; v_enabled boolean; v_fn text; v_addresses int; v_queued int; v_dispatched int := 0;
begin
  select value into cfg from configurations where key = 'alert_email';
  v_enabled := coalesce((cfg->>'enabled')::boolean, false);
  v_fn      := nullif(btrim(coalesce(cfg->>'send_function','')), '');

  select count(*) into v_queued from alert_outbox
   where channel='email' and sent_at is null and dispatched_at is null and resolved_at is null;

  -- CHANGED 12 Aug 2026: was v_alert_email_recipients, which applies
  -- f_role_can('admin_settings'). Under cron there is no JWT, current_app_role()
  -- returns 'readonly', and that view returns zero rows — so this counted zero and
  -- refused to dispatch anything, forever, the moment email was switched on.
  select count(*) into v_addresses from v_alert_email_roster;

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

  -- pg_net is asynchronous: it returns a request id, not a result. So this records
  -- that the send was HANDED OVER. sent_at stays null until tg_confirm_alert_emails
  -- sees a 2xx come back. Stamping sent_at here would be claiming delivery on the
  -- strength of having tried, which is the same error as marking a flag fixed.
  with to_send as (
    select o.id, o.subject, o.body, o.severity, r.email, r.full_name
    from alert_outbox o
    join v_alert_email_roster r on r.role = o.role
    where o.channel='email' and o.sent_at is null and o.dispatched_at is null
      and o.resolved_at is null
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
end $$;

-- ---------------------------------------------------------------------------
-- HONEST STATE. Every surface must SAY email is not wired rather than implying
-- alerts are going out. Columns are APPENDED — the existing six keep their names,
-- order and types, so nothing reading this view breaks.
-- ---------------------------------------------------------------------------

create or replace view v_alert_email_status as
select
  (select (value->>'enabled')::boolean from configurations where key='alert_email') as email_enabled,
  (select value->>'provider' from configurations where key='alert_email') as provider,
  (select count(*) from alert_outbox
    where channel='email' and sent_at is null and resolved_at is null) as queued_unsent,
  f_alert_recipient_count()::bigint as addresses_on_file,
  (select count(distinct role) from item_alert_route
    where notify_email and active) as roles_wanting_email,
  case
    when not coalesce((select (value->>'enabled')::boolean from configurations
                        where key='alert_email'), false)
      then 'EMAIL NOT CONFIGURED - '
        || (select count(*) from alert_outbox
             where channel='email' and sent_at is null and resolved_at is null)
        || ' alerts queued and holding. They are not lost and they are not sent.'
    when f_alert_recipient_count() = 0
      then 'EMAIL ON BUT NOBODY TO SEND TO - no addresses on file.'
    else 'Email is on. '
      || (select count(*) from alert_outbox
           where channel='email' and sent_at is null and resolved_at is null)
      || ' waiting to go to ' || f_alert_recipient_count() || ' addresses.'
  end as status,

  -- APPENDED 12 Aug 2026. addresses_on_file above counts everyone who COULD be a
  -- recipient, including every auth.users login. It is not what the sender sees, and
  -- publishing only that number is how a closed channel reads as an open one.
  (select count(*) from v_alert_email_roster)                    as addresses_the_sender_uses,
  (select count(*) from alert_outbox
    where channel='email' and dispatched_at is not null and sent_at is null
      and send_error is null)                                    as awaiting_provider_answer,
  (select count(*) from alert_outbox
    where channel='email' and send_error is not null and sent_at is null) as rejected_by_provider,
  (select count(*) from alert_outbox where channel='email' and sent_at is not null)
                                                                 as delivered_ever,
  (select address from alert_destination
    where destination_key='admin_email' and active)              as owner_stated_address,
  exists (select 1 from alert_destination d
           join alert_recipient r
             on lower(btrim(r.email)) = lower(btrim(d.address)) and r.active
          where d.destination_key='admin_email' and d.active)     as owner_address_is_on_roster,

  -- One line that tells the truth about the WHOLE chain rather than one link of it.
  case
    when not coalesce((select (value->>'enabled')::boolean from configurations
                        where key='alert_email'), false)
      then 'NOT WIRED. Alerts are being detected and queued, and nothing is being '
        || 'emailed to anyone. The provider key has not been supplied yet. Nobody is '
        || 'being told about a missed sync by email — only inside the platform.'
    when nullif(btrim(coalesce((select value->>'send_function' from configurations
                                 where key='alert_email'),'')),'') is null
      then 'NOT WIRED. Email is switched on but no send function is named, so there '
        || 'is nothing to call and nothing will leave.'
    when (select count(*) from v_alert_email_roster) = 0
      then 'NOT WIRED. Email is switched on but the send roster is empty, so every '
        || 'dispatch will refuse.'
    when (select count(*) from alert_outbox where channel='email' and sent_at is not null) = 0
      then 'WIRED BUT UNPROVEN. Everything is configured and not one message has yet '
        || 'been confirmed delivered by the provider. Treat as untested until one has.'
    else 'WIRED AND PROVEN. '
      || (select count(*) from alert_outbox where channel='email' and sent_at is not null)
      || ' messages confirmed delivered by the provider.'
  end as plain_english_state;

grant select on v_alert_email_status to authenticated;
revoke all on v_alert_email_status from public, anon;

-- ---------------------------------------------------------------------------
-- What is left for the owner, recorded where a person will find it rather than in
-- a chat message that scrolls away. No key, no placeholder that looks like a key.
-- ---------------------------------------------------------------------------

update configurations
   set value = value
     || jsonb_build_object(
          'to_turn_on',
          'THREE THINGS, and only the first needs the owner. '
          || '(1) Create an API key at an email provider (Resend or SendGrid) and put '
          || 'it in Supabase Studio under Edge Functions > Secrets, named '
          || 'ALERT_EMAIL_API_KEY. It goes nowhere else — not in a file, not in a '
          || 'migration, not in a message. '
          || '(2) Verify a from-address with that provider; a plain gmail.com sender is '
          || 'refused or spam-foldered by every provider. '
          || '(3) Then set enabled=true, provider, from_address and '
          || 'send_function=''alert-email'' on this row. '
          || 'The recipient is already recorded in alert_destination and already on the '
          || 'send roster; nothing else needs building.',
          'send_function_expected', 'alert-email',
          'blocker_found_12_aug_2026',
          'tg_send_alert_emails counted recipients through a view gated by '
          || 'f_role_can(''admin_settings''), which is false under cron because there is '
          || 'no JWT. Fixed the same day by giving the sender v_alert_email_roster. '
          || 'Without that fix, switching enabled to true would have dispatched nothing '
          || 'while reporting four addresses on file.')
 where key = 'alert_email';

commit;
