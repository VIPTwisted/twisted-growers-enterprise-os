/* ============================================================================
 * A POSITIVE HALF THAT FIRES IS NOT THE SAME AS ONE THAT FIRES EVERYWHERE.
 * Agent W, 13 Aug 2026.
 *
 * harvest.ordinal_match_in_step has two independent detectors unioned together:
 *   POPULATION  - a room has more material takedowns than past-due pulls
 *   DIVERGENCE  - a matched pair is further apart than a real delay explains
 *
 * A concurrent session rewrote tg_fx_pos_ordinal.v_harvest_takedown while I was
 * working. The fixture still returned rows, so the prover still said "FIRES on
 * the planted violation" and the assertion still showed both halves proved. But
 * every row came from the POPULATION limb: F2's only takedown now sits below F2's
 * own floor, so no matched pair existed and the DIVERGENCE limb was never
 * executed at all.
 *
 * That is a check that cannot fail, hiding inside a check that passes. Exactly
 * the 8 Aug shape — the SQL guard passed all twenty of its fixtures while DROP
 * TABLE walked through it — and I would have shipped it having written the rule
 * against it.
 *
 * TWO FIXES, AND THE SECOND IS THE ONE THAT LASTS.
 *
 * 1. The fixture gains room F3, built solely to trip the divergence limb: two
 *    pulls, two takedowns, so the population limb stays quiet, and a second pair
 *    60 days apart against a 45-day bound. F1 still trips the population limb.
 *    One violation of each kind.
 *
 * 2. fixture_positive_min_rows. An assertion declares how many DISTINCT violation
 *    shapes its positive half must produce, and the prover refuses anything less.
 *    Patching the data alone would leave the next person free to rewrite the
 *    fixture and silently un-test a limb again — which is precisely what just
 *    happened, and it happened by accident rather than carelessness. The count is
 *    the countable test, applied to the fixtures themselves.
 * ========================================================================== */

alter table data_assertion
  add column if not exists fixture_positive_min_rows integer not null default 1;

comment on column data_assertion.fixture_positive_min_rows is
  'How many distinct violation rows the POSITIVE fixture must produce. Greater than 1 when '
  'violation_sql unions independent detectors: a fixture that trips only one limb leaves the '
  'others untested while the assertion still reports both halves proved.';

alter table data_assertion
  add constraint data_assertion_min_rows_sane
  check (fixture_positive_min_rows between 1 and 20);

/* Append F3 to the positive ordinal fixture. F1 and F2 are left exactly as the
   concurrent session set them — F1 still trips the population limb and F1's first
   pair sits at 45 days, deliberately ON the bound and not over it. */
create or replace view tg_fx_pos_ordinal.v_plan_room_floor as
  select * from (values ('F1', current_date-143), ('F2', current_date-143),
                        ('F3', current_date-143))
  as t(flower_room, floor_date);

create or replace view tg_fx_pos_ordinal.harvest_pulls as
  select * from (values
    (1, current_date-140, 'F1'), (2, current_date-80, 'F1'),
    (3, current_date-140, 'F2'), (4, current_date-70, 'F2'),
    /* F3 exists only to exercise the DIVERGENCE limb: two pulls against two
       takedowns, so the population limb has nothing to say about it. */
    (5, current_date-140, 'F3'), (6, current_date-70, 'F3'))
  as t(pull_no, harvest_date, flower_room);

create or replace view tg_fx_pos_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-95, true, 1000::numeric),
    ('F1', current_date-60, true, 980::numeric),
    ('F1', current_date-20, true, 1010::numeric),   -- 3 takedowns, 2 pulls: POPULATION
    ('F2', current_date-214, true, 1049::numeric),  -- below F2's floor, out of scope
    ('F3', current_date-138, true, 1000::numeric),  -- pairs with pull 5, 2 days apart
    ('F3', current_date-10,  true, 1000::numeric))  -- pairs with pull 6, 60 days: DIVERGENCE
  as t(flower_room, takedown_start, is_material, plants);

do $$
declare r text;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname = 'tg_fx_pos_ordinal' loop
    execute format('revoke all on tg_fx_pos_ordinal.%I from anon, authenticated', r);
  end loop;
end $$;

