/* THE CERTIFIED-MATCH RULE GETS A WATCHDOG.
   Owner, 29 August 2026: "Certified-match rule is locked: OS figure = Metrc
   grid or named exception."
   NOT APPLIED — held for APPLY. Runs after the licence-in-key fix beside it.

   ─────────────────────────────────────────────────────────────────────────────
   A LOCKED RULE THAT NOTHING MEASURES IS A PREFERENCE.

   This platform has locked rules before and left them to whoever remembered
   them. The deploy watcher written because the owner asked "WHERE ARE THE
   WATCHERS AND GUARD" sat syntactically invalid and never ran once. So the rule
   is registered where it is executed on a schedule, with both halves of its
   detector proved, rather than written into a document.

   WHAT IT ASSERTS. For every Metrc Inventory Point in Time export registered in
   source_export, the number of rows this platform holds for that (as-of,
   licence) equals the number the Metrc grid itself states. Any difference is a
   violation unless somebody has named it in reconciliation_exception.

   MEASURED TODAY, read-only, before this was written:

     MP281909  1 Jan 2024   grid     0   OS     0   MATCH
     MC281714  1 Jan 2025   grid 2,103   OS 2,103   MATCH
     MC281714 31 Dec 2025   grid 3,364   OS 3,364   MATCH
     MC281714  6 Aug 2026   grid 4,520   OS 4,520   MATCH
     MP281909  6 Aug 2026   grid   648   OS   643   BREACH  (-5)

     OS positions with no Metrc file behind them: 0

   One breach, and it is the one the migration beside this one repairs. This is
   registered at max_allowed = 0 deliberately: if it is applied before that fix
   it fires immediately, which is correct. A watchdog that is quiet about a
   known breach is the defect, not the courtesy.

   THE COUNT IS THE ONLY THING COMPARED, AND THAT IS HONEST. The Metrc grid
   states a record count and nothing else; the report carries no quantity. So
   this proves the population matches. It does not and cannot prove the contents
   match, and it does not pretend to.

   SELF-PROVING AT APPLY. The fixtures below are built, both halves are run, and
   the assertion is registered ONLY if the positive half fires and the negative
   half stays silent. A detector that cannot fail proves nothing, and one that
   fires on correct data is worse than none.
*/

