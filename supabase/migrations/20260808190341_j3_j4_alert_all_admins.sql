-- RULES J3 and J4, owner-set 8 Aug 2026.
--   J3 - if an agent cannot fix it, EVERY admin is told. Not one, not the accountable
--        party alone. An unresolvable issue must not sit in a table waiting to be noticed.
--   J4 - the alert carries Who, What, When, Where, Why, How, SOLUTIONS and the guard's
--        own final RECOMMENDATION. A finding missing any of these is not finished.
--
-- THE ENFORCEMENT IS THE POINT. This function REFUSES to send an incomplete finding and
-- names what is missing. A rule that is documented and not enforced is the thing this
-- platform keeps discovering it has: 27 of ~50 rules held by machinery, the rest by hope.
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
                                  '   Detected: ' || to_char(f.observed_at, 'DD Mon YYYY HH24:MI') || E'\n' || E'\n' ||
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
                              channel, subject, body, raised_on, reminder_number)
    values ('watchdog_finding', p_finding_id::text, 'guard', f.fingerprint,
            coalesce(f.severity,'elevated'), r.role, 'email',
            upper(coalesce(f.severity,'elevated')) || ' - ' || left(coalesce(f.what,'Unresolved guard issue'), 120),
            'For ' || coalesce(r.full_name, r.email) || E'\n\n' || v_body,
            current_date, 0);
    v_sent := v_sent + 1;
  end loop;

  if v_sent = 0 then
    /* A3 - absence explained. An alert with nowhere to go is itself a silent failure. */
    raise warning 'RULE J3 - finding % is ready to send but NO active admin recipient has an email address. The alert went nowhere. Add recipients to alert_recipient.', p_finding_id;
  end if;

  return v_sent;
end $function$;

comment on function public.f_alert_all_admins(bigint) is
  'Rules J3 and J4, 8 Aug 2026. Sends an unresolvable guard finding to EVERY active admin, '
  'formatted as who/what/when/where/why/how/solutions/recommendation. REFUSES to send a '
  'finding missing any of those and names the gap. Warns loudly if there are no recipients '
  '- an alert with nowhere to go is itself a silent failure.';;
