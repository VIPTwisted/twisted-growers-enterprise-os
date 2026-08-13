/* ============================================================================
 * ASSERTIONS 2-5 — the schedule integrity set. Agent W, 13 Aug 2026.
 *
 * The plan/actual link is now POSITIONAL: the nth planned pull of a room is
 * matched to the nth takedown of that room. That is a genuine improvement on
 * matching by date window, which is what produced 43 published late-days against
 * 210 real ones. But positional matching has its own silent failure: insert one
 * unplanned takedown and every later pair shifts by one, with no error anywhere.
 *
 * THE BOUND IS MEASURED, NOT CHOSEN.
 *   - largest real divergence between a planned pull and its takedown:  26 days
 *   - shortest observed gap between two takedowns of the same room:     59 days
 * So an off-by-one ordinal slip cannot present as less than ~59 days, and real
 * operational lateness has never exceeded 26. 45 days sits between them with 19
 * days of headroom against false alarms and 14 against a missed slip. Set as a
 * row in harvest_alert_rules so the owner can tune it without a deploy.
 * ========================================================================== */

insert into harvest_alert_rules (rule_key, label, threshold, unit, severity, active, note)
values ('ordinal_match_max_divergence_days',
        'Planned pull to matched takedown, maximum believable gap',
        45, 'days', 'critical', true,
        'The nth planned pull of a room is matched to the nth takedown of that room. Beyond '
        'this many days apart the pairing is not late work, it is the ordinal having slipped. '
        'Measured 13 Aug 2026: the largest real divergence across 13 matched pulls is 26 days, '
        'and the shortest gap between two takedowns of one room is 59 days, so nothing '
        'legitimate lands between. Raising this above 59 would blind the check to a slip; '
        'lowering it below 26 would flag honest lateness as corruption.')
on conflict (rule_key) do nothing;

/* ---------------------------------------------------------------------------
 * FIXTURE SCHEMAS.
 * Every fixture relation is a VIEW over a VALUES list with dates expressed
 * RELATIVE to current_date. A fixture pinned to literal dates rots: rows that
 * were "in the future" become past, and the fixture starts proving something
 * else without anyone touching it. These stay true on any day they are run.
 * ------------------------------------------------------------------------- */
create schema if not exists tg_fx_pos_ordinal;   create schema if not exists tg_fx_neg_ordinal;
create schema if not exists tg_fx_pos_unmatched; create schema if not exists tg_fx_neg_unmatched;
create schema if not exists tg_fx_pos_standing;  create schema if not exists tg_fx_neg_standing;
create schema if not exists tg_fx_pos_surfaces;  create schema if not exists tg_fx_neg_surfaces;

/* Shared: the rules table, shadowed so a fixture verdict can never be changed by
   someone tuning a live threshold. A fixture whose answer depends on production
   is not a fixture. */
create or replace view tg_fx_pos_ordinal.harvest_alert_rules as
  select * from (values ('ordinal_match_max_divergence_days',45::numeric,true),
                        ('pull_overdue_days',2::numeric,true))
  as t(rule_key, threshold, active);
create or replace view tg_fx_neg_ordinal.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_pos_standing.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;
create or replace view tg_fx_neg_standing.harvest_alert_rules as
  select * from tg_fx_pos_ordinal.harvest_alert_rules;

/* --- ASSERTION 2 fixtures: the ordinal going out of step ----------------- */
create or replace view tg_fx_pos_ordinal.harvest_pulls as
  select * from (values
    (1, current_date-140, 'F1'), (2, current_date-80, 'F1'),
    (3, current_date-140, 'F2'), (4, current_date-70, 'F2'))
  as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_pos_ordinal.v_harvest_takedown as
  select * from (values
    ('F1', current_date-135), ('F1', current_date-75),
    ('F1', current_date-15),   -- THE UNPLANNED THIRD TAKEDOWN: 3 takedowns, 2 pulls
    ('F2', current_date-138),
    ('F2', current_date-10))   -- ordinal 2 of F2, but pull 4 was planned 60 days earlier
  as t(flower_room, takedown_start);

create or replace view tg_fx_neg_ordinal.harvest_pulls as
  select * from (values
    (1, current_date-160,'F1'), (2, current_date-100,'F1'), (3, current_date-40,'F1'),
    (4, current_date-150,'F2'), (5, current_date-90,'F2'),
    (6, current_date+20, 'F2'), (7, current_date+80, 'F2'))
  as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_neg_ordinal.v_harvest_takedown as
  /* Divergences of 8, 20 and 26 days. 26 is the largest gap that actually exists
     in production — real, legitimate lateness. If this half ever goes red because
     someone tightened the bound, the bound is wrong, not the data. */
  select * from (values
    ('F1', current_date-152), ('F1', current_date-80), ('F1', current_date-14),
    ('F2', current_date-145), ('F2', current_date-70))
  as t(flower_room, takedown_start);

