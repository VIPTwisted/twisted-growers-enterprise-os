/* f_alert_all_admins could never insert a row.
 *
 * alert_outbox.days_open is NOT NULL with no default. f_alert_all_admins does not
 * supply it, so every call raised
 *
 *   23502: null value in column "days_open" of relation "alert_outbox"
 *
 * and rolled back. The function is the J3 path — the one that tells EVERY admin when
 * a finding cannot be resolved automatically — so the most important alert route in
 * the platform has never delivered a single row. Other writers populate the column
 * and work, which is why alert_outbox holds 879 rows and the fault stayed hidden:
 * the table looked alive.
 *
 * Found 17 Aug 2026 while wiring the 56-day harvest cycle breach to the watchdog.
 * The first call in anger was the first call that ever revealed it.
 *
 * days_open is the age of the FINDING, not of the outbox row — an alert raised today
 * about a problem first observed three weeks ago is 21 days open, and reporting 0
 * would understate every escalation. Taken from watchdog_findings.observed_at.
 *
 * NOTE ON THE OTHER HALF: fixing this makes alerts reach the OUTBOX. It does not make
 * them reach an inbox. All 879 rows have sent_at IS NULL because no email provider is
 * configured — RESEND_API_KEY is still unset (owner task #25). Both halves must land
 * before "alerts reach someone" is true, and this migration is only the first.
 */

create or replace function public.f_alert_all_admins(p_finding_id bigint)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f record;
  r record;
  v_missing text[];
  v_body text;
  v_sent int := 0;
  v_sol text;
  v_days_open int;
begin
  select * into f from watchdog_findings where id = p_finding_id;
  if not found then
    raise exception 'No finding with id %', p_finding_id;
  end if;

  select missing into v_missing from v_finding_alert_ready where id = p_finding_id;

  /* J4: refuse. Sending a partial alert trains people that alerts are partial. */
  if array_length(v_missing, 1) is not null then
    raise exception
      'RULE J4 - this finding cannot be sent. Missing: %. Every alert must carry who, what, when, where, why, how, solutions and the guard''s recommendation. Fill them in and try again.',
      array_to_string(v_missing, ', ');
  end if;

  /* The age of the problem, not the age of the message. */
  v_days_open := greatest(0, (current_date - f.observed_at::date));

  /* Solutions rendered as a numbered menu, because a menu makes an omitted option
     obvious in a way a sentence does not (rule C6b). */
  select string_agg('   ' || i || '. ' || s, E'\n' order by i)
    into v_sol
  from unnest(f.solutions) with ordinality as t(s, i);

  v_body :=
    'WHAT'            || E'\n' || '   ' || coalesce(f.what,'') || E'\n' ||
    case when coalesce(f.the_arithmetic,'') <> ''
         then '   Arithmetic: ' || f.the_arithmetic || E'\n' else '' end ||
    case when f.pounds  is not null then '   Weight at stake: ' || f.pounds  || ' lb' || E'\n' else '' end ||
    case when f.dollars is not null then '   Money at stake: $' || f.dollars || E'\n' else '' end ||
    E'\n' ||
    'WHO'             || E'\n' || '   Accountable: ' || coalesce(f.who_is_accountable,'') || E'\n' ||
                                  '   Raised by: the guard, ' || coalesce(f.how_it_was_detected,'a scheduled check') || E'\n' || E'\n' ||
    'WHEN'            || E'\n' || '   Started: ' || coalesce(f.when_it_started,'') || E'\n' ||
                                  '   Detected: ' || to_char(f.observed_at, 'DD Mon YYYY HH24:MI') || E'\n' ||
                                  '   Open for: ' || v_days_open || ' days' || E'\n' || E'\n' ||
    'WHERE'           || E'\n' || '   ' || coalesce(f.where_it_is,'') || E'\n' || E'\n' ||
    'WHY IT MATTERS'  || E'\n' || '   ' || coalesce(f.why_it_matters,'') || E'\n' || E'\n' ||
    'HOW IT WAS FOUND'|| E'\n' || '   ' || coalesce(f.how_it_was_detected,'') || E'\n' || E'\n' ||
    'SOLUTIONS'       || E'\n' || coalesce(v_sol,'') || E'\n' || E'\n' ||
    'THE GUARD''S RECOMMENDATION' || E'\n' || '   ' || coalesce(f.guard_recommendation,'') || E'\n' || E'\n' ||
    '---' || E'\n' ||
    'This issue could not be resolved automatically, so every admin has been told (rule J3).' || E'\n' ||
    'It will not clear itself. An owner or executive must record fix / leave / ignore /' || E'\n' ||
    'reset with a written reason (rule H1) - ignoring is a decision, not a deletion.';

  /* J3 - EVERY active admin, not just the accountable one. */
  for r in
    select distinct ar.email, ar.full_name, ar.role
    from alert_recipient ar
    where ar.active
      and lower(ar.role) in ('owner','executive','admin','dept_head')
      and coalesce(ar.email,'') <> ''
  loop
    insert into alert_outbox (entity_type, entity_key, source, source_ref, severity, role,
                              channel, subject, body, raised_on, days_open, reminder_number)
    values ('watchdog_finding', p_finding_id::text, 'guard', f.fingerprint,
            coalesce(f.severity,'elevated'), r.role, 'email',
            upper(coalesce(f.severity,'elevated')) || ' - ' || left(coalesce(f.what,'Unresolved guard issue'), 120),
            'For ' || coalesce(r.full_name, r.email) || E'\n\n' || v_body,
            current_date, v_days_open, 0);
    v_sent := v_sent + 1;
  end loop;

  if v_sent = 0 then
    /* A3 - absence explained. An alert with nowhere to go is itself a silent failure. */
    raise warning 'RULE J3 - finding % is ready to send but NO active admin recipient has an email address. The alert went nowhere. Add recipients to alert_recipient.', p_finding_id;
  end if;

  return v_sent;
end $function$;

comment on function public.f_alert_all_admins(bigint) is
  'Queues a J4-complete finding to every active admin recipient. Fixed 17 Aug 2026: the '
  'function omitted alert_outbox.days_open, which is NOT NULL with no default, so every '
  'call had thrown 23502 and no J3 alert had ever been queued. Agent I.';
