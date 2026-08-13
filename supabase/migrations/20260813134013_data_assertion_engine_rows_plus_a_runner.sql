/* ============================================================================
 * data_assertion — the platform's first assertions about the DATA.
 * Agent W, 13 Aug 2026.
 *
 * WHY THIS EXISTS
 * This platform has 40 code gates and 7 code tests and, until this migration,
 * not one assertion about production data. A code test proves a parser works on
 * a fixture. A data assertion proves production is sane RIGHT NOW. Those are
 * different questions and only the first had ever been asked.
 *
 * The defect that forced it ran from 8 Feb to 13 Aug 2026: v_schedule_compliance
 * matched a scheduled pull to a harvest by date window with no room predicate,
 * so min() picked another room's takedown. 43 published late-days against 210
 * real. Nothing in the platform could observe it, because nothing ever asserted
 * anything about the rows.
 *
 * ROWS PLUS A RUNNER. Adding an assertion is an INSERT, not a deploy.
 *
 * HOW THE FIXTURES ARE HONEST — the part that matters
 * The obvious design is to store the production query in one column and a
 * hand-written "fixture query" in another. That design is a lie waiting to
 * happen: the fixture re-implements the logic, the two drift, and the fixture
 * ends up proving something the real check no longer does. This repo has been
 * burned by exactly that (guard-fixtures.mjs: "a fixture that does not match the
 * shape of the work proves the wrong thing").
 *
 * So there is ONE SQL text per assertion and it is run three times:
 *   - against production                       (search_path = public)
 *   - against a schema with a PLANTED DEFECT   (search_path = <pos>, public)
 *   - against a schema of LEGITIMATE data      (search_path = <neg>, public)
 * The fixture schemas hold relations that SHADOW the production ones by name.
 * Identical text, different rows. The check cannot pass its fixtures while
 * having rotted, because the fixtures exercise the very bytes that run live.
 *
 * SELF-DEFENCE AGAINST A FIXTURE THAT SILENTLY READS PRODUCTION
 * If a fixture schema forgets to shadow a relation, the name falls through to
 * public and the fixture quietly tests production instead. Two things stop that:
 *   1. fixture_shadows[] names every relation the fixture must provide, and the
 *      prover refuses to run if one is missing.
 *   2. The positive half must return > 0 rows. Production is clean, so a fixture
 *      that fell through to production returns 0 and FAILS. The leak is loud.
 *
 * SECURITY_INVOKER ON PURPOSE
 * These functions execute SQL text read from a table. SECURITY DEFINER here
 * would be a privilege-escalation shape — anyone who could write a row could
 * run arbitrary SQL as the owner. They are INVOKER, the table is RLS'd with no
 * write policy, and writes are revoked from authenticated and anon outright.
 * Cron runs as postgres, which is the only caller that needs to write findings.
 * ========================================================================== */

create table if not exists data_assertion (
  assertion_key      text primary key,
  title              text not null,
  domain             text not null,
  severity           text not null default 'elevated'
                     check (severity in ('watch','elevated','critical')),

  /* Returns ZERO rows when healthy. Every row it returns is one violation.
     Contract: it must expose columns named subject and detail. */
  violation_sql      text not null,

  /* The ratchet. Violations above this raise a finding. Default 0: no debt.
     A non-zero value is grandfathered debt and needs a reason. */
  max_allowed        integer not null default 0 check (max_allowed >= 0),
  allowance_reason   text,

  /* The two halves. Schema names whose relations shadow production by name. */
  fixture_positive_schema text,
  fixture_negative_schema text,
  /* Every relation the fixture schemas MUST provide. Missing one means the
     fixture silently read production. */
  fixture_shadows    text[] not null default '{}',
  fixture_positive_case text,
  fixture_negative_case text,
  fixture_proven_at  timestamptz,
  fixture_last_result text,

  what_it_proves     text not null,
  why_it_matters     text not null,
  enabled            boolean not null default true,
  owner_agent        text not null default 'Agent W',
  added_by           text not null default 'Agent W',
  added_at           timestamptz not null default now(),
  note               text
);

comment on table data_assertion is
  'Assertions about PRODUCTION DATA, as rows. Adding one is an INSERT. Each row''s '
  'violation_sql returns zero rows when healthy; the identical text is re-run against '
  'a planted-defect schema (must return rows) and a legitimate schema (must return none), '
  'so the fixture exercises the same bytes that run live. Agent W, 13 Aug 2026.';

comment on column data_assertion.violation_sql is
  'Zero rows when healthy. MUST return columns subject and detail. Executed verbatim '
  'against production and against both fixture schemas — never re-written for the fixture.';
comment on column data_assertion.fixture_shadows is
  'Every relation the fixture schemas must shadow. If one is missing the fixture falls '
  'through to production and quietly tests the wrong thing; the prover refuses instead.';
