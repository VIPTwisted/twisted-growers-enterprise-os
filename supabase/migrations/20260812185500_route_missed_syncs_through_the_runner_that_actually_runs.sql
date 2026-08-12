-- ROUTE MISSED SYNCS THROUGH THE RUNNER THAT ACTUALLY RUNS
-- TG-08, 12 August 2026. Second of three. Detection is in the migration before this.
--
-- THE MISTAKE THIS FILE IS BUILT TO AVOID. tg_check_tile_drill() has no cron entry,
-- so a contract registered there fires nothing and reads as covered. The Metrc
-- lab-results sync had the same shape: 12 of 13 runs failed on one error and there
-- was no cron entry at all, so nothing retried it and nothing told anyone.
--
-- tg_verify() genuinely runs. Proven twice, independently of each other and of
-- cron.job, on 12 August 2026:
--   (a) v_cron_health   — verification-suite, '20 * * * *', 20 runs / 24h, 0 failed.
--   (b) verification_runs — its own output table, max(ran_at) = 2026-08-12 17:20:00Z,
--       1,591 rows in the preceding 24 hours across 40-45 checks per hour.
-- (b) is the one that matters: it is the runner's own footprint, not the scheduler's
-- opinion of itself. A scheduler can report success while the work does nothing.
--
-- So detection hangs off tg_verify. But the ALERT RAISER needs its own schedule, and
-- a schedule can be removed. Therefore the raiser stamps feed_watch_run every time it
-- executes, and tg_verify checks that stamp. If anybody deletes the cron entry, the
-- runner that does run notices within the hour and raises a finding saying the feed
-- watcher itself has gone dark. The watcher is watched by something that is watched.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE RAISER'S OWN FOOTPRINT. Without this the watcher can die silently, which
--    is the exact failure it was built to detect.
-- ---------------------------------------------------------------------------

create table if not exists feed_watch_run (
  id          bigserial primary key,
  ran_at      timestamptz not null default now(),
  findings    integer not null default 0,
  raised      integer not null default 0,
  reminded    integer not null default 0,
  resolved    integer not null default 0,
  grouped     integer not null default 0,
  note        text
);

alter table feed_watch_run enable row level security;

drop policy if exists feed_watch_run_read on feed_watch_run;
create policy feed_watch_run_read on feed_watch_run
  for select to authenticated using (true);

grant select on feed_watch_run to authenticated;
revoke all on feed_watch_run from public, anon;

create index if not exists feed_watch_run_ran_at_idx on feed_watch_run (ran_at desc);

-- ---------------------------------------------------------------------------
-- 2. HOW OFTEN A FEED ALERT MAY REPEAT. Escalation by duration, not repetition.
-- ---------------------------------------------------------------------------
-- 239 unread alerts is evidence that unread alerting is worse than none, and the
-- reason they went unread is that they all said the same thing. So: the first alert
-- goes immediately, the second only after six hours, and after that once a day —
-- and each one carries a DIFFERENT subject line stating how long it has now been
-- dark. A line that changes is a line somebody reads.

create or replace function f_feed_reminder_gap(p_reminder_number integer)
returns interval language sql immutable as $$
  select case
    when p_reminder_number <= 1 then interval '6 hours'
    when p_reminder_number = 2  then interval '18 hours'
    else interval '24 hours'
  end
$$;

