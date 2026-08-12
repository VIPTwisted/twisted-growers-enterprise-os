-- ============================================================================
-- THE FULL-SYSTEM FORENSIC AUDITOR — the spine
--
-- WHAT WAS ALREADY TRUE. The platform had FIVE separate memories of its own
-- correctness -- verification_runs (121 rows, 17 checks), watchdog_findings (86),
-- canary_runs (518 pages every 20 min), tg_reconcile_tiles() (not persisted at
-- all), and 21 build gates whose results lived only in CI logs. Five memories,
-- and no way to answer one question: is the platform compliant RIGHT NOW.
--
-- This adds no new opinions. It adds the one place they all write to, plus the
-- two things none of them had: a COVERAGE MAP and a HEARTBEAT.
--
-- THE FOUR LAWS, encoded here rather than written down and hoped for:
--
--  LAW 1 — NO VERDICT WITHOUT A DENOMINATOR. "PASS" is unfalsifiable. "PASS,
--    2690 of 2690" is falsifiable, and if the denominator quietly drops to 1200
--    next month that is visible. Enforced by a CHECK constraint: a PASS or FAIL
--    must carry a denominator. This single rule kills swallowed errors, vacuous
--    checks, stale success and silent truncation at once.
--
--  LAW 2 — FRESHNESS IS PART OF THE VERDICT. Every row states how old the data
--    it examined was. On 8 Aug 2026 metrc_items for MC281714 was two days stale
--    while MP281909 synced that morning, and every status said "succeeded".
--    A check over stale data is not a passing check.
--
--  LAW 3 — UNCHECKED IS A VERDICT, NOT AN ABSENCE. 252 views bypassed RLS for
--    a full day while 21 gates reported green, because nothing was looking there.
--    Silence must be visible or green means "not examined".
--
--  LAW 4 — SILENCE ALARMS LOUDER THAN FAILURE. verification-suite sat active on
--    a twice-daily schedule and never fired once, and nothing noticed. A dark
--    check is indistinguishable from a passing one. Hence checker_registry
--    .expected_interval and v_auditor_heartbeat.
--
-- AND THE POINT OF THE WHOLE THING: closure requires a passing re-run, not a
-- claim. f_close_finding REFUSES to close unless a clean ledger row exists for
-- the same policy and subject, recorded AFTER the finding was raised. An agent
-- cannot mark its own homework. That is the forcing function.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1 · POLICY REGISTRY — every rule becomes a row
--
-- 50 rules live in CLAUDE.md as prose; 27 have something mechanical behind them
-- and 23 hold only while somebody remembers them. A rule in prose cannot be
-- scheduled, measured or reported on.
--
-- plain_english is deliberately left NULL here. tools/checks/rule-ledger.mjs
-- already parses CLAUDE.md and is the loader -- writing 50 descriptions by hand
-- in a migration would be inventing text the rules do not say (rule A1).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists policy_registry (
  policy_key      text primary key,
  section         text not null,
  title           text,
  plain_english   text,
  severity        text not null default 'elevated'
                    check (severity in ('critical','elevated','watch')),
  subject_kind    text,
  owner_role      text,
  enforced        boolean not null default false,
  enforcers       text[] not null default '{}',
  effective_from  date not null default current_date,
  active          boolean not null default true,
  updated_at      timestamptz not null default now()
);
alter table policy_registry enable row level security;

comment on table policy_registry is
'Every rule in CLAUDE.md as a row. enforced/enforcers are maintained by tools/checks/rule-ledger.mjs, which parses CLAUDE.md -- do not hand-edit them. A rule with enforced=false is held only by memory.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2 · CHECKER REGISTRY — and LAW 4, silence is a failure state
--
-- expected_interval is what makes a dark checker detectable. fixture_proves_it_fails
-- records whether anyone has ever SEEN this check fail: guard-fixtures.mjs proves
-- 27 SQL cases, but the baseline gate passed for a day as a pure clock because
-- nobody had watched it fail. A check nobody has seen fail is a rumour.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists checker_registry (
  checker_key             text primary key,
  title                   text not null,
  tier                    text not null
                            check (tier in ('prevent','gate','detect','prove')),
  runs_where              text not null,
  expected_interval       interval,
  policy_keys             text[] not null default '{}',
  subject_kind            text,
  fixture_proves_it_fails boolean not null default false,
  enabled                 boolean not null default true,
  note                    text,
  added_on                date not null default current_date
);
alter table checker_registry enable row level security;

