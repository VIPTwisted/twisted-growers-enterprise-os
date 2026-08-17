/* Consolidate the whole alert backlog into at most four emails.
 *
 * Owner, 17 Aug 2026: "put all the pending emails into no more than 4 emails if
 * possible send all consolidated in 4 emails."
 *
 * 818 alerts are open and unread. Sent one per alert that is 818 emails and none of
 * them get read. Sent as four, grouped by what they are ACTUALLY ABOUT, each one is a
 * subject a person can act on in a sitting.
 *
 * THE GROUPING IS BY SOURCE, NOT BY ARBITRARY CHUNKS OF 205.
 * Splitting 818 into four equal piles would put Metrc corrections and potency
 * mismatches in the same email and break each subject across two. The three largest
 * sources each get their own email and everything else shares the fourth, so every
 * email has one subject and the fourth is explicitly labelled as the mixed one.
 *
 * NOTHING IS OMITTED. Every alert appears in full — no "and 270 more". The house rule
 * is that consolidating must never shorten, and a truncated list would let an item
 * disappear behind a count. Long emails are the price of that and they are worth it.
 *
 * A GROUP IS ONLY MARKED SUPPRESSED ONCE IT IS ACTUALLY IN AN EMAIL.
 * The rows keep email_suppressed_at from the sync-only policy, but each one now also
 * records which digest carried it, so "not emailed individually" can never be confused
 * with "never told anyone".
 */

create or replace function public.f_queue_backlog_digests(
  p_max_emails int default 4, p_by text default 'owner request')
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  cfg        jsonb;
  v_tz       text;
  g          record;
  r          record;
  v_groups   int := 0;
  v_queued   int := 0;
  v_total    int;
  v_body     text;
  v_lines    text;
  v_n        int;
  v_label    text;
  v_ids      bigint[];
begin
  select value into cfg from configurations where key = 'alert_email';
  v_tz := coalesce(cfg->>'timezone', 'America/New_York');

  select count(*) into v_total from alert_outbox
   where sent_at is null and resolved_at is null and coalesce(source,'') <> 'sync_digest';

  if v_total = 0 then
    return jsonb_build_object('emails', 0, 'state', 'nothing_pending');
  end if;

  /* Top (p_max_emails - 1) sources by volume each get their own email; everything
     else shares the last one. With the default of 4 that is three subjects plus a
     mixed remainder. */
  for g in
    with ranked as (
      select coalesce(source,'(no source recorded)') as src, count(*) n,
             row_number() over (order by count(*) desc) rn
        from alert_outbox
       where sent_at is null and resolved_at is null and coalesce(source,'') <> 'sync_digest'
       group by 1
    )
    select case when rn <= greatest(p_max_emails - 1, 1) then src else '__REST__' end as grp,
           sum(n)::int as n
      from ranked
     group by 1
     order by case when min(rn) <= greatest(p_max_emails - 1, 1) then min(rn) else 9999 end
  loop
    v_groups := v_groups + 1;
    v_n := g.n;

    v_label := case when g.grp = '__REST__'
                    then 'Everything else' else g.grp end;

    /* EVERY row, in full. No cap, no "and N more". */
    select array_agg(o.id), string_agg(
             format('  [%s] %s' || E'\n' || '     raised %s · %s',
                    upper(coalesce(o.severity,'elevated')),
                    coalesce(o.subject, '(no subject recorded)'),
                    to_char(o.created_at at time zone v_tz, 'DD Mon HH24:MI'),
                    coalesce(o.entity_type,'') ||
                      case when coalesce(o.entity_key,'') <> '' then ' ' || o.entity_key else '' end),
             E'\n\n' order by
               case coalesce(o.severity,'elevated')
                 when 'critical' then 1 when 'elevated' then 2 else 3 end,
               o.created_at desc)
      into v_ids, v_lines
      from alert_outbox o
     where o.sent_at is null and o.resolved_at is null
       and coalesce(o.source,'') <> 'sync_digest'
       and (case when g.grp = '__REST__'
                 then coalesce(o.source,'(no source recorded)') not in (
                        select coalesce(source,'(no source recorded)')
                          from alert_outbox
                         where sent_at is null and resolved_at is null
                           and coalesce(source,'') <> 'sync_digest'
                         group by 1 order by count(*) desc
                         limit greatest(p_max_emails - 1, 1))
                 else coalesce(o.source,'(no source recorded)') = g.grp end);

    v_body :=
      format('%s open alert%s in this group, of %s open in total.',
             v_n, case when v_n = 1 then '' else 's' end, v_total)
      || E'\n' || format('Group %s of %s. Subject: %s.', v_groups, least(p_max_emails, v_groups + 3), v_label)
      || E'\n\n' || coalesce(v_lines, '  (none)')
      || E'\n\n' || '---' || E'\n'
      || 'WHY THIS ARRIVED AS ONE EMAIL' || E'\n'
      || '   ' || v_total || ' alerts were open and unread. One email each would be ' || v_total
      || ' emails' || E'\n'
      || '   and none of them would be read. They are grouped by subject, not chopped into' || E'\n'
      || '   equal piles, so each email is about one thing.' || E'\n\n'
      || 'NOTHING HAS BEEN SHORTENED' || E'\n'
      || '   Every alert in this group is listed above in full. There is no "and N more".' || E'\n\n'
      || 'WHAT HAPPENS NEXT' || E'\n'
      || '   These stay open in the platform until someone records fix, leave, ignore or' || E'\n'
      || '   reset with a written reason. Ignoring is a decision, not a deletion.' || E'\n'
      || '   From now on only SYNC FAILURES email, hourly, 07:00-18:00. This backlog is a' || E'\n'
      || '   one-off catch-up sent at your request.';

    for r in
      select distinct ar.email, ar.full_name, ar.role
        from v_alert_email_recipients_internal ar
       where lower(ar.role) in ('owner','executive','admin','dept_head')
    loop
      insert into alert_outbox (entity_type, entity_key, source, source_ref, severity, role,
                                channel, subject, body, raised_on, days_open, reminder_number)
      values ('backlog_digest', v_label || '|' || to_char(now(),'YYYY-MM-DD"T"HH24MI'),
              'backlog_digest', 'group ' || v_groups || ' of ' || p_max_emails,
              'elevated', r.role, 'email',
              format('%s open alerts — %s (%s of %s)', v_n, v_label, v_groups, p_max_emails),
              'For ' || coalesce(r.full_name, r.email) || E'\n\n' || v_body,
              current_date, 0, 0);
      v_queued := v_queued + 1;
    end loop;

    /* Record WHICH digest carried each row, so "not emailed individually" can never
       be mistaken for "nobody was ever told". */
    update alert_outbox o
       set email_suppressed_at = coalesce(o.email_suppressed_at, now()),
           email_suppressed_why =
             'Carried in the consolidated backlog digest "' || v_label || '" sent '
             || to_char(now() at time zone v_tz, 'DD Mon YYYY HH24:MI')
             || ' at the owner''s request. Still open in the platform.'
     where o.id = any(v_ids);

    exit when v_groups >= p_max_emails;
  end loop;

  return jsonb_build_object('emails', v_groups, 'rows_queued', v_queued,
                            'alerts_covered', v_total, 'by', p_by,
                            'state', 'queued');
end $function$;

comment on function public.f_queue_backlog_digests(int, text) is
  'One-off catch-up: consolidates every open alert into at most p_max_emails messages, '
  'grouped by source so each email has a single subject, with every alert listed in '
  'full and nothing truncated. Owner request 17 Aug 2026. Records on each alert which '
  'digest carried it. Agent I.';;
