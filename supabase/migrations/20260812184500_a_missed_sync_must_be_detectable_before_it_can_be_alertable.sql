-- A MISSED SYNC MUST BE DETECTABLE BEFORE IT CAN BE ALERTABLE
-- TG-08 Integrations & Connectors, 12 August 2026, on the owner's direct order:
-- "I NEED TO GET AN ALERT EVERY TIME A SYNC IS MISSED."
--
-- WHY THIS EXISTS. The Metrc lab-results feed last succeeded at 16:57 on 6 August.
-- It was measured 144.8 hours dark on the evening of 12 August, and nothing said a
-- word, because a feed that stops reads exactly like a feed with nothing to report.
-- Apex last succeeded 65.7 hours ago. The three company spreadsheets have delivered
-- zero rows, ever. Two materialised views were 37.9 and 20.3 hours old while the
-- dashboards over them rendered as normal. Every one of those was visible in the
-- database the whole time and none of them was ever WATCHED.
--
-- THE ROOT CAUSE ALREADY IN v_house_rules, and this file is its answer:
-- "Every dashboard header reports the age of the COMPUTATION, never the age of the
--  DATA. A dead pipeline therefore renders as a healthy tile. The refresh job was
--  monitored and the values were not."
-- kpi_freshness_policy already guards the second half of that sentence: it asks
-- whether the NUMBER moved. Nothing guarded the first half: whether the PIPE
-- delivered. These are different questions and a feed can fail the second while
-- passing the first, which is precisely what happened for six days.
--
-- WHAT THIS FILE DOES NOT DO. It does not repair a single sync. TG-01 is fixing the
-- lab-results ON CONFLICT error concurrently. This is only the thing that would have
-- caught it on day two instead of day six.
--
-- NO CREDENTIAL APPEARS ANYWHERE IN THIS FILE, and none is needed to apply it. The
-- email step reads its provider key from the Edge Function secret store at runtime.
-- Addresses live in alert_destination, which is version-controllable precisely
-- because it holds no secret.

begin;

-- ---------------------------------------------------------------------------
-- 1. THE REGISTRY. Every feed declares itself, its cadence and its consequences.
-- ---------------------------------------------------------------------------
-- A feed that is not in here is invisible, and invisible reads as clean. So the
-- registry is paired below with v_feed_registry_gaps, which finds anything running
-- in the wild that never declared itself.

create table if not exists feed_registry (
  feed_key            text primary key,
  system              text not null
                        check (system in ('metrc','apex','google_sheets','clickup',
                                          'matview','bridge','platform')),
  what_it_feeds       text not null,
  source_kind         text not null
                        check (source_kind in ('metrc_sync_run','apex_sync_run',
                                               'sheet','matview','heartbeat')),
  source_ref          text not null,

  -- NULL means NOBODY HAS DECLARED HOW OFTEN THIS SHOULD RUN. That is a finding in
  -- its own right, not a reason to skip the feed. It is deliberately not inferred
  -- from observed behaviour: inferring a cadence from late runs makes lateness
  -- normal, which is the same error rule A5 forbids for settles_within.
  expected_every      interval,
  cadence_source      text not null default 'UNDECLARED'
                        check (cadence_source in ('UNDECLARED','owner_set',
                                                  'declared_in_sheet_contract',
                                                  'declared_by_cron_schedule')),

  blocked_downstream  text not null,
  what_to_do          text not null,
  severity_floor      text not null default 'elevated'
                        check (severity_floor in ('watch','elevated','critical')),

  -- IN FLIGHT IS NOT A FAILURE. A run that is still in the air is not a miss, and a
  -- check with no concept of the middle measures the calendar. Charter, 9 Aug 2026.
  in_flight_rule      text not null,

  active              boolean not null default true,
  superseded_by       text references feed_registry(feed_key),
  retired_reason      text,
  registered_by       text not null default 'TG-08',
  registered_at       timestamptz not null default now(),

  -- A retired feed must say WHY it is retired, or "active = false" becomes a way to
  -- silence an alarm without answering it.
  constraint retired_feeds_explain_themselves
    check (active or superseded_by is not null or coalesce(length(retired_reason),0) >= 20)
);

comment on table feed_registry is
  'Every inbound feed, its expected cadence and what breaks when it goes dark. '
  'Read by v_feed_health. A feed absent from here is caught by v_feed_registry_gaps.';

alter table feed_registry enable row level security;

