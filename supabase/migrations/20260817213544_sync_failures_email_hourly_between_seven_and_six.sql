update public.configurations
   set value = value
     || jsonb_build_object(
          'enabled',            true,
          'provider',           'resend',
          'send_function',      'alert-email',
          'from_address',       'onboarding@resend.dev',
          'from_address_note',
            'Resend''s shared sender, which works with no domain verification. Switch to '
            || 'alerts@twistedgrowers.com once that domain verifies in Resend — an alert '
            || 'about a licensed operation arriving from a generic sender gets ignored.',
          'window_start_local', '07:00',
          'window_end_local',   '18:00',
          'timezone',           'America/New_York',
          'digest_interval',    '1 hour',
          'scope',              'sync_failures_only',
          'key_location',       'app_secrets.ALERT_EMAIL_API_KEY, set at Settings > Keys & Connections',
          'scope_why',
            'Owner instruction 17 Aug 2026. Only sync failures reach email. Everything '
            || 'else still queues to alert_outbox and still shows in the platform — this '
            || 'governs interruption, not recording.',
          'batching_why',
            'One digest per hour carrying every failure, never one alert per hour with '
            || 'the rest dropped. Dropping an alert to honour a rate limit is a silent '
            || 'failure.')
     - 'why_off' - 'to_turn_on'
 where key = 'alert_email';