/* --- ASSERTION 3 fixtures: a takedown belonging to no pull --------------- */
create or replace view tg_fx_pos_unmatched.harvest_pulls as
  select * from (values (1, current_date-100, 'F1')) as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_pos_unmatched.v_harvest_takedown as
  select * from (values ('F1', current_date-95),
                        ('F1', current_date-20))   -- real material, no plan behind it
  as t(flower_room, takedown_start);

create or replace view tg_fx_neg_unmatched.harvest_pulls as
  /* MORE pulls than takedowns is the normal state of a plan year: pulls 3 and 4
     have not happened yet. A check that reads "counts differ" as "something is
     wrong" would fire on every room, every day of the year. */
  select * from (values (1, current_date-100,'F1'), (2, current_date-40,'F1'),
                        (3, current_date+20,'F1'), (4, current_date+80,'F1'))
  as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_neg_unmatched.v_harvest_takedown as
  select * from (values ('F1', current_date-95), ('F1', current_date-35))
  as t(flower_room, takedown_start);

/* --- ASSERTION 4 fixtures: the room that never comes down ---------------- */
create or replace view tg_fx_pos_standing.harvest_pulls as
  select * from (values (1, current_date-91,'F4'),
                        (2, current_date-31,'F4'))   -- F4's real position on 13 Aug 2026
  as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_pos_standing.v_harvest_takedown as
  select * from (values ('F4', current_date-85)) as t(flower_room, takedown_start);

create or replace view tg_fx_neg_standing.harvest_pulls as
  /* Three ways a room can legitimately have no takedown, all of which a careless
     version of this check would call a crisis:
       F1 - the pull is still in the FUTURE
       F2 - one day past, inside the owner's 2-day overdue tolerance
       F3 - 100 days back but it DID come down, 26 days late */
  select * from (values (1, current_date+30,'F1'), (2, current_date-1,'F2'),
                        (3, current_date-100,'F3'))
  as t(pull_no, harvest_date, flower_room);
create or replace view tg_fx_neg_standing.v_harvest_takedown as
  select * from (values ('F3', current_date-74)) as t(flower_room, takedown_start);

/* --- ASSERTION 5 fixtures: the two surfaces diverging -------------------- */
create or replace view tg_fx_pos_surfaces.v_schedule_compliance as
  select * from (values
    ('Pull', 1, 'F1', current_date-100, current_date-80),
    ('Pull', 2, 'F2', current_date-90,  null::date))     -- pull 2 exists here only
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_pos_surfaces.v_harvest_plan_vs_actual as
  select * from (values
    (1, 'F1', current_date-100, current_date-74))        -- actual disagrees by 6 days
  as t(pull_no, flower_room, planned_date, actual_date);

create or replace view tg_fx_neg_surfaces.v_schedule_compliance as
  /* The Dry rows are the load-bearing part. v_schedule_compliance is a UNION of
     Pull rows and Dry rows, and every Dry row has a NULL pull_no. Drop the
     event_type filter and all of them full-join to nothing and read as
     "missing from the other surface" — 26 pulls agreeing perfectly would still
     report a wall of disagreements. */
  select * from (values
    ('Pull', 1,    'F1', current_date-100, current_date-80),
    ('Pull', 2,    'F2', current_date-90,  null::date),
    ('Dry',  null::int, 'F3', current_date-20,  current_date-6),
    ('Dry',  null::int, 'F4', current_date-15,  current_date-1))
  as t(event_type, pull_no, room, scheduled_date, actual_date);
create or replace view tg_fx_neg_surfaces.v_harvest_plan_vs_actual as
  /* Pull 2 carries NULL on both sides: not yet harvested. Two NULLs are
     agreement, not a difference — which is why the comparison must be
     IS DISTINCT FROM and not equality wrapped in coalesce. */
  select * from (values
    (1, 'F1', current_date-100, current_date-80),
    (2, 'F2', current_date-90,  null::date))
  as t(pull_no, flower_room, planned_date, actual_date);

do $$
declare s text; r text;
begin
  foreach s in array array['tg_fx_pos_ordinal','tg_fx_neg_ordinal','tg_fx_pos_unmatched',
                           'tg_fx_neg_unmatched','tg_fx_pos_standing','tg_fx_neg_standing',
                           'tg_fx_pos_surfaces','tg_fx_neg_surfaces'] loop
    execute format('revoke all on schema %I from anon, authenticated', s);
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname = s loop
      execute format('revoke all on %I.%I from anon, authenticated', s, r);
    end loop;
  end loop;
end $$;
;