drop policy if exists feed_registry_read on feed_registry;
create policy feed_registry_read on feed_registry
  for select to authenticated using (true);

drop policy if exists feed_registry_admin on feed_registry;
create policy feed_registry_admin on feed_registry
  for all to authenticated
  using (f_role_can('admin_settings')) with check (f_role_can('admin_settings'));

grant select on feed_registry to authenticated;
revoke all on feed_registry from public, anon;

-- ---------------------------------------------------------------------------
-- 2. THE LIVENESS FLOOR — a safety net, and explicitly NOT a service level.
-- ---------------------------------------------------------------------------
-- Most feeds have no declared cadence yet, and waiting for all of them to be
-- declared would mean shipping an alert system that alerts on nothing tonight.
-- So there is a second, cruder threshold: total silence for this long on a
-- licensed seed-to-sale mirror is a liveness judgement, not a cadence judgement,
-- and it needs no SLA to justify it.
--
-- The value below is PROVISIONAL and says so in its own row. It is set at 48 hours
-- because that would have caught lab results on 8 August rather than 12 August. The
-- owner may move it; nothing in this file infers it from how late things have been.

create table if not exists feed_policy (
  policy_key  text primary key,
  value       interval not null,
  why         text not null,
  set_by      text not null,
  confirmed_by_owner boolean not null default false,
  set_at      timestamptz not null default now()
);

alter table feed_policy enable row level security;

drop policy if exists feed_policy_read on feed_policy;
create policy feed_policy_read on feed_policy
  for select to authenticated using (true);

drop policy if exists feed_policy_admin on feed_policy;
create policy feed_policy_admin on feed_policy
  for all to authenticated
  using (f_role_can('admin_settings')) with check (f_role_can('admin_settings'));

grant select on feed_policy to authenticated;
revoke all on feed_policy from public, anon;

insert into feed_policy (policy_key, value, why, set_by, confirmed_by_owner) values
 ('liveness_floor', interval '48 hours',
  'NOT a service level. It is the point past which total silence from a feed is '
  'treated as dark regardless of whether anyone has declared how often it should '
  'run. Chosen because it would have caught the Metrc lab-results feed on 8 August '
  'instead of 12 August. PROVISIONAL until the owner confirms or changes it.',
  'TG-08 pending owner confirmation', false),
 ('matview_floor', interval '6 hours',
  'A materialised view that has not been rebuilt in this long is publishing stale '
  'figures to a dashboard that looks live. PROVISIONAL until the owner confirms.',
  'TG-08 pending owner confirmation', false),
 ('in_flight_window', interval '30 minutes',
  'A sync run still marked running inside this window is IN FLIGHT, not missed. '
  'Not invented: it matches tg_close_stuck_sync_runs, which already marks a run '
  'failed once it has been open 30 minutes, so the two cannot disagree.',
  'TG-08, matched to existing tg_close_stuck_sync_runs behaviour', false)
on conflict (policy_key) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Reading a materialised view's own clock needs dynamic SQL, so it needs a
--    function. Returns null when the matview carries no computed_at column, and
--    the view below reports that as CANNOT MEASURE rather than as healthy.
-- ---------------------------------------------------------------------------

create or replace function f_feed_matview_computed_at(p_matview text)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare v timestamptz; has_clock boolean;
begin
  select exists (
    select 1 from pg_attribute a
     where a.attrelid = ('public.'||quote_ident(p_matview))::regclass
       and a.attname = 'computed_at' and a.attnum > 0 and not a.attisdropped
  ) into has_clock;
  if not has_clock then return null; end if;
  execute format('select max(computed_at) from public.%I', p_matview) into v;
  return v;
exception when others then
  -- ABSENCE AND NO-ACCESS ARE NOT THE SAME THING. A matview that has been dropped
  -- must not silently read as fresh; null forces CANNOT MEASURE.
  return null;
end $$;

revoke all on function f_feed_matview_computed_at(text) from public, anon;
grant execute on function f_feed_matview_computed_at(text) to authenticated;

-- Durations read as English in an alert a person has to act on at six in the morning.
-- "0 years 0 mons 6 days 03:52:11" is not something anyone should have to parse.
-- Defined BEFORE the view that calls it, or the view cannot be created.
create or replace function f_feed_duration_words(p interval)
returns text language sql immutable as $$
  select case
    when p is null then 'an unknown length of time'
    when p < interval '1 minute'  then 'under a minute'
    when p < interval '2 hours'   then round(extract(epoch from p)/60)::text || ' minutes'
    when p < interval '48 hours'  then round(extract(epoch from p)/3600, 1)::text || ' hours'
    else round(extract(epoch from p)/86400, 1)::text || ' days'
  end