create or replace function public.f_sync_digest_due()
returns table (due boolean, reason text, local_time text, last_digest_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  cfg jsonb; v_tz text; v_local timestamptz; v_lt time;
  v_start time; v_end time; v_last timestamptz; v_every interval;
begin
  select value into cfg from configurations where key = 'alert_email';
  v_tz    := coalesce(cfg->>'timezone', 'America/New_York');
  v_start := coalesce(nullif(cfg->>'window_start_local',''), '07:00')::time;
  v_end   := coalesce(nullif(cfg->>'window_end_local',''),   '18:00')::time;
  v_every := coalesce(nullif(cfg->>'digest_interval',''), '1 hour')::interval;
  v_local := now() at time zone v_tz;
  v_lt    := (now() at time zone v_tz)::time;

  select max(created_at) into v_last from alert_outbox where source = 'sync_digest';

  if v_lt < v_start or v_lt >= v_end then
    return query select false,
      format('Outside the %s-%s %s window (local time %s). Failures are still being recorded and will appear in the next digest.',
             v_start, v_end, v_tz, to_char(v_lt,'HH24:MI')),
      to_char(v_local,'YYYY-MM-DD HH24:MI'), v_last;
    return;
  end if;

  if v_last is not null and v_last > now() - v_every then
    return query select false,
      format('A digest was sent %s ago and the interval is %s.', to_char(now() - v_last, 'HH24:MI'), v_every),
      to_char(v_local,'YYYY-MM-DD HH24:MI'), v_last;
    return;
  end if;

  return query select true,
    format('Window is open (local time %s) and the last digest was %s.',
           to_char(v_lt,'HH24:MI'), coalesce(to_char(v_last,'DD Mon HH24:MI'), 'never')),
    to_char(v_local,'YYYY-MM-DD HH24:MI'), v_last;
end $function$;

comment on function public.f_sync_digest_due() is
  'Whether a sync digest is due, and in words why not when it is not. Returns a reason '
  'rather than a bare false so a caller can print why the inbox is quiet. Agent I.';

create or replace view public.v_sync_failures_pending as
select r.system, r.endpoint, r.license, r.status, r.records, r.started_at, r.finished_at, r.error
from public.v_all_sync_runs r
where lower(coalesce(r.status,'')) in ('error','failed','failure')
  and r.started_at > coalesce(
        (select max(created_at) from public.alert_outbox where source = 'sync_digest'),
        now() - interval '24 hours');

comment on view public.v_sync_failures_pending is
  'Sync failures across EVERY integration since the last digest, or the last 24h if no '
  'digest has ever been sent. Reads v_all_sync_runs and never a single source table — '
  'on 9 Aug 2026 a panel read metrc_sync_runs alone and reported a successful 15-entity '
  'Apex run as "Apex did not sync". Agent I, 17 Aug 2026.';

create or replace function public.f_queue_sync_digest(p_by text default 'cron')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  d record; cfg jsonb; v_n int; v_systems int; v_since timestamptz;
  v_body text; v_lines text; v_sent int := 0; r record; v_tz text;
begin
  select * into d from f_sync_digest_due();
  if not d.due then
    return jsonb_build_object('queued', 0, 'state', 'not_due', 'why', d.reason, 'local_time', d.local_time);
  end if;

  select value into cfg from configurations where key = 'alert_email';
  v_tz := coalesce(cfg->>'timezone','America/New_York');

  select count(*), count(distinct system) into v_n, v_systems from v_sync_failures_pending;
  v_since := coalesce(d.last_digest_at, now() - interval '24 hours');

  if v_n = 0 then
    return jsonb_build_object('queued', 0, 'state', 'nothing_to_report',
      'why', 'No sync failures since ' || to_char(v_since,'DD Mon HH24:MI')
             || '. Silence here means clean, and the platform still shows the full picture.',
      'local_time', d.local_time);
  end if;

  select string_agg(
           format('  %s / %s%s' || E'\n' || '     %s at %s%s',
                  system, endpoint,
                  case when coalesce(license,'') <> '' then ' (' || license || ')' else '' end,
                  upper(status), to_char(started_at at time zone v_tz, 'DD Mon HH24:MI'),
                  case when coalesce(error,'') <> '' then E'\n' || '     ' || left(error, 240) else '' end),
           E'\n\n' order by started_at desc)
    into v_lines from v_sync_failures_pending;

  v_body :=
    format('%s sync failure%s across %s integration%s since %s.',
           v_n, case when v_n = 1 then '' else 's' end,
           v_systems, case when v_systems = 1 then '' else 's' end,
           to_char(v_since at time zone v_tz, 'DD Mon HH24:MI'))
    || E'\n\n' || v_lines || E'\n\n' || '---' || E'\n'
    || 'WHAT THIS EMAIL COVERS' || E'\n'
    || '   Sync failures only, batched hourly, ' || coalesce(cfg->>'window_start_local','07:00')
    || '-' || coalesce(cfg->>'window_end_local','18:00') || ' ' || v_tz || '.' || E'\n'
    || '   Failures overnight are held and appear in the 07:00 digest. Nothing is dropped.' || E'\n\n'
    || 'WHAT THIS EMAIL DOES NOT COVER' || E'\n'
    || '   Every other finding — compliance, inventory, cash, harvest cycle — still' || E'\n'
    || '   queues and still appears in the platform. It no longer emails, by your' || E'\n'
    || '   instruction of 17 Aug 2026. A quiet inbox is not an empty problem list.';

  for r in
    select distinct ar.email, ar.full_name, ar.role from alert_recipient ar
     where ar.active and lower(ar.role) in ('owner','executive','admin','dept_head')
       and coalesce(ar.email,'') <> ''
  loop
    insert into alert_outbox (entity_type, entity_key, source, source_ref, severity, role,
                              channel, subject, body, raised_on, days_open, reminder_number)
    values ('sync_digest', to_char(now(),'YYYY-MM-DD"T"HH24'), 'sync_digest',
            'sync_failures|' || v_n::text,
            case when v_n >= 10 then 'critical' else 'elevated' end,
            r.role, 'email',
            format('%s sync failure%s — %s', v_n, case when v_n = 1 then '' else 's' end,
                   to_char(now() at time zone v_tz, 'DD Mon HH24:MI')),
            'For ' || coalesce(r.full_name, r.email) || E'\n\n' || v_body,
            current_date, 0, 0);
    v_sent := v_sent + 1;
  end loop;

  if v_sent = 0 then
    raise warning 'Sync digest built with % failures but NO active admin recipient has an email address. It went nowhere.', v_n;
  end if;

  return jsonb_build_object('queued', v_sent, 'state', 'queued', 'failures', v_n,
                            'systems', v_systems, 'since', v_since, 'by', p_by, 'local_time', d.local_time);
end $function$;

comment on function public.f_queue_sync_digest(text) is
  'Queues ONE hourly digest of every sync failure since the last one, inside the '
  'configured local window. Owner instruction 17 Aug 2026: hourly, 07:00-18:00, sync '
  'issues only. Batches rather than rate-limits, so no alert is ever dropped to honour '
  'the cap. Sends nothing when there is nothing to report. Agent I.';;