comment on table checker_registry is
'Every mechanism that can produce a verdict, across all four tiers: prevent (hooks, triggers, constraints), gate (the 21 build gates), detect (crons, canary, reconciliation), prove (independent two-source derivation). expected_interval null means on-demand only and is exempt from the heartbeat.';

comment on column checker_registry.fixture_proves_it_fails is
'Has this check ever been SEEN to fail on a deliberate fixture? False means it is unproven and may be vacuous. The baseline gate printed PASS for a day while the schema drifted 16 tables, because it checked a clock.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 3 · CONFORMANCE LEDGER — the single spine. Append-only (rule H2).
--
-- LAW 1 is a constraint, not a convention: a PASS or FAIL without a denominator
-- is rejected by the database. UNCHECKED and DEGRADED are exempt, because their
-- whole meaning is that no denominator was obtainable.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists conformance_ledger (
  id            bigserial primary key,
  ran_at        timestamptz not null default now(),
  run_id        uuid,
  checker_key   text not null,
  policy_key    text,
  subject_kind  text not null,
  subject_ref   text not null,
  verdict       text not null check (verdict in
                  ('PASS','FAIL','DISAGREE','UNCHECKED','DEGRADED')),
  numerator     numeric,
  denominator   numeric,
  value_a       numeric,
  value_b       numeric,
  pct_apart     numeric,
  data_as_of    timestamptz,
  pounds        numeric,
  dollars       numeric,
  the_arithmetic text,
  drill         text,
  evidence      jsonb,
  note          text,

  -- LAW 1, enforced.
  constraint law1_denominator_required check (
    verdict not in ('PASS','FAIL') or denominator is not null
  ),
  -- A DISAGREE that does not say what disagreed is not a finding, it is a mood.
  constraint disagree_carries_both_values check (
    verdict <> 'DISAGREE' or (value_a is not null and value_b is not null)
  )
);
create index if not exists idx_cl_recent   on conformance_ledger (ran_at desc);
create index if not exists idx_cl_subject  on conformance_ledger (subject_kind, subject_ref, ran_at desc);
create index if not exists idx_cl_checker  on conformance_ledger (checker_key, ran_at desc);
create index if not exists idx_cl_verdict  on conformance_ledger (verdict) where verdict in ('FAIL','DISAGREE');
alter table conformance_ledger enable row level security;

comment on table conformance_ledger is
'One append-only row per (checker x policy x subject x run). Every tier writes here. LAW 1 is a CHECK constraint: PASS and FAIL must carry a denominator, because "PASS" alone is unfalsifiable. LAW 2: data_as_of records how old the examined data was -- a check over stale data is not a passing check.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4 · REMEDIATION — a finding is a work order with a clock, not a notification
--
-- watchdog_findings is append-only forensic evidence and must stay that way, so
-- mutable state lives here, keyed on its fingerprint.
--
-- closed_by_ledger_id is the forcing function. It is a FOREIGN KEY to a real
-- passing ledger row. There is no way to write "fixed" without one.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists finding_remediation (
  fingerprint         text primary key,
  policy_key          text,
  subject_kind        text,
  subject_ref         text,
  severity            text not null default 'elevated'
                        check (severity in ('critical','elevated','watch')),
  owner_lane          text,
  owner_name          text,
  raised_at           timestamptz not null default now(),
  due_by              timestamptz,
  state               text not null default 'open'
                        check (state in ('open','claimed','fixed_pending_proof','closed','accepted_risk')),
  claimed_at          timestamptz,
  claimed_by          text,
  closed_at           timestamptz,
  closed_by_ledger_id bigint references conformance_ledger(id),
  reopened_count      integer not null default 0,
  accepted_reason     text,
  accepted_by         text,
  updated_at          timestamptz not null default now(),

  -- Closure is impossible without a ledger row proving the check now passes.
  constraint closure_requires_proof check (
    state <> 'closed' or closed_by_ledger_id is not null
  ),
  -- Accepting risk is allowed, but never silently.
  constraint accepted_risk_requires_reason check (
    state <> 'accepted_risk'
    or (accepted_reason is not null and length(accepted_reason) >= 40
        and accepted_by is not null)
  )
);
create index if not exists idx_fr_open on finding_remediation (state, due_by)
  where state not in ('closed','accepted_risk');
