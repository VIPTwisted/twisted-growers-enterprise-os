-- Owner-directed, 8 Aug 2026. HANDOFF.md is the single source of truth for STATE, and
-- it has been wrong. On 7 Aug its section 6 claimed anonymous access was closed when 30
-- relations were returning real customer, manifest and money data. Its own preface now
-- warns "treat every count in this file as indicative, not current" - which is an
-- admission that the numbers cannot be trusted, written into the document of record.
--
-- platform_state's own comment already says the handoff should be GENERATED from its
-- latest row rather than hand-written. This is that generator. Numbers come from the
-- system; judgement stays human.
create or replace function public.tg_handoff_state_md()
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s record;
  out text;
  verdict text;
begin
  select * into s from platform_state order by taken_at desc limit 1;
  if s is null then
    return '_No platform_state row exists yet. Run `select * from tg_nightly_platform_check();`_';
  end if;

  verdict := case
    when s.anon_relations > 0 or s.anon_functions > 0 or s.tables_without_rls > 0
      then '**SECURITY: FAILING.** Anonymous access or unprotected tables are present. Stop and fix before anything else.'
    when s.nav_broken > 0 or s.matviews_unpopulated > 0
      then '**DEGRADED.** Pages or materialized views are broken; figures may render empty rather than erroring.'
    else '**Security invariants hold.** Zero anon reach, zero tables without row-level security.'
  end;

  out :=
    '<!-- GENERATED: tg_handoff_state_md(). Do not hand-edit between these markers. -->' || E'\n' ||
    '_Measured ' || to_char(s.taken_at at time zone 'UTC', 'DD Mon YYYY HH24:MI') || ' UTC, direct from the live database._' || E'\n\n' ||
    verdict || E'\n\n' ||
    '| Measure | Value | Should be |' || E'\n' ||
    '|---|---:|---|' || E'\n' ||
    '| Base tables | ' || s.base_tables || ' | — |' || E'\n' ||
    '| Views | ' || s.views || ' | — |' || E'\n' ||
    '| Materialized views | ' || s.matviews || ' | — |' || E'\n' ||
    '| Matviews unpopulated | ' || s.matviews_unpopulated || ' | 0 |' || E'\n' ||
    '| Relations readable by anon | ' || s.anon_relations || ' | 0 |' || E'\n' ||
    '| Functions executable by anon | ' || s.anon_functions || ' | 0 |' || E'\n' ||
    '| Of those, functions that WRITE | ' || s.anon_writing_functions || ' | 0 |' || E'\n' ||
    '| Tables without row-level security | ' || s.tables_without_rls || ' | 0 |' || E'\n' ||
    '| SECURITY DEFINER with mutable search_path | ' || s.secdef_mutable_path || ' | 0 |' || E'\n' ||
    '| Menu entries enabled | ' || s.nav_enabled || ' | — |' || E'\n' ||
    '| Menu entries pointing nowhere | ' || s.nav_broken || ' | 0 |' || E'\n' ||
    '| Scheduled jobs | ' || s.cron_jobs || ' | — |' || E'\n' ||
    '| Jobs failing on their latest run | ' || s.cron_failing || ' | 0 |' || E'\n' ||
    '| Jobs that failed at least once in 24h | ' || coalesce(s.cron_failing_24h::text, 'not yet measured') || ' | 0 |' || E'\n' ||
    '| Tiles with no owner-set target | ' || s.tiles_without_target || ' of ' || s.tiles_total || ' | 0 |' || E'\n' ||
    '| **Questions waiting on the owner** | **' || s.open_questions_unanswered || '** | 0 |' || E'\n' ||
    '| Go-live items open | ' || s.golive_open || ' | 0 |' || E'\n' ||
    '| Staff without an account | ' || greatest(s.active_employees - s.app_users, 0) || ' | 0 |' || E'\n\n' ||
    '_Every figure above is read from `platform_state`, the append-only nightly self-check._' || E'\n' ||
    '_Regenerate with `node tools/gen-handoff.mjs`. Never retype these by hand: the numbers_' || E'\n' ||
    '_move daily, and a hand-written count in this file was once the opposite of the truth._' || E'\n' ||
    '<!-- END GENERATED -->';

  return out;
end $$;

comment on function public.tg_handoff_state_md() is
  'Renders the measured-state section of HANDOFF.md as markdown, from the latest '
  'platform_state row. Added 8 Aug 2026 so state stops being retyped by hand.';;