comment on column data_assertion.max_allowed is
  'The ratchet floor. Violations above this raise a finding. 0 means no debt is accepted. '
  'Any non-zero value requires allowance_reason and may fall, never rise.';

alter table data_assertion enable row level security;

/* Append-only evidence. Every run of every assertion, whether it found anything
   or not — a check with no run history cannot be distinguished from a check that
   silently stopped running, which is the failure this whole lane exists for. */
create table if not exists data_assertion_run (
  id            bigserial primary key,
  assertion_key text not null references data_assertion(assertion_key) on update cascade,
  ran_at        timestamptz not null default now(),
  ran_by        text not null default 'cron',
  violations    integer,
  max_allowed   integer,
  verdict       text not null check (verdict in ('pass','fail','error')),
  duration_ms   integer,
  evidence      jsonb,
  error_text    text
);
create index if not exists data_assertion_run_key_time_idx
  on data_assertion_run (assertion_key, ran_at desc);

comment on table data_assertion_run is
  'Append-only run log for data_assertion. Silence is the thing being guarded against, '
  'so a pass is recorded as loudly as a fail.';

alter table data_assertion_run enable row level security;

/* Read for the app, writes only for the roles that own the machinery. */
do $$
begin
  if not exists (select 1 from pg_policy where polrelid='data_assertion'::regclass
                 and polname='data_assertion_read') then
    create policy data_assertion_read on data_assertion for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policy where polrelid='data_assertion_run'::regclass
                 and polname='data_assertion_run_read') then
    create policy data_assertion_run_read on data_assertion_run for select to authenticated using (true);
  end if;
end $$;

revoke insert, update, delete on data_assertion     from authenticated, anon;
revoke insert, update, delete on data_assertion_run from authenticated, anon;
revoke all on data_assertion     from anon;
revoke all on data_assertion_run from anon;
grant select on data_assertion, data_assertion_run to authenticated;

/* ---------------------------------------------------------------------------
 * THE GATE. An assertion may not be enabled without both halves named.
 * Mirrors trg_require_fixture on checker_registry, and for the same reason: a
 * check nobody has watched fail is a hypothesis.
 * ------------------------------------------------------------------------- */
create or replace function tg_require_assertion_fixture()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
begin
  if not new.enabled then
    return new;                       -- a disabled assertion harms nobody
  end if;

  if coalesce(btrim(new.fixture_positive_schema),'') = '' then
    raise exception
      'Assertion % has no POSITIVE fixture. Name the schema holding a planted violation.',
      new.assertion_key
      using hint = 'The positive half is the only proof the assertion can fire at all. '
                   'Create a schema whose relations shadow production, plant the defect, '
                   'and set fixture_positive_schema.';
  end if;

  if coalesce(btrim(new.fixture_negative_schema),'') = '' then
    raise exception
      'Assertion % has no NEGATIVE fixture. Name the schema holding a legitimate case.',
      new.assertion_key
      using hint = 'A wrong label costs more than no label. All six defects in the 9 Aug '
                   'register would have been caught by the negative half alone.';
  end if;

  if coalesce(array_length(new.fixture_shadows,1),0) = 0 then
    raise exception
      'Assertion % names no shadowed relations, so a fixture could read production silently.',
      new.assertion_key
      using hint = 'List every relation the fixture schemas must provide in fixture_shadows.';
  end if;

  if coalesce(btrim(new.fixture_positive_case),'') = ''
     or coalesce(btrim(new.fixture_negative_case),'') = '' then
    raise exception
      'Assertion % must say in words what each half demonstrates.', new.assertion_key
      using hint = 'fixture_positive_case: the real violation it must fire on. '
                   'fixture_negative_case: the legitimate thing it must stay quiet on.';
  end if;

  if new.max_allowed > 0 and length(btrim(coalesce(new.allowance_reason,''))) < 25 then
    raise exception
      'Assertion % tolerates % violations without saying why.', new.assertion_key, new.max_allowed
      using hint = 'A non-zero allowance is recorded debt, not a shrug. Say what the tolerated '
                   'rows are and what would let the number fall.';
  end if;

  return new;
end $$;

drop trigger if exists trg_require_assertion_fixture on data_assertion;
create trigger trg_require_assertion_fixture
  before insert or update on data_assertion
  for each row execute function tg_require_assertion_fixture();

/* The allowance is a ratchet: it may fall and may never rise. */
create or replace function tg_assertion_allowance_ratchet()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
begin
  if new.max_allowed > old.max_allowed then
    raise exception
      'Assertion %: tolerated violations may not rise from % to %.',
      new.assertion_key, old.max_allowed, new.max_allowed
      using hint = 'The count may fall and may never rise. If production genuinely got worse, '
                   'that is a finding to fix, not a baseline to bump.';
  end if;
  return new;
end $$;

drop trigger if exists trg_assertion_allowance_ratchet on data_assertion;
create trigger trg_assertion_allowance_ratchet
  before update on data_assertion
  for each row execute function tg_assertion_allowance_ratchet();
;
