-- ============================================================================
-- PART 1 - THE CHALLENGER STOPS BEING OPTIONAL  (owner item 7, 8 Aug 2026)
-- ============================================================================
-- brain/INDEX.md records why the Challenger exists: five conclusions were overturned
-- on 7 Aug 2026 and "every catch was accidental". It defaults to refuted and makes a
-- claim earn survival. But it only ever runs when somebody remembers to run it, and on
-- 8 Aug nothing challenged a single finding all day.
--
-- A finding cannot be forced through a challenge by a database constraint without
-- blocking the watchdog that writes it. What CAN be done is make the absence VISIBLE
-- and COUNTED, so unchallenged findings are a number that someone owns rather than an
-- invisible default. Rule H1: ignoring is a decision, not a deletion.

alter table public.watchdog_findings
  add column if not exists challenged_at    timestamptz,
  add column if not exists challenged_by    text,
  add column if not exists challenge_verdict text,
  add column if not exists challenge_notes  text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'watchdog_findings_challenge_verdict_ck') then
    alter table public.watchdog_findings
      add constraint watchdog_findings_challenge_verdict_ck
      check (challenge_verdict is null or challenge_verdict in ('survived','refuted','partly refuted','not challenged'));
  end if;
end $$;

comment on column public.watchdog_findings.challenge_verdict is
  'Result of an adversarial challenge: survived / refuted / partly refuted. NULL means '
  'nobody has tried to refute this finding, which is not the same as it being true. '
  'Added 8 Aug 2026 - the Challenger existed but ran only when remembered.';

-- Unchallenged findings, worst first. A finding nobody tried to break is a claim.
create or replace view public.v_unchallenged_findings as
select f.id, f.fingerprint, f.severity, f.what, f.the_arithmetic, f.record_count,
       f.who_is_accountable,
       'Nobody has attempted to refute this. Per brain/INDEX.md the Challenger defaults '
       'to REFUTED and makes a claim earn survival - an unchallenged finding has not '
       'earned anything yet.' as why_it_matters
from public.watchdog_findings f
where f.challenge_verdict is null
order by case f.severity when 'critical' then 1 when 'elevated' then 2 else 3 end,
         f.record_count desc nulls last;

comment on view public.v_unchallenged_findings is
  'Findings that have never been adversarially challenged. Counted by the nightly check '
  'so the number is owned rather than invisible.';

-- ============================================================================
-- PART 2 - THE SENTINEL  (owner item 6, 8 Aug 2026)
-- ============================================================================
-- brain/SENTINEL_SPEC.md: commissioned after the Metrc sync was DEAD FOR 7 HOURS
-- 16 MINUTES while every dashboard reported success. Specced 7 Aug, never built.
--
-- Every other check in this platform asks "is what I can see wrong?" The Sentinel asks
-- the opposite and much harder question: "has something stopped speaking?" Silence is
-- the failure mode that all success-reporting misses, because a thing that has died
-- reports nothing at all - and nothing looks exactly like nothing wrong.
--
-- Thresholds are ROWS, not code (rule G1). Probes are fixed in the function on purpose:
-- storing SQL in a table and executing it would make a config table into a code path.

create table if not exists public.sentinel_expectation (
  source_key           text primary key,
  label                text not null,
  max_silence_minutes  integer not null check (max_silence_minutes > 0),
  enabled              boolean not null default true,
  why_it_matters       text not null,
  set_by               text,
  set_at               timestamptz not null default now()
);

alter table public.sentinel_expectation enable row level security;

comment on table public.sentinel_expectation is
  'What must keep speaking, and how long silence is allowed to last. Owner-set rows, '
  'never hardcoded (rule G1). A source absent from this table is NOT watched.';

insert into public.sentinel_expectation (source_key, label, max_silence_minutes, why_it_matters, set_by)
values
  ('metrc_sync', 'Metrc synchronisation', 180,
   'The reason the Sentinel exists: the sync was dead for 7h16m on 7 Aug 2026 while every dashboard reported success. Metrc is the legal record and this platform is its mirror; a silent mirror silently diverges from the state record.', 'agent, 8 Aug 2026'),
  ('watchdog', 'The watchdog sweep', 900,
   'The watchdog raises every finding the owner sees. If it stops, the platform looks calm precisely because nothing is looking.', 'agent, 8 Aug 2026'),
  ('platform_state', 'Nightly platform self-check', 1800,
   'Security posture, RLS and anon exposure are measured here. Silence means the security numbers on the handoff are frozen at their last value while reality moves.', 'agent, 8 Aug 2026'),
  ('page_canary', 'Page canary sweep', 120,
   'Checks all pages for missing, empty, slow or erroring sources. Its silence hides broken pages behind honest-looking empty states.', 'agent, 8 Aug 2026')
on conflict (source_key) do nothing;

create or replace function public.f_sentinel_check()
returns table(source_key text, label text, last_seen timestamptz, silent_minutes integer,
              allowed_minutes integer, verdict text, why_it_matters text)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare e record; seen timestamptz; mins integer;
begin
  for e in select * from sentinel_expectation where enabled order by source_key loop
    seen := null;

    /* Probes are fixed here rather than stored as SQL in the config table: a threshold
       is configuration, an executable query is code, and putting code in a config table
       is how a config table becomes an attack surface. */
    if e.source_key = 'metrc_sync' then
      select max(coalesce(finished_at, started_at)) into seen from metrc_sync_runs;
    elsif e.source_key = 'watchdog' then
      select max(started_at) into seen from watchdog_runs;
    elsif e.source_key = 'platform_state' then
      select max(taken_at) into seen from platform_state;
    elsif e.source_key = 'page_canary' then
      select max(started_at) into seen from canary_runs;
    end if;

    mins := case when seen is null then null
                 else floor(extract(epoch from (now() - seen)) / 60)::integer end;

    source_key := e.source_key;
    label := e.label;
    last_seen := seen;
    silent_minutes := mins;
    allowed_minutes := e.max_silence_minutes;
    why_it_matters := e.why_it_matters;
    verdict := case
      when seen is null then 'NEVER SPOKEN'
      when mins > e.max_silence_minutes then 'SILENT'
      else 'ok' end;
    return next;
  end loop;
end $$;

comment on function public.f_sentinel_check() is
  'The dead-man''s switch. Reports any source that has stopped speaking for longer than '
  'its owner-set limit. Built 8 Aug 2026 from brain/SENTINEL_SPEC.md.';

grant execute on function public.f_sentinel_check() to tg_desktop_reader;
grant execute on function public.tg_handoff_state_md() to authenticated;
grant select on public.v_unchallenged_findings to authenticated;;