$$;

revoke all on function f_feed_duration_words(interval) from public, anon;
grant execute on function f_feed_duration_words(interval) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. DETECTION. One row per registered feed, with its state in plain English.
-- ---------------------------------------------------------------------------

create or replace view v_feed_health as
with policy as (
  select
    (select value from feed_policy where policy_key='liveness_floor')   as liveness_floor,
    (select value from feed_policy where policy_key='matview_floor')    as matview_floor,
    (select value from feed_policy where policy_key='in_flight_window') as in_flight_window
),
resolved as (
  select
    r.*,
    p.liveness_floor, p.matview_floor, p.in_flight_window,
    case r.source_kind
      when 'metrc_sync_run' then (
        select max(coalesce(s.finished_at, s.started_at))
          from metrc_sync_runs s
         where s.endpoint = r.source_ref and s.status = 'ok')
      when 'apex_sync_run' then (
        select max(coalesce(a.finished_at, a.started_at))
          from apex_sync_run a
         where a.entity = r.source_ref and a.status = 'ok')
      when 'sheet' then (
        select max(ss.last_pushed_at)
          from sheet_sources ss
         where ss.google_file_id = (select sc.file_id from sheet_source sc
                                     where sc.sheet_key = r.source_ref))
      when 'matview'   then f_feed_matview_computed_at(r.source_ref)
      when 'heartbeat' then (select h.last_seen from ai_bridge_heartbeat h
                              where h.machine = r.source_ref)
    end as last_success_at,
    case r.source_kind
      when 'metrc_sync_run' then exists (
        select 1 from metrc_sync_runs s
         where s.endpoint = r.source_ref and s.status = 'running'
           and s.started_at > now() - p.in_flight_window)
      when 'apex_sync_run' then exists (
        select 1 from apex_sync_run a
         where a.entity = r.source_ref and a.status = 'running'
           and a.started_at > now() - p.in_flight_window)
      else false
    end as in_flight,
    case r.source_kind
      when 'metrc_sync_run' then (
        select max(coalesce(s.finished_at, s.started_at))
          from metrc_sync_runs s where s.endpoint = r.source_ref)
      when 'apex_sync_run' then (
        select max(coalesce(a.finished_at, a.started_at))
          from apex_sync_run a where a.entity = r.source_ref)
      else null
    end as last_attempt_at,
    case r.source_kind
      when 'metrc_sync_run' then (
        select left(s.error, 300) from metrc_sync_runs s
         where s.endpoint = r.source_ref and s.status = 'error'
         order by s.started_at desc limit 1)
      when 'apex_sync_run' then (
        select left(a.error, 300) from apex_sync_run a
         where a.entity = r.source_ref and a.status <> 'ok'
         order by a.started_at desc limit 1)
      else null
    end as last_error,
    -- Only meaningful for matviews: no computed_at column means the age of the data
    -- cannot be read at all. That is worse than stale and must never render as fresh.
    (r.source_kind = 'matview'
     and f_feed_matview_computed_at(r.source_ref) is null) as clock_missing
  from feed_registry r cross join policy p
),
judged as (
  select
    d.*,
    coalesce(d.expected_every,
             case when d.source_kind = 'matview' then d.matview_floor
                  else d.liveness_floor end) as threshold,
    case when d.last_success_at is null then null
         else now() - d.last_success_at end as dark_for
  from resolved d
),
stated as (
  select
    j.*,
    case
      when not j.active                     then 'RETIRED'
      when j.clock_missing                  then 'CANNOT MEASURE'
      when j.in_flight                      then 'IN FLIGHT'
      when j.last_success_at is null        then 'NEVER DELIVERED'
      when j.dark_for > j.threshold         then 'OVERDUE'
      else 'CURRENT'
    end as state,
    case when j.last_success_at is null then null
         else j.dark_for - j.threshold end as overdue_by
  from judged j
)
select
  s.feed_key,
  s.system,
  s.what_it_feeds,
  s.source_kind,
  s.source_ref,
  s.state,
  s.severity_floor,
  s.expected_every,
  s.cadence_source,
  s.threshold                       as judged_against,
  s.last_success_at,
  s.last_attempt_at,
  s.dark_for,
  s.overdue_by,
  s.in_flight,
  s.last_error,
  s.blocked_downstream,
  s.what_to_do,
  s.superseded_by,
  s.retired_reason,

  -- Severity escalates with DURATION, never by resending the same line. A feed one
  -- interval late is not the same event as a feed six days dark, and treating them
  -- the same is how 239 alerts went unread.
  case
    when s.state in ('CURRENT','IN FLIGHT','RETIRED') then null
    when s.state = 'NEVER DELIVERED'                  then 'critical'
    when s.state = 'CANNOT MEASURE'                   then 'elevated'
    when s.dark_for > s.threshold * 3                 then 'critical'
    when s.severity_floor = 'critical'                then 'critical'
    when s.severity_floor = 'watch'                   then 'watch'
    else 'elevated'
  end as severity,

  -- The alert's own words. "Sync failed" is not an alert: what stopped, when it
  -- last worked, how long it has been dark, what is blocked, and what to do.
  case
    when s.state = 'NEVER DELIVERED' then
      s.what_it_feeds || ' has never delivered anything'
    when s.state = 'CANNOT MEASURE' then
      s.what_it_feeds || ' cannot be checked — it carries no clock'
    when s.state = 'OVERDUE' then
      s.what_it_feeds || ' has been dark for '
        || f_feed_duration_words(s.dark_for)
    else s.what_it_feeds || ' is current'
  end as headline,

  case
    when s.state = 'NEVER DELIVERED' then
      'This feed is registered and has never recorded a single successful run. '
      || 'Nothing has arrived from it at any point. Last attempt: '
      || coalesce(to_char(s.last_attempt_at at time zone 'America/New_York',
                          'DD Mon YYYY HH24:MI'), 'no attempt recorded at all')
      || coalesce('. Last error: ' || s.last_error, '.')
    when s.state = 'CANNOT MEASURE' then
      'This materialised view has no computed_at column, so how old its figures are '
      || 'cannot be read. It may be minutes old or weeks old and both look identical '
      || 'from outside. Pages built on it are publishing figures of unknown age.'
    when s.state = 'OVERDUE' then
      'Last successful run: '
      || to_char(s.last_success_at at time zone 'America/New_York', 'DD Mon YYYY HH24:MI')
      || ' Eastern, which is ' || f_feed_duration_words(s.dark_for) || ' ago. '
      || 'It is judged against ' || f_feed_duration_words(s.threshold)
      || case when s.cadence_source = 'UNDECLARED'
              then ' (the liveness floor — nobody has declared how often this feed should run, '
                   || 'so it is only caught once it is completely silent)'
              else ' (' || s.cadence_source || ')' end
      || ', so it is overdue by ' || f_feed_duration_words(s.overdue_by) || '. '
      || coalesce('Its most recent error was: ' || s.last_error, 'It recorded no error — it simply stopped being called.')
    else 'Current.'
  end as detail,

  s.blocked_downstream as why_it_matters