alter table finding_remediation enable row level security;

comment on table finding_remediation is
'Mutable state for findings, keyed on the append-only watchdog_findings.fingerprint. state=closed is IMPOSSIBLE without closed_by_ledger_id pointing at a real passing conformance_ledger row -- an agent cannot mark its own homework. accepted_risk needs 40 characters of reason and a named person, because a rule with no recorded exception gets worked around silently.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5 · Read policies. Mirrors the platform's existing shape: signed-in staff read,
-- nobody writes through the API. Writes come from the checkers, which run as
-- privileged roles.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['policy_registry','checker_registry',
                           'conformance_ledger','finding_remediation']
  loop
    if not exists (select 1 from pg_policy
                   where polrelid = ('public.'||t)::regclass and polname = t||'_read') then
      execute format('create policy %I on public.%I for select to authenticated using (true)',
                     t||'_read', t);
    end if;
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6 · H2 — the ledger is forensic evidence. Reuse the existing trigger.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_h2_no_delete on public.conformance_ledger;
create trigger trg_h2_no_delete before delete on public.conformance_ledger
  for each row execute function tg_block_forensic_delete();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7 · f_close_finding — THE forcing function.
--
-- Refuses to close unless a PASS exists for the same policy and subject, dated
-- AFTER the finding was raised. "I fixed it" is not evidence. The check passing
-- again is evidence.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function f_close_finding(p_fingerprint text, p_closed_by text default null)
returns text language plpgsql security definer set search_path = public, pg_temp
as $function$
declare r finding_remediation; proof bigint; proof_at timestamptz;
begin
  select * into r from finding_remediation where fingerprint = p_fingerprint;
  if not found then
    raise exception 'No finding with fingerprint %', p_fingerprint using errcode='no_data_found';
  end if;
  if r.state = 'closed' then
    return 'Already closed at ' || r.closed_at;
  end if;

  select cl.id, cl.ran_at into proof, proof_at
  from conformance_ledger cl
  where cl.verdict = 'PASS'
    and cl.ran_at > r.raised_at
    and cl.subject_kind = r.subject_kind
    and cl.subject_ref  = r.subject_ref
    and (r.policy_key is null or cl.policy_key = r.policy_key)
  order by cl.ran_at desc
  limit 1;

  if proof is null then
    raise exception '%', 'CANNOT CLOSE ' || p_fingerprint || E'.\n' ||
      'Closure requires the check that raised this finding to PASS again, recorded in ' ||
      'conformance_ledger after ' || r.raised_at || '. No such row exists.' || E'\n' ||
      'Claiming a fix is not evidence; the check passing is. Re-run the checker for ' ||
      coalesce(r.subject_kind,'?') || ' / ' || coalesce(r.subject_ref,'?') ||
      ' and try again.' || E'\n' ||
      'If this finding should stand as an accepted risk instead, set state=''accepted_risk'' ' ||
      'with 40+ characters of accepted_reason and a named accepted_by.'
      using errcode = 'check_violation';
  end if;

  update finding_remediation
     set state = 'closed', closed_at = now(), closed_by_ledger_id = proof,
         claimed_by = coalesce(p_closed_by, claimed_by), updated_at = now()
   where fingerprint = p_fingerprint;

  return 'Closed. Proof: conformance_ledger row ' || proof || ' PASSED at ' || proof_at || '.';
end $function$;