revoke all on function f_feed_reminder_gap(integer) from public, anon;
grant execute on function f_feed_reminder_gap(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. THE RAISER. Extends alert_outbox — it does not replace it.
-- ---------------------------------------------------------------------------
-- alert_outbox and alert_recipient already exist and already hold the queue, and
-- tg_raise_item_alerts already established the contract this follows: auto-resolve
-- when the condition clears, one open alert per key, reminders on a cadence, and a
-- body that says what to do. Feed alerts use entity_type = 'feed' so they can never
-- collide with item flags.

create or replace function tg_raise_feed_alerts()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_findings int; v_raised int := 0; v_reminded int := 0;
  v_resolved int := 0; v_grouped int := 0;
begin
  -- (a) CLOSE WHAT HAS RECOVERED, FIRST. A finding that stays open after the problem
  --     is fixed trained people to ignore the queue once already: four findings sat
  --     open for up to four days after their causes were resolved.
  with recovered as (
    update alert_outbox o
       set resolved_at = now(),
           resolved_note = 'The feed is delivering again. Closed automatically at '
             || to_char(now() at time zone 'America/New_York', 'DD Mon YYYY HH24:MI')
             || ' Eastern by tg_raise_feed_alerts.'
     where o.entity_type = 'feed'
       and o.resolved_at is null
       and not exists (
         select 1 from v_feed_health h
          where h.feed_key = o.entity_key
            and h.state in ('OVERDUE','NEVER DELIVERED'))
    returning 1)
  select count(*) into v_resolved from recovered;

  select count(*) into v_findings
    from v_feed_health
   where state in ('OVERDUE','NEVER DELIVERED');

  -- (b) GROUPING. When three or more feeds of one system are dark at once the cause
  --     is almost always upstream — one credential, one bridge, one outage. Raising
  --     them one by one is how a real event becomes a wall of noise nobody reads.
  --     One alert names the system and lists the feeds.
  --
  --     BUT A FEED DECLARED CRITICAL IN THE REGISTRY IS NEVER GROUPED. Tested against
  --     tonight's live data before this shipped: without this exclusion, Metrc lab
  --     results at 145 hours dark — the feed holding 60 lb of tested product behind a
  --     missing certificate — would have been folded into a line reading "3 Metrc
  --     feeds have gone dark", alongside a full-sweep endpoint nobody depends on.
  --     Grouping is for noise. It must never swallow the signal.
  with big as (
    select h.system, count(*) as n,
           string_agg(h.what_it_feeds || ' (' || f_feed_duration_words(h.dark_for) || ')',
                      E'\n  · ' order by h.dark_for desc nulls first) as list,
           min(h.last_success_at) as oldest_success
      from v_feed_health h
     where h.state in ('OVERDUE','NEVER DELIVERED')
       and h.severity_floor <> 'critical'
     group by h.system
    having count(*) >= 3
  ), ins as (
    insert into alert_outbox
      (entity_type, entity_key, source, source_ref, severity, role, channel,
       reminder_number, subject, body, raised_on, days_open)
    -- Always elevated. A grouped alert cannot be critical BY CONSTRUCTION, because
    -- every feed declared critical is excluded from grouping above and keeps its own
    -- alert. If that ever stops being true, the exclusion has been broken, not this.
    select 'feed_system', b.system, 'v_feed_health', b.system,
           'elevated',
           'owner', ch.channel, 1,
           b.n || ' ' || b.system || ' feeds have gone dark at the same time',
           b.n || ' feeds from ' || b.system || ' are all overdue at once, which '
             || 'usually means one upstream cause rather than ' || b.n || ' separate '
             || 'faults — a credential, the bridge, or the scheduler.'
             || E'\n\nThe feeds:\n  · ' || b.list
             || E'\n\nOldest successful run across them: '
             || coalesce(to_char(b.oldest_success at time zone 'America/New_York',
                                 'DD Mon YYYY HH24:MI') || ' Eastern',
                         'none of them has ever succeeded')
             || E'\n\nWhat to do: find the one shared cause before working through them '
             || 'individually. Open Sync Center, run one of them by hand, and read the '
             || 'error it returns.'
             || E'\n\nThis alert closes itself when the feeds come back. It will not be '
             || 'repeated hourly; the next reminder is in six hours and will say how '
             || 'long it has then been dark.',
           current_date, 0
      from big b
      cross join (values ('in_app'), ('email')) ch(channel)
     where not exists (
       select 1 from alert_outbox o
        where o.entity_type = 'feed_system' and o.entity_key = b.system
          and o.channel = ch.channel and o.resolved_at is null)
    returning 1)
  select count(*) into v_grouped from ins;

  -- Close system-level alerts once the cluster breaks up.
  update alert_outbox o
     set resolved_at = now(),
         resolved_note = 'Fewer than three feeds from this system are dark now, so the '
           || 'grouped alert no longer applies. Any feed still dark keeps its own alert.'
   where o.entity_type = 'feed_system' and o.resolved_at is null
     and (select count(*) from v_feed_health h
           where h.system = o.entity_key
             and h.severity_floor <> 'critical'
             and h.state in ('OVERDUE','NEVER DELIVERED')) < 3;

  -- (c) PER-FEED ALERTS. Both channels, every time: the owner ruled email AND in
  --     platform, and the in-platform record is the durable one.
  with candidate as (
    select h.*,
           (select o.id from alert_outbox o
             where o.entity_type='feed' and o.entity_key=h.feed_key
               and o.channel = ch.channel and o.resolved_at is null
             order by o.created_at desc limit 1)                      as open_id,
           (select o.created_at from alert_outbox o
             where o.entity_type='feed' and o.entity_key=h.feed_key
               and o.channel = ch.channel and o.resolved_at is null
             order by o.created_at desc limit 1)                      as open_since,
           (select coalesce(max(o.reminder_number),0) from alert_outbox o
             where o.entity_type='feed' and o.entity_key=h.feed_key
               and o.channel = ch.channel)                            as sent_before,
           ch.channel
      from v_feed_health h
      cross join (values ('in_app'), ('email')) ch(channel)
     -- CANNOT MEASURE IS DELIBERATELY NOT ALERTED. 18 of 25 materialised views carry
     -- no computed_at column. That is a real gap, it is visible in v_feed_health, and
     -- it is held by the feeds.matview-clocks-not-getting-worse ratchet — but it has
     -- been true for weeks, it is a build task, and mailing it every night would put
     -- 18 unactionable lines in front of the owner and bury the one that matters.
     -- A missed sync is an event. A missing column is a backlog item.
     where h.state in ('OVERDUE','NEVER DELIVERED')
       -- A feed already covered by a grouped system alert does not also alert
       -- individually. A feed declared critical is never in a group, so it is never
       -- suppressed by one.
       and (h.severity_floor = 'critical' or not exists (
         select 1 from alert_outbox g
          where g.entity_type='feed_system' and g.entity_key = h.system
            and g.channel = ch.channel and g.resolved_at is null))
  ), due as (
    select c.* from candidate c
     where c.open_id is null
        or c.open_since < now() - f_feed_reminder_gap(c.sent_before)
  ), ins as (
    insert into alert_outbox
      (entity_type, entity_key, source, source_ref, severity, role, channel,
       reminder_number, subject, body, raised_on, days_open)
    select 'feed', d.feed_key, 'v_feed_health', d.source_ref,
           d.severity, 'owner', d.channel, d.sent_before + 1,
           case
             when d.sent_before = 0 then upper(d.severity) || ': ' || d.headline
             else 'STILL DARK — ' || d.headline
           end,
           d.headline
             || E'\n\n' || d.detail
             || E'\n\nWhat this blocks: ' || d.blocked_downstream
             || E'\n\nWhat to do: ' || d.what_to_do
             || E'\n\nFeed: ' || d.feed_key || '   System: ' || d.system
             || E'\nDetection: v_feed_health, raised by tg_raise_feed_alerts.'
             || E'\n\nThis alert closes itself the moment the feed delivers again. '
             || 'It will not repeat hourly — the next reminder is at least '
             || f_feed_duration_words(f_feed_reminder_gap(d.sent_before + 1))
             || ' away and will state how long it has been dark by then.',
           current_date,
           case when d.dark_for is null then 0
                else greatest(0, extract(day from d.dark_for)::int) end
      from due d
    returning (case when reminder_number = 1 then 'new' else 'reminder' end) as kind)
  select count(*) filter (where kind='new'),
         count(*) filter (where kind='reminder')
    into v_raised, v_reminded from ins;

  insert into feed_watch_run (findings, raised, reminded, resolved, grouped, note)
  values (v_findings, v_raised, v_reminded, v_resolved, v_grouped,
          case when v_findings = 0 then 'All registered feeds current.' else null end);

  return jsonb_build_object(
    'ok', true, 'findings', v_findings, 'raised', v_raised, 'reminded', v_reminded,
    'resolved', v_resolved, 'grouped', v_grouped,
    'note', 'Rows are queued in alert_outbox. Whether email LEAVES the building '
         || 'depends on configurations.alert_email, which is reported honestly by '
         || 'v_alert_email_status and must never be implied by this function.');
end $$;

revoke all on function tg_raise_feed_alerts() from public, anon;
grant execute on function tg_raise_feed_alerts() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. REGISTER WITH tg_verify — the runner proven to execute.
-- ---------------------------------------------------------------------------
-- tg_verify compares two scalars per check and raises a watchdog_finding when they
-- disagree beyond tolerance. Each check below is written so that IMPROVEMENT never
-- fires it: source A is a count of things that are wrong, source B is zero. A check
-- that goes red when something gets better is a check that gets switched off.

insert into verification_checks
 (check_key, title, what_it_proves, source_a_label, source_a_sql,
  source_b_label, source_b_sql, tolerance_pct, severity, owner,
  measures_a_process, in_flight_rule, settles_within)
values
 ('feeds.nothing-is-dark',
  'No registered feed has gone dark',
  'Every inbound feed either delivered inside its cadence, is still in flight, or is '
  || 'retired with a reason. This is the check that did not exist when the Metrc '
  || 'lab-results feed was dark for six days.',
  'Feeds currently overdue or never delivered',
  'select count(*) from v_feed_health where state in (''OVERDUE'',''NEVER DELIVERED'')',
  'Zero, which is the only acceptable number',
  'select 0',
  0, 'critical', 'Vincent',
  true,
  'A sync run still marked running inside feed_policy.in_flight_window is IN FLIGHT and '
  || 'is excluded by v_feed_health, which reports it as IN FLIGHT rather than OVERDUE. '
  || 'Retired and superseded feeds are excluded entirely, so a renamed endpoint cannot '
  || 'raise a false critical against its own replacement.',
  interval '30 minutes'),

 ('feeds.every-feed-is-registered',
  'Every feed running in the wild has declared itself',
  'A feed absent from feed_registry is watched by nothing, and unwatched reads exactly '
  || 'like healthy. This catches a NEW sync being added without a cadence.',
  'Feeds seen running that are not in feed_registry',
  'select count(*) from v_feed_registry_gaps',
  'Zero',
  'select 0',
  0, 'elevated', 'Vincent', false, null, null),

 ('feeds.the-watcher-is-alive',
  'The feed watcher itself is still running',
  'tg_raise_feed_alerts has its own schedule, and a schedule can be deleted — that is '
  || 'exactly what happened to tg_check_tile_drill, which has no cron and therefore '
  || 'fires nothing while reading as covered. This check runs inside tg_verify, which '
  || 'is proven to execute, and goes red if the watcher stops stamping feed_watch_run.',
  'Minutes since the feed watcher last ran, above the 90 allowed',
  'select greatest(0, coalesce((select extract(epoch from now()-max(ran_at))/60 '
  || 'from feed_watch_run), 999) - 90)::numeric',
  'Zero minutes overdue',
  'select 0',
  0, 'critical', 'Vincent', false, null, null),

 ('feeds.matview-clocks-not-getting-worse',
  'No new materialised view has been added without a clock',
  'A materialised view with no computed_at column cannot be aged, so staleness in it '
  || 'is invisible — 18 of 25 are in that state today. This is a ratchet, not an '
  || 'alarm: source A is how far the count has risen ABOVE the measured baseline, so '
  || 'it stays at zero while the number holds or falls, and goes red only when '
  || 'somebody adds another unmeasurable view. A check that fires on an improvement '
  || 'is a check that gets switched off.',
  'Unmeasurable materialised views above the recorded baseline',
  'select greatest(0, (select count(*) from pg_class c '
  || 'join pg_namespace n on n.oid=c.relnamespace '
  || 'where n.nspname=''public'' and c.relkind=''m'' '
  || 'and not exists (select 1 from pg_attribute a where a.attrelid=c.oid '
  || 'and a.attname=''computed_at'' and a.attnum>0 and not a.attisdropped)) '
  || '- (select baseline from feed_ratchet where ratchet_key=''matviews_without_a_clock''))::numeric',
  'Zero above baseline',
  'select 0',
  0, 'elevated', 'Vincent', false, null, null),

 ('feeds.the-stated-destination-is-actually-wired',
  'The address the owner named can actually receive an alert',
  'The owner named twistedgrowersma@gmail.com on 12 August and it was recorded in '
  || 'alert_destination. An address recorded in a table nothing reads is the '
  || 'counterparty_role failure repeated: a ruling captured as data with nothing wired '
  || 'to consume it. This proves the stated destination is on the actual send roster.',
  'Active email destinations that are NOT on the send roster',
  'select count(*) from alert_destination d where d.active and d.channel=''email'' '
  || 'and not exists (select 1 from alert_recipient r where r.active '
  || 'and lower(btrim(r.email)) = lower(btrim(d.address)))',
  'Zero',
  'select 0',
  0, 'critical', 'Vincent', false, null, null)
on conflict (check_key) do update set
  title = excluded.title,
  what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql,
  source_b_sql = excluded.source_b_sql,
  severity = excluded.severity,
  in_flight_rule = excluded.in_flight_rule;

-- ---------------------------------------------------------------------------
-- 5. THE RAISER'S SCHEDULE.
-- ---------------------------------------------------------------------------
-- At :25, five minutes after verification-suite at :20, so a finding raised by
-- tg_verify is already on the books when the raiser looks. If this entry is ever
-- removed, feeds.the-watcher-is-alive turns red within the hour — which is the
-- whole point of stamping feed_watch_run.

select cron.schedule('feed-watch', '25 * * * *', $job$select tg_raise_feed_alerts()$job$);

-- ---------------------------------------------------------------------------
-- 6. Register the new tables so they are not silently unaudited.
-- ---------------------------------------------------------------------------

insert into duplicate_key (table_name, key_columns, why) values
 ('feed_registry', array['feed_key'],
  'One row per feed. A second row for the same feed would mean two cadences for one '
  || 'pipe and two alerts for one outage.'),
 ('feed_policy', array['policy_key'],
  'One row per policy value. Two rows would mean two thresholds and a coin toss.')
on conflict (table_name) do nothing;

commit;