from stated s;

comment on view v_feed_health is
  'One row per registered feed with its live state. OVERDUE, NEVER DELIVERED and '
  'CANNOT MEASURE are findings; IN FLIGHT and RETIRED are not.';

grant select on v_feed_health to authenticated;
revoke all on v_feed_health from public, anon;

-- ---------------------------------------------------------------------------
-- 5. THE COVERAGE GUARD. A feed nobody registered is the failure mode this whole
--    file exists to prevent, so the registry must be checked against reality.
-- ---------------------------------------------------------------------------

create or replace view v_feed_registry_gaps as
select 'metrc_sync_run'::text as source_kind, s.endpoint as source_ref,
       count(*) as runs_recorded, max(s.started_at) as last_seen,
       'A Metrc sync endpoint has been writing run records but is not in feed_registry, '
       || 'so nothing is watching whether it stops.' as why_it_matters
  from metrc_sync_runs s
 where not exists (select 1 from feed_registry r
                    where r.source_kind='metrc_sync_run' and r.source_ref = s.endpoint)
 group by s.endpoint
union all
select 'apex_sync_run', a.entity, count(*), max(a.started_at),
       'An Apex entity has been writing run records but is not in feed_registry.'
  from apex_sync_run a
 where not exists (select 1 from feed_registry r
                    where r.source_kind='apex_sync_run' and r.source_ref = a.entity)
 group by a.entity