update data_assertion
   set fixture_positive_min_rows = 2,
       fixture_positive_case =
         'TWO violations, one of each kind, because this assertion unions two independent '
         'detectors and a fixture that trips only one leaves the other untested. POPULATION: a '
         'room with three material takedowns against two past-due pulls — one unplanned or '
         'duplicated takedown, which shifts every later pair by one. DIVERGENCE: a matched pair '
         '60 days apart, which is a full room cycle and therefore an ordinal slip rather than '
         'lateness.'
 where assertion_key = 'harvest.ordinal_match_in_step';

/* The prover now enforces the declared minimum. */
create or replace function f_prove_data_assertion(p_key text, p_by text default 'Agent W')
returns table (case_name text, passed boolean, actual text)
language plpgsql
security invoker
set search_path to 'public','pg_temp'
as $$
declare
  a data_assertion%rowtype;
  v_missing text; v_pos integer; v_neg integer;
  v_pos_ok boolean := false; v_neg_ok boolean := false; v_err text;
begin
  select * into a from data_assertion where assertion_key = p_key;
  if not found then
    return query select 'assertion exists'::text, false, format('no row for %L', p_key);
    return;
  end if;

  select string_agg(format('%s missing from %s', rel, sch), '; ') into v_missing
  from (
    select r.rel, s.sch
    from unnest(a.fixture_shadows) r(rel)
    cross join (values (a.fixture_positive_schema), (a.fixture_negative_schema)) s(sch)
    where not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = s.sch and c.relname = r.rel)
  ) x;

  if v_missing is not null then
    return query select 'fixture shadows every named relation'::text, false,
      'NOT PROVEN — ' || v_missing ||
      '. The unshadowed name falls through to public, so the fixture would have tested production.';
    update data_assertion set fixture_last_result = 'unproven: shadow missing'
     where assertion_key = p_key;
    return;
  end if;

  begin
    select n into v_pos from f_assertion_probe(a.violation_sql, a.fixture_positive_schema);
    v_pos_ok := coalesce(v_pos,0) >= a.fixture_positive_min_rows;
  exception when others then
    v_err := left(sqlerrm, 140); v_pos_ok := false;
  end;
  return query select 'FIRES on the planted violation'::text, v_pos_ok,
    coalesce(
      case when v_err is not null then 'ERROR: ' || v_err end,
      format('%s violation row(s), %s required — %s', v_pos, a.fixture_positive_min_rows,
             case when v_pos_ok then 'fired, correct'
                  when coalesce(v_pos,0) = 0 then
                    'STAYED QUIET. Either the check is broken, or the fixture schema fell '
                    'through to production (which is clean) and proved nothing.'
                  else
                    'FIRED TOO NARROWLY. It produced fewer distinct violations than this '
                    'assertion declares, so at least one of its limbs was never executed and '
                    'is untested while the half still looks green.' end));

  v_err := null;

  begin
    select n into v_neg from f_assertion_probe(a.violation_sql, a.fixture_negative_schema);
    v_neg_ok := coalesce(v_neg,0) = 0;
  exception when others then
    v_err := left(sqlerrm, 140); v_neg_ok := false;
  end;
  return query select 'QUIET on the legitimate case'::text, v_neg_ok,
    coalesce(
      case when v_err is not null then 'ERROR: ' || v_err end,
      format('%s violation row(s) — %s', v_neg,
             case when v_neg_ok then 'quiet, correct'
                  else 'CRIED WOLF. A check that calls a healthy thing broken gets ignored, '
                       'and then it is not a check.' end));

  update data_assertion
     set fixture_proven_at = case when v_pos_ok and v_neg_ok then now() else fixture_proven_at end,
         fixture_last_result = case when v_pos_ok and v_neg_ok then 'both halves proved'
                                    when v_pos_ok then 'negative half FAILED — cries wolf'
                                    when v_neg_ok then 'positive half FAILED — cannot fire'
                                    else 'both halves FAILED' end
   where assertion_key = p_key;

  insert into guard_selftest (guard_key, case_name, expected, actual, passed, ran_by)
  values ('data_assertion:'||p_key, 'FIRES on the planted violation',
          '>=' || a.fixture_positive_min_rows || ' rows', coalesce(v_pos,-1)||' rows', v_pos_ok, p_by),
         ('data_assertion:'||p_key, 'QUIET on the legitimate case', '0 rows',
          coalesce(v_neg,-1)||' rows', v_neg_ok, p_by);
end $$;
;
