/* ============================================================================
 * THE GUARDS ARE CODE TOO. Agent W, 13 Aug 2026.
 *
 * v_schema_object_source scanned views, matviews and functions. It did not scan
 * data_assertion.violation_sql — so the duplicate-definition assertion could not
 * see the guards, including itself.
 *
 * That is not hypothetical. The plan-match floor was written out THREE times in
 * two hours: twice by Agent I in the views, and once by me, restated rather than
 * derived, inside harvest.ordinal_match_in_step. Agent V and Agent X each found
 * my copy independently. The check built specifically to count redefinitions of a
 * primitive was blind to the redefinition sitting inside its own sibling, because
 * that one lived in a table column instead of the catalog.
 *
 * A guard exempt from the rule it enforces is the oldest failure in this file.
 *
 * So the source view gains a third arm, and plan_match_floor is registered as a
 * primitive with v_plan_room_floor as its one definition. Restate that floor
 * anywhere — a view, a function, or an assertion — and the count rises and the
 * assertion names the object.
 *
 * MARKER TESTED BEFORE REGISTERING, against every object in the schema: it
 * matches v_plan_room_floor and nothing else. Zero false positives, so the
 * re-derivation count for this primitive starts at 0 and the ratchet holds it
 * there.
 * ========================================================================== */

create or replace view v_schema_object_source as
  select c.relname::text as object_name,
         case c.relkind when 'v' then 'view' else 'matview' end as object_kind,
         pg_get_viewdef(c.oid) as body
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
  union all
  select p.proname::text, 'function', pg_get_functiondef(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
  union all
  /* The guards. A data assertion's violation_sql is executable SQL that decides
     something; it is subject to the same one-definition rule as any view. */
  select 'data_assertion:' || d.assertion_key, 'assertion', d.violation_sql
  from data_assertion d
  where d.enabled;

comment on view v_schema_object_source is
  'The single definition of "the source text of every view, matview, function AND data '
  'assertion in public". The third arm was added 13 Aug 2026 after the plan-match floor was '
  'restated three times in two hours, once inside a watchdog assertion where this view could '
  'not see it. A guard exempt from the rule it enforces is not a guard.';

insert into primitive_definition
  (primitive_key, what_it_answers, canonical_object, canonical_kind, redefinition_marker, why)
values
('plan_match_floor',
 'How far before a room''s own first planned pull may a takedown still claim that room''s first ordinal slot?',
 'v_plan_room_floor', 'view',
 'min\s*\(\s*[a-z_]*\.?harvest_date\s*\)\s*-',
 'Written out three times in two hours on 13 Aug 2026 — twice in the surfaces and once, '
 'restated rather than derived, inside harvest.ordinal_match_in_step. The copies agreed only '
 'by coincidence: no material takedown fell in the gap between a facility-wide floor and the '
 'per-room one. Move either parameter and the surface and its guard diverge in opposite '
 'directions, and at critical severity a false fire blocks the whole gate chain. This '
 'parameter SELECTS ROWS, so a second definition of it silently changes which takedowns exist.')
on conflict (primitive_key) do nothing;
;
