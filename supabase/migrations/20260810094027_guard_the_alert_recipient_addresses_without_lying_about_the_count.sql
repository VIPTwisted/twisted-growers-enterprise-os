-- v_alert_email_recipients reads auth.users and hands every signed-in user every platform
-- login's email address. anon cannot reach it, so there is no external exposure — but 15 staff
-- accounts are due to be created, and at that point it becomes every employee's address visible
-- to every employee.
--
-- WHY security_invoker IS THE WRONG TOOL HERE, unlike the 79 views flipped earlier today. The
-- role `authenticated` holds no grant on auth.users at all. Switching this view to the caller's
-- rights makes it raise "permission denied for table users" rather than return nothing — an error
-- on the alerts page instead of a quiet empty list, and v_alert_email_status would fail with it.
-- A view that legitimately needs elevated reach must keep it and authorise itself instead.
--
-- THE TRAP THIS WOULD HAVE WALKED INTO, and it is the third time today. v_alert_email_status
-- computes `addresses_on_file` as a count over this view. Guard the view alone and a non-admin
-- reading the status page sees zero addresses and the message
-- "EMAIL ON BUT NOBODY TO SEND TO - no addresses on file."
-- That is the same defect as v_pay_rate_confidence reporting "Every rate has been approved" once
-- it could no longer see the rates, and the same defect as the RLS-no-policy finding calling three
-- sealed tables a fault. Not-allowed-to-see is being rendered as nothing-there — and here it would
-- read as an operational all-clear on the alert pipeline, which is exactly where a false all-clear
-- does damage: 134 alerts are already queued and unable to reach anyone.
--
-- So the count and the addresses are separated. A count is not a disclosure; the addresses are.
-- f_alert_recipient_count() runs elevated and returns only the number, so the status stays true
-- for everyone while the list itself becomes admin-only.
create or replace function public.f_alert_recipient_count()
returns integer
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select (select count(*) from alert_recipient r
           where r.active and coalesce(btrim(r.email), '') <> '')
       + (select count(*) from auth.users au
           where au.email is not null
             and not exists (select 1 from alert_recipient r
                              where lower(btrim(r.email)) = lower(au.email::text) and r.active));
$fn$;

comment on function public.f_alert_recipient_count() is
  'How many addresses alerts can reach. Elevated so the figure is true for every caller, while '
  'the addresses themselves stay admin-only in v_alert_email_recipients. Split out because '
  'guarding the list alone made the status page report "nobody to send to" to anyone who was '
  'merely not cleared to see the list.';

-- The addresses: admin-only, via the one capability resolver. Column list and order unchanged.
create or replace view public.v_alert_email_recipients as
 SELECT r.role,
    r.full_name,
    r.email,
    'alert_recipient'::text AS from_where,
    r.is_platform_user
   FROM alert_recipient r
  WHERE r.active AND COALESCE(btrim(r.email), ''::text) <> ''::text
    AND public.f_role_can('admin_settings')
UNION ALL
 SELECT COALESCE(u.role::text, 'member'::text) AS role,
    COALESCE(u.display_name, au.email::text) AS full_name,
    au.email::text AS email,
    'auth.users (platform login)'::text AS from_where,
    true AS is_platform_user
   FROM auth.users au
     LEFT JOIN app_users u ON u.user_id = au.id
  WHERE au.email IS NOT NULL
    AND NOT (EXISTS ( SELECT 1 FROM alert_recipient r
          WHERE lower(btrim(r.email)) = lower(au.email::text) AND r.active))
    AND public.f_role_can('admin_settings');

comment on view public.v_alert_email_recipients is
  'Email addresses alerts are sent to, including platform logins from auth.users. Returns nothing '
  'unless the caller holds admin_settings. Runs as owner deliberately: authenticated has no grant '
  'on auth.users, so security_invoker would raise permission denied rather than return empty.';

-- The status: now counts through the elevated function, so it tells the truth to everyone.
create or replace view public.v_alert_email_status as
 SELECT (SELECT (configurations.value ->> 'enabled')::boolean FROM configurations
          WHERE configurations.key = 'alert_email')                        AS email_enabled,
    (SELECT configurations.value ->> 'provider' FROM configurations
      WHERE configurations.key = 'alert_email')                            AS provider,
    (SELECT count(*) FROM alert_outbox
      WHERE alert_outbox.channel = 'email' AND alert_outbox.sent_at IS NULL
        AND alert_outbox.resolved_at IS NULL)                              AS queued_unsent,
    public.f_alert_recipient_count()::bigint                               AS addresses_on_file,
    (SELECT count(DISTINCT item_alert_route.role) FROM item_alert_route
      WHERE item_alert_route.notify_email AND item_alert_route.active)      AS roles_wanting_email,
        CASE
            WHEN NOT COALESCE((SELECT (configurations.value ->> 'enabled')::boolean
                                 FROM configurations WHERE configurations.key = 'alert_email'), false)
              THEN 'EMAIL NOT CONFIGURED - ' || (SELECT count(*) FROM alert_outbox
                     WHERE alert_outbox.channel = 'email' AND alert_outbox.sent_at IS NULL
                       AND alert_outbox.resolved_at IS NULL)
                   || ' alerts queued and holding. They are not lost and they are not sent.'
            WHEN public.f_alert_recipient_count() = 0
              THEN 'EMAIL ON BUT NOBODY TO SEND TO - no addresses on file.'
            ELSE 'Email is on. ' || (SELECT count(*) FROM alert_outbox
                    WHERE alert_outbox.channel = 'email' AND alert_outbox.sent_at IS NULL
                      AND alert_outbox.resolved_at IS NULL)
                 || ' waiting to go to ' || public.f_alert_recipient_count() || ' addresses.'
        END                                                                AS status;

-- Prove both halves: addresses hidden from a plain caller, count still honest.
do $$
declare
  rows_seen   int;
  count_seen  bigint;
  said        text;
begin
  set local role authenticated;
  begin
    select count(*) into rows_seen from (select 1 from public.v_alert_email_recipients limit 5) t;
  exception when others then
    reset role;
    raise exception 'ROLLED BACK — v_alert_email_recipients now ERRORS for a signed-in user, which is the failure mode this migration exists to avoid';
  end;
  select addresses_on_file, status into count_seen, said from public.v_alert_email_status;
  reset role;

  if rows_seen > 0 then
    raise exception 'ROLLED BACK — % address rows still visible without admin_settings', rows_seen;
  end if;
  if coalesce(count_seen, 0) = 0 then
    raise exception 'ROLLED BACK — the count went to zero for a non-admin, so the status page would falsely report nobody to send to';
  end if;
  if said like 'EMAIL ON BUT NOBODY%' then
    raise exception 'ROLLED BACK — status reports a false all-clear to a non-admin: %', said;
  end if;

  raise notice 'addresses hidden (0 rows), count still true (%), status: %', count_seen, said;
end $$;;