revoke all on function f_close_finding(text, text) from public, anon;
grant execute on function f_close_finding(text, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8 · LAW 4 — the heartbeat. Which checkers have gone dark.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view v_auditor_heartbeat as
select c.checker_key, c.title, c.tier, c.runs_where, c.expected_interval,
       c.enabled,
       l.last_run,
       case when l.last_run is null then null
            else now() - l.last_run end as since_last_run,
       c.fixture_proves_it_fails,
       case
         when not c.enabled                       then 'DISABLED'
         when l.last_run is null                  then 'NEVER RUN'
         when c.expected_interval is null         then 'ON DEMAND'
         when now() - l.last_run
              > c.expected_interval * 2           then 'DARK'
         when now() - l.last_run
              > c.expected_interval               then 'LATE'
         else 'ALIVE'
       end as heartbeat,
       case
         when l.last_run is null and c.enabled then
           'Registered, enabled, and has NEVER produced a verdict. A dark check is '
           || 'indistinguishable from a passing one. verification-suite sat active on a '
           || 'twice-daily schedule and never fired once, and nothing noticed.'
         when not c.fixture_proves_it_fails then
           'Has run, but nobody has ever seen it FAIL on a deliberate fixture. Unproven '
           || 'checks can be vacuous -- the schema baseline gate printed PASS for a day '
           || 'while production drifted 16 tables, because it only read a clock.'
         else null
       end as why_it_matters
from checker_registry c
left join (select checker_key, max(ran_at) as last_run
             from conformance_ledger group by checker_key) l
       on l.checker_key = c.checker_key;

comment on view v_auditor_heartbeat is
'LAW 4: silence alarms louder than failure. NEVER RUN and DARK are the two states that make a green platform a lie.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 9 · LAW 3 — coverage. What has never been checked by anything.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view v_conformance_coverage as
with subjects as (
  select 'table'::text as subject_kind, c.relname as subject_ref
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind='r'
  union all
  select 'view', c.relname
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relkind in ('v','m')
  union all
  select 'metric', metric_key from metric_registry where active
  union all
  select 'policy', policy_key from policy_registry where active
),
checked as (
  select subject_kind, subject_ref,
         max(ran_at) as last_verdict_at,
         count(*)    as verdicts,
         count(*) filter (where verdict in ('FAIL','DISAGREE')) as open_problems
    from conformance_ledger
   group by subject_kind, subject_ref
)
select s.subject_kind, s.subject_ref,
       coalesce(c.verdicts, 0)      as verdicts,
       c.last_verdict_at,
       coalesce(c.open_problems, 0) as open_problems,
       case when c.subject_ref is null then 'NEVER CHECKED' else 'covered' end as coverage
from subjects s
left join checked c
       on c.subject_kind = s.subject_kind and c.subject_ref = s.subject_ref;

comment on view v_conformance_coverage is
'LAW 3: UNCHECKED is a verdict, not an absence. 252 views bypassed row-level security for a full day while 21 gates reported green, because nothing was looking there. This view is the honest denominator for the whole platform.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 10 · The single answer. What the owner reads.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view v_auditor_verdict as
select
  (select count(*) from v_conformance_coverage where coverage = 'NEVER CHECKED') as subjects_never_checked,
  (select count(*) from v_conformance_coverage)                                  as subjects_total,
  round(100.0 * (select count(*) from v_conformance_coverage where coverage <> 'NEVER CHECKED')
              / nullif((select count(*) from v_conformance_coverage),0), 1)      as coverage_pct,
  (select count(*) from v_auditor_heartbeat where heartbeat in ('NEVER RUN','DARK')) as checkers_dark,
  (select count(*) from v_auditor_heartbeat where not fixture_proves_it_fails
                                              and enabled)                       as checkers_unproven,
  (select count(*) from policy_registry where active and not enforced)            as policies_on_memory_only,
  (select count(*) from finding_remediation
    where state not in ('closed','accepted_risk'))                               as findings_open,
  (select count(*) from finding_remediation
    where state not in ('closed','accepted_risk') and due_by < now())             as findings_overdue,
  (select count(*) from finding_remediation
    where state not in ('closed','accepted_risk') and severity='critical')        as findings_critical,
  (select round(sum(pounds)::numeric,1) from conformance_ledger cl
    where cl.verdict in ('FAIL','DISAGREE')
      and cl.ran_at > now() - interval '24 hours')                               as pounds_in_question_24h,
  (select round(sum(dollars)::numeric,2) from conformance_ledger cl
    where cl.verdict in ('FAIL','DISAGREE')
      and cl.ran_at > now() - interval '24 hours')                               as dollars_in_question_24h;

comment on view v_auditor_verdict is
'The one row the owner reads. coverage_pct is deliberately the FIRST number, because a platform running green checks over 40 per cent of itself is more dangerous than one that admits its blind spots.';;