union all
select 'matview', c.relname, null, null,
       'A materialised view exists that no feed_registry row watches, so nobody is '
       || 'told when it stops being rebuilt.'
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname='public' and c.relkind='m'
   and not exists (select 1 from feed_registry r
                    where r.source_kind='matview' and r.source_ref = c.relname)
union all
select 'sheet', sc.sheet_key, null, null,
       'A company spreadsheet is registered in sheet_source but no feed_registry row '
       || 'watches whether it is actually arriving.'
  from sheet_source sc
 where not exists (select 1 from feed_registry r
                    where r.source_kind='sheet' and r.source_ref = sc.sheet_key);

grant select on v_feed_registry_gaps to authenticated;
revoke all on v_feed_registry_gaps from public, anon;

-- ---------------------------------------------------------------------------
-- 6. SEED THE REGISTRY FROM WHAT IS ACTUALLY RUNNING.
-- ---------------------------------------------------------------------------
-- Seeded from the live catalogues rather than typed out, so the registry starts
-- complete and v_feed_registry_gaps starts empty and stays meaningful: from here on
-- it only fires for a feed that is genuinely NEW and undeclared.
--
-- The prose is generic here and hand-written below for the feeds that matter. A
-- generic line is still actionable; a missing line is not.

-- NOT EVERY ROW IN metrc_sync_runs IS METRC. sync_system_map exists because ClickUp
-- and the finished-goods sheet were writing into that table unlabelled, so a day when
-- ClickUp failed read as a Metrc failure on the Sync Runs page. Reading the map here
-- means a grouped alert cannot say "3 Metrc feeds are dark" about a Google outage.
insert into feed_registry
  (feed_key, system, what_it_feeds, source_kind, source_ref,
   blocked_downstream, what_to_do, in_flight_rule, severity_floor)
select
  'metrc:' || s.endpoint,
  coalesce((select m.system from sync_system_map m
             where m.endpoint_pattern = s.endpoint), 'metrc'),
  coalesce((select m.system from sync_system_map m
             where m.endpoint_pattern = s.endpoint), 'Metrc') || ' ' || s.endpoint,
  'metrc_sync_run', s.endpoint,
  'Metrc is the legal system of record for cultivation, manufacturing, packaging and '
  || 'custody. Anything the platform publishes from this endpoint is frozen at the last '
  || 'successful run while it is dark.',
  'Open Sync Center and run this endpoint by hand to see the live error, then check '
  || 'metrc_sync_runs for the last recorded failure. A 401 means the Metrc key or '
  || 'licence scope; anything else is a code fault and belongs in a work order.',
  'A run row with status = running inside the in_flight_window is still in the air and '
  || 'is not counted as a miss. tg_close_stuck_sync_runs marks it failed at 30 minutes.',
  'elevated'
from (select distinct endpoint from metrc_sync_runs) s
on conflict (feed_key) do nothing;

insert into feed_registry
  (feed_key, system, what_it_feeds, source_kind, source_ref,
   blocked_downstream, what_to_do, in_flight_rule, severity_floor)
select
  'apex:' || a.entity, 'apex',
  'Apex ' || a.entity,
  'apex_sync_run', a.entity,
  'Apex is the source of record for sales, price and terms. While this is dark, every '
  || 'revenue, buyer and order figure on the platform is as of the last successful pull.',
  'Run the Apex sync from Sync Center. Apex bills by API credit, so do not loop it: '
  || 'one run, read the error, fix the cause.',
  'A run row with status = running inside the in_flight_window is still in the air.',
  'elevated'
from (select distinct entity from apex_sync_run) a
on conflict (feed_key) do nothing;

insert into feed_registry
  (feed_key, system, what_it_feeds, source_kind, source_ref,
   blocked_downstream, what_to_do, in_flight_rule, severity_floor)
select
  'matview:' || c.relname, 'matview',
  'The ' || c.relname || ' materialised view',
  'matview', c.relname,
  'Every page reading this view is publishing the figures it held at its last rebuild, '
  || 'with a header that says live. A dashboard that falls quiet looks identical to a '
  || 'dashboard with nothing wrong.',
  'Rebuild it, then find out why its schedule did not fire — the rebuild is the symptom, '
  || 'the missing schedule is the fault.',
  'A materialised view has no in-flight state: a refresh either completed and moved '
  || 'computed_at, or it did not.',
  'elevated'
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='m'
on conflict (feed_key) do nothing;

