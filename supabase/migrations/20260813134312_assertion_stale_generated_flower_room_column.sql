/* ============================================================================
 * ASSERTION 1 — THE STALE GENERATED COLUMN. Agent W, 13 Aug 2026.
 *
 * metrc_harvests.flower_room is GENERATED ALWAYS AS
 * (f_flower_room_from_harvest_name(name)) STORED.
 *
 * Postgres computes a stored generated column ON WRITE. If anyone runs
 * CREATE OR REPLACE FUNCTION on f_flower_room_from_harvest_name, existing rows
 * are NOT recomputed. There is no error, no warning, and no way to see it: the
 * column keeps the answer the OLD function gave, forever, while every reader
 * believes it is reading the current definition.
 *
 * That is the same shape as the defect that ran from February to August — a
 * value that is wrong in a way nothing can observe. The column is now the single
 * definition of which flower room a harvest came from, so if it goes stale every
 * downstream surface goes stale with it silently: v_harvest_takedown clusters by
 * it, and both compliance views match pulls through it.
 *
 * Re-derive from the function across all 380 rows; fail on any disagreement.
 * ========================================================================== */

create schema if not exists tg_fx_pos_gencol;
create schema if not exists tg_fx_neg_gencol;

comment on schema tg_fx_pos_gencol is
  'Fixture: metrc_harvests with a PLANTED stale flower_room. Shadows production by name so '
  'the assertion''s own SQL text runs against it unchanged. Agent W.';
comment on schema tg_fx_neg_gencol is
  'Fixture: metrc_harvests where every stored flower_room agrees with the function, INCLUDING '
  'names that legitimately parse to NULL. Agent W.';

/* --- POSITIVE: the column has gone stale and disagrees with the function ---
   flower_room is a PLAIN column here, which is exactly the condition being
   simulated: a stored value that no longer tracks its own generator. */
drop table if exists tg_fx_pos_gencol.metrc_harvests;
create table tg_fx_pos_gencol.metrc_harvests (
  id bigint primary key, name text, flower_room text);
insert into tg_fx_pos_gencol.metrc_harvests (id, name, flower_room) values
  /* THE PLANTED DEFECT: the name says F2, the stored column still says F1 —
     what a CREATE OR REPLACE of the parse function leaves behind. */
  (1, 'TG Blue Dream - 20260615 - F2', 'F1'),
  /* A row that is fine, so the positive fixture is not trivially all-violations. */
  (2, 'TG Gelato - 20260615 - F3',     'F3'),
  /* The second stale shape: the function now parses a room where the stored
     column has NULL. A check written with <> instead of IS DISTINCT FROM would
     miss this one entirely and report the table clean. */
  (3, 'TG Wedding Cake - 20260620 - F4', null);
alter table tg_fx_pos_gencol.metrc_harvests enable row level security;
revoke all on tg_fx_pos_gencol.metrc_harvests from anon, authenticated;

/* --- NEGATIVE: legitimate data the assertion must NOT flag ---------------
   The load-bearing rows are the 2024 harvests whose names carry no room at all.
   Eight of them exist in production right now. The function returns NULL, the
   stored column is NULL, and NULL <> NULL is NULL — so a check written the
   obvious way either misses every real defect or, written the other obvious way,
   flags all eight of these as broken every single run. Neither is a check. */
drop table if exists tg_fx_neg_gencol.metrc_harvests;
create table tg_fx_neg_gencol.metrc_harvests (
  id bigint primary key, name text, flower_room text);
insert into tg_fx_neg_gencol.metrc_harvests (id, name, flower_room) values
  (1, 'TG Blue Dream - 20260615 - F2',        'F2'),
  (2, 'TG Gelato - 20260615 - F3',            'F3'),
  /* The real 2024 shape, verbatim from production: no room in the name.
     Both sides NULL. Must stay quiet. */
  (3, 'TG Apple Fritter - 20240516 - B',      null),
  (4, 'TG Orange Cream - 20240516',           null),
  (5, 'TG Carbon Fiber - 20240731',           null),
  /* Lower-case and no-space spellings the function accepts. If someone
     "tightens" the parse to require an upper-case F and a space, these three
     start disagreeing and this half goes red — which is the correct outcome,
     because that edit would silently re-room live harvests. */
  (6, 'TG Runtz - 20260101 - f1',             'F1'),
  (7, 'TG Zkittlez - 20260101 F4',            'F4'),
  (8, 'TG Sherbert - 20260101 - F 3',         'F3');
alter table tg_fx_neg_gencol.metrc_harvests enable row level security;
revoke all on tg_fx_neg_gencol.metrc_harvests from anon, authenticated;

insert into data_assertion (
  assertion_key, title, domain, severity, violation_sql,
  fixture_positive_schema, fixture_negative_schema, fixture_shadows,
  fixture_positive_case, fixture_negative_case,
  what_it_proves, why_it_matters, owner_agent, note)
values (
  'harvest.flower_room_column_matches_its_generator',
  'metrc_harvests.flower_room disagrees with the function that generates it',
  'harvest',
  'critical',
$sql$
select h.id::text as subject,
       format('%s — stored flower_room %s, f_flower_room_from_harvest_name() says %s',
              h.name,
              coalesce(h.flower_room, 'NULL'),
              coalesce(f_flower_room_from_harvest_name(h.name), 'NULL')) as detail
from metrc_harvests h
where h.flower_room is distinct from f_flower_room_from_harvest_name(h.name)
$sql$,
  'tg_fx_pos_gencol', 'tg_fx_neg_gencol', array['metrc_harvests'],
  'A row whose name says F2 while the stored column still says F1 — precisely what '
  'CREATE OR REPLACE FUNCTION on the generator leaves behind, since Postgres never '
  'recomputes existing rows. Also a row where the function now finds a room and the '
  'stored column is NULL, which a check using <> instead of IS DISTINCT FROM misses.',
  'The eight 2024 harvests whose names contain no room at all: the function returns NULL '
  'and the column is NULL. Plus the lower-case, no-space and spaced spellings the function '
  'legitimately accepts. Flagging any of these would put eight permanent false alarms on '
  'the board and the assertion would be ignored inside a week.',
  'That every stored flower_room still equals what its generator returns today, across '
  'all rows — not merely that the generator is correct.',
  'flower_room is now the single definition of which room a harvest came from. Everything '
  'downstream reads it: v_harvest_takedown clusters by it, and both compliance surfaces '
  'match plan to actual through it. A stored column that has quietly stopped tracking its '
  'own function would re-room live harvests with no error anywhere — the same invisible-'
  'wrongness that let the schedule defect run from 8 Feb to 13 Aug 2026.',
  'Agent W',
  'Postgres recomputes a STORED generated column only on write. There is no ALTER that '
  'forces a recompute; the repair is an in-place no-op UPDATE across the table, which '
  'rewrites every row and re-evaluates the generator.');
;