do $$
declare
  k_key constant text := 'pit.os_matches_the_metrc_grid';
  k_sql constant text := $q$
    with grid as (
      select se.licence,
             to_date(se.period_stated, 'MM/DD/YYYY') as as_of,
             se.rows_in_file  as grid_says,
             se.file_name
      from source_export se
      where se.report = 'Inventory Point in Time'
        and se.period_stated ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'),
    os as (
      select licence, as_of_date as as_of, count(*)::int as os_says
      from metrc_rpt_point_in_time group by 1, 2)
    select format('%s @ %s', g.licence, g.as_of)                        as subject,
           format('Metrc''s own grid states %s record(s) in %s; this platform holds %s for %s at %s. Difference %s. No named exception in reconciliation_exception.',
                  g.grid_says, g.file_name, coalesce(o.os_says, 0),
                  g.licence, g.as_of, coalesce(o.os_says, 0) - g.grid_says) as detail
    from grid g
    left join os o on o.licence = g.licence and o.as_of = g.as_of
    where coalesce(o.os_says, 0) <> g.grid_says
      and not exists (
        select 1 from reconciliation_exception x
        where x.resolved_on is null
          and x.fact = format('pit.count %s @ %s', g.licence, g.as_of))
  $q$;
  v_pos integer;
  v_neg integer;
begin
  /* ── the fixtures ─────────────────────────────────────────────────────
     Each shadows the two relations the detector reads. The search_path swap
     is what makes the unqualified names in k_sql resolve to these. */
  drop schema if exists tg_fx_pos_pit_grid cascade;
  drop schema if exists tg_fx_neg_pit_grid cascade;
  create schema tg_fx_pos_pit_grid;
  create schema tg_fx_neg_pit_grid;

  /* POSITIVE — must fire. Three ways the rule can break:
       a file the platform under-holds, one it over-holds, and one it has
       never imported at all. */
  create table tg_fx_pos_pit_grid.source_export (
    file_name text, report text, licence text, period_stated text, rows_in_file int);
  insert into tg_fx_pos_pit_grid.source_export values
    ('short.xls', 'Inventory Point in Time', 'MP281909', '8/6/2026',  648),
    ('over.xls',  'Inventory Point in Time', 'MC281714', '8/6/2026',  10),
    ('never.xls', 'Inventory Point in Time', 'MC281714', '1/1/2024',  99);
  create table tg_fx_pos_pit_grid.metrc_rpt_point_in_time (
    licence text, as_of_date date, tag text);
  insert into tg_fx_pos_pit_grid.metrc_rpt_point_in_time
    select 'MP281909', date '2026-08-06', 't' || g from generate_series(1, 643) g;
  insert into tg_fx_pos_pit_grid.metrc_rpt_point_in_time
    select 'MC281714', date '2026-08-06', 'u' || g from generate_series(1, 11) g;
  create table tg_fx_pos_pit_grid.reconciliation_exception (fact text, resolved_on date);

  /* NEGATIVE — must stay silent. Four ways it must NOT fire:
       an exact match, a zero-against-zero, a file whose count differs but is
       NAMED in reconciliation_exception, and a report that is not a PIT. */
  create table tg_fx_neg_pit_grid.source_export (
    file_name text, report text, licence text, period_stated text, rows_in_file int);
  insert into tg_fx_neg_pit_grid.source_export values
    ('exact.xls',  'Inventory Point in Time', 'MC281714', '12/31/2025', 3364),
    ('empty.xls',  'Inventory Point in Time', 'MP281909', '1/1/2024',   0),
    ('named.xls',  'Inventory Point in Time', 'MP281909', '8/6/2026',   648),
    ('other.xls',  'Wholesale Transfers',     'MC281714', '8/6/2026',   999);
  create table tg_fx_neg_pit_grid.metrc_rpt_point_in_time (
    licence text, as_of_date date, tag text);
  insert into tg_fx_neg_pit_grid.metrc_rpt_point_in_time
    select 'MC281714', date '2025-12-31', 't' || g from generate_series(1, 3364) g;
  insert into tg_fx_neg_pit_grid.metrc_rpt_point_in_time
    select 'MP281909', date '2026-08-06', 'v' || g from generate_series(1, 643) g;
  create table tg_fx_neg_pit_grid.reconciliation_exception (fact text, resolved_on date);
  insert into tg_fx_neg_pit_grid.reconciliation_exception
    values ('pit.count MP281909 @ 2026-08-06', null);

  /* ── run both halves ──────────────────────────────────────────────────── */
  execute 'set local search_path to tg_fx_pos_pit_grid, public';
  execute format('select count(*) from (%s) x', k_sql) into v_pos;
  execute 'set local search_path to tg_fx_neg_pit_grid, public';
  execute format('select count(*) from (%s) x', k_sql) into v_neg;
  execute 'set local search_path to public';

  if v_pos < 3 then
    raise exception 'The positive fixture returned % of 3 expected violations. A detector that cannot fail proves nothing. Rolling back.', v_pos;
  end if;
  if v_neg <> 0 then
    raise exception 'The negative fixture returned % violation(s) and must return none. A detector that fires on correct data is worse than none. Rolling back.', v_neg;
  end if;

  drop schema tg_fx_pos_pit_grid cascade;
  drop schema tg_fx_neg_pit_grid cascade;

  /* ── register it ──────────────────────────────────────────────────────── */
  insert into data_assertion (
    assertion_key, title, domain, severity, violation_sql, max_allowed,
    allowance_reason, fixture_positive_schema, fixture_negative_schema,
    fixture_shadows, fixture_positive_case, fixture_negative_case,
    fixture_proven_at, fixture_last_result, fixture_positive_min_rows,
    what_it_proves, why_it_matters, enabled, owner_agent, added_by, accountable_to)
  values (
    k_key,
    'A point-in-time position disagrees with the Metrc grid it came from',
    'metrc', 'critical', k_sql, 0, null,
    'tg_fx_pos_pit_grid', 'tg_fx_neg_pit_grid',
    array['source_export', 'metrc_rpt_point_in_time', 'reconciliation_exception'],
    'Three breaks: a position the platform under-holds (643 against a grid of 648), one it over-holds (11 against 10), and a file it has never imported at all (0 against 99).',
    'Four correct states: an exact match at 3,364; a zero-record file against no rows, which is agreement and not absence; a real difference that IS named in reconciliation_exception; and a non-PIT report, which this rule does not govern.',
    now(), 'both halves proved', 3,
    'That every point-in-time position this platform publishes holds exactly as many records as the Metrc export it was taken from, and that any difference has been named by a person rather than absorbed.',
    'The owner locked the rule on 29 Aug 2026: an OS figure equals the Metrc grid or it is a named exception. On that date one of five positions breached it — MP281909 at 6 Aug 2026 held 643 against a grid of 648, because the table key could not hold one tag under two licences. Nothing measured it; it was found by reading the files. Only the COUNT is compared, because the Metrc grid states a count and the report carries no quantity: this proves the population, never the contents.',
    true, 'Agent W', 'Agent I (Database COO)', 'Owner');

  raise notice 'Registered %: positive fixture fired % time(s), negative fixture stayed silent.', k_key, v_pos;
end $$;