insert into feed_registry
  (feed_key, system, what_it_feeds, source_kind, source_ref,
   blocked_downstream, what_to_do, in_flight_rule, severity_floor,
   expected_every, cadence_source)
select
  'sheet:' || sc.sheet_key, 'google_sheets',
  sc.title,
  'sheet', sc.sheet_key,
  'This is one of the three company spreadsheets. VIEW AND SYNC ONLY — the platform '
  || 'never writes to it. While it is not arriving, the platform is missing what only '
  || 'the sheet holds.',
  'Check the bridge is signed in to Google and that the file id in sheet_source still '
  || 'resolves. Read-only access is all a sync needs; if the credential carries edit '
  || 'rights that is a defect to report, not a capability to use.',
  'A sheet read either landed rows or it did not; there is no in-flight state.',
  'elevated',
  -- 12 hours is the owner-supplied contract already recorded on sheet_sources
  -- ("sync at least twice a day"). It is a declared contract, not an inference.
  (select make_interval(mins => ss.expected_every_minutes) from sheet_sources ss
    where ss.google_file_id = sc.file_id),
  case when exists (select 1 from sheet_sources ss where ss.google_file_id = sc.file_id)
       then 'declared_in_sheet_contract' else 'UNDECLARED' end
from sheet_source sc
on conflict (feed_key) do nothing;

insert into feed_registry
  (feed_key, system, what_it_feeds, source_kind, source_ref,
   blocked_downstream, what_to_do, in_flight_rule, severity_floor,
   expected_every, cadence_source)
values
 ('bridge:Management_Co', 'bridge',
  'The desktop bridge that reads Google and drains the job queue',
  'heartbeat', 'Management_Co',
  'The bridge is the only path to Google Sheets. If it stops, every sheet feed stops '
  || 'with it and they will each report separately, which is noise. This row is the '
  || 'single upstream cause worth alerting on.',
  'The bridge runs on the Management_Co machine. Check it is switched on and signed in.',
  'A heartbeat either updated or it did not.',
  'critical', interval '15 minutes', 'declared_by_cron_schedule')
on conflict (feed_key) do nothing;

-- ---- Endpoint renames. Without this the detector shouts about "packages" being 106
-- ---- hours dark when "packages (delta)" — the thing that replaced it — ran 2 hours
-- ---- ago. A WRONG LABEL COSTS MORE THAN NO LABEL: one false critical and nobody
-- ---- reads the next real one.
update feed_registry set active = false, superseded_by = 'metrc:packages (delta)',
       retired_reason = 'Replaced by the delta endpoint. Kept for history.'
 where feed_key = 'metrc:packages';
update feed_registry set active = false, superseded_by = 'metrc:plants (delta)',
       retired_reason = 'Replaced by the delta endpoint. Kept for history.'
 where feed_key = 'metrc:plants';
update feed_registry set active = false, superseded_by = 'metrc:harvests (delta)',
       retired_reason = 'Replaced by the delta endpoint. Kept for history.'
 where feed_key = 'metrc:harvests';
update feed_registry set active = false, superseded_by = 'metrc:plantbatches (delta)',
       retired_reason = 'Replaced by the delta endpoint. Kept for history.'
 where feed_key = 'metrc:plantbatches';
update feed_registry set active = false, superseded_by = 'metrc:transfers (delta)',
       retired_reason = 'Replaced by the delta endpoint. Kept for history.'
 where feed_key = 'metrc:transfers';
update feed_registry set active = false, superseded_by = 'metrc:documents (both)',
       retired_reason = 'Replaced by the combined document endpoint. Kept for history.'
 where feed_key in ('metrc:documents (coa)', 'metrc:documents (manifest)');

update feed_registry set active = false,
       retired_reason =
        'Metrc sales endpoints were ruled permanently disabled on 6 August 2026 and '
        || 'have recorded 237 runs with zero successes, all 401. Apex is the source of '
        || 'record for sales, not Metrc. Retired so it cannot generate a daily alert '
        || 'for a decision that has already been taken.'
 where feed_key = 'metrc:sales';

-- ---- Hand-written consequences for the feeds where a generic line is not good enough.
update feed_registry set
  what_it_feeds = 'Metrc laboratory results — certificates of analysis by package',
  blocked_downstream =
    'Certificates cannot be attached to packages. On 12 August this feed being dark was '
    || 'holding 60.04 lb of tested finished product behind a missing certificate, and it '
    || 'surfaced only because an agent went looking. Nothing tested or sold reaches a '
    || 'customer without its certificate, so this feed going dark stops shipping.',
  what_to_do =
    'Run the lab-results sync and read the error. The failure on 6 August was an ON '
    || 'CONFLICT with no matching unique constraint, which is a schema fault, not a '
    || 'Metrc fault — retrying it will not help.',
  severity_floor = 'critical'
 where feed_key = 'metrc:lab results';

update feed_registry set
  blocked_downstream =
    'Package quantities, rooms and lab-testing states freeze. Inventory, the Command '
    || 'Center headline and every on-hand figure become as-of rather than live.',
  severity_floor = 'critical'
 where feed_key = 'metrc:packages (delta)';

update feed_registry set
  blocked_downstream =
    'Custody stops updating: manifests, incoming and outgoing transfers. In-flight '
    || 'material cannot be distinguished from lost material.',
  severity_floor = 'critical'
 where feed_key = 'metrc:transfers (delta)';

update feed_registry set
  blocked_downstream =
    'The live plant count stops moving. It sat at 15,595 for six days once already '
    || 'while the sync was broken and every dashboard read as healthy.',
  severity_floor = 'critical'
 where feed_key = 'metrc:plants (delta)';

update feed_registry set
  what_it_feeds = 'The finished-goods Google Sheet mirror',
  blocked_downstream =
    'The finished-goods sheet is the only place the company records certificate links '
    || 'and real expiration dates for finished product — Metrc returns those fields '
    || 'empty on all 4,496 package rows. The sales team works from it.',
  what_to_do =
    'Check the desktop bridge is running and signed in to Google. VIEW AND SYNC ONLY: '
    || 'never write to the sheet, and if the credential carries edit rights report that '
    || 'as a defect rather than using it.'
 where feed_key = 'metrc:google_sheet_fg';

update feed_registry set
  what_it_feeds = 'The ClickUp workspace mirror',
  blocked_downstream =
    'ClickUp is the owner sandbox. Nothing operational depends on it, and no company '
    || 'data may be pushed to it beyond the approved structure and roster.',
  what_to_do =
    'Low priority. It has never recorded a successful run: 8 attempts, 0 successes. '
    || 'Confirm whether it is meant to be running at all before spending time on it.',
  severity_floor = 'watch'
 where feed_key = 'metrc:clickup_workspace';

-- ---------------------------------------------------------------------------
-- 7. THE RATCHET FOR MATVIEWS THAT CANNOT BE MEASURED AT ALL.
-- ---------------------------------------------------------------------------
-- 18 of 25 materialised views carry no computed_at column, so their age cannot be
-- read: they may be minutes old or a week old and look identical from outside.
-- That is a real gap and it is in v_feed_health as CANNOT MEASURE.
--
-- It must NOT become 18 alerts. A build defect that has been true for weeks is not
-- an outage, and mailing it nightly is exactly how 239 alerts went unread. So it is
-- held as a RATCHET: the count may fall, and the day it rises the check goes red.
-- A check that fires on an improvement is a check somebody switches off.

create table if not exists feed_ratchet (
  ratchet_key text primary key,
  baseline    integer not null,
  measured_on date not null default current_date,
  why         text not null,
  set_by      text not null default 'TG-08'
);

alter table feed_ratchet enable row level security;

drop policy if exists feed_ratchet_read on feed_ratchet;
create policy feed_ratchet_read on feed_ratchet
  for select to authenticated using (true);

drop policy if exists feed_ratchet_admin on feed_ratchet;
create policy feed_ratchet_admin on feed_ratchet
  for all to authenticated
  using (f_role_can('admin_settings')) with check (f_role_can('admin_settings'));

grant select on feed_ratchet to authenticated;
revoke all on feed_ratchet from public, anon;

insert into feed_ratchet (ratchet_key, baseline, why) values
 ('matviews_without_a_clock',
  (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='m'
      and not exists (select 1 from pg_attribute a
                       where a.attrelid=c.oid and a.attname='computed_at'
                         and a.attnum>0 and not a.attisdropped)),
  'Measured 12 August 2026. A materialised view with no computed_at column cannot be '
  || 'aged, so staleness in it is undetectable. Fixing them is a build task, not an '
  || 'alert: this baseline exists so the number can only go down. Adding a new '
  || 'materialised view without a clock turns feeds.matview-clocks-not-getting-worse red.')
on conflict (ratchet_key) do nothing;

commit;
