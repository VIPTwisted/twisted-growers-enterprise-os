/* Fixtures for schema.one_definition_per_registered_primitive. Agent W, 13 Aug 2026.
   The negative half is not hypothetical. Every one of its rows is a shape that an
   earlier draft of this marker flagged as a duplicate definition when it was not:
   two live LIKE patterns whose English words contain the letters ff, and a help
   message that quotes "F2 FF" as prose. Those three are the whole reason this
   assertion is trustworthy, and they are pinned here so it stays that way. */

create schema if not exists tg_fx_pos_primitive;
create schema if not exists tg_fx_neg_primitive;

create or replace view tg_fx_pos_primitive.primitive_definition as
  select * from (values
    ('fresh_frozen',
     'Was this harvest packaged wet and never dried?',
     'f_harvest_is_fresh_frozen',
     $m$(?:~~?\*?|\ylike\y|\yilike\y)\s*'[^']*(?:\\[myY]|[^A-Za-z])FF(?:\\[MyY]|[^A-Za-z])[^']*'$m$,
     array[]::text[], true))
  as t(primitive_key, what_it_answers, canonical_object, redefinition_marker, allowed_objects, active);

create or replace view tg_fx_pos_primitive.v_schema_object_source as
  select * from (values
    /* THE PLANTED DEFECT — a view writing the fresh-frozen rule out by hand.
       This is verbatim what v_harvest_takedown contained on the very day the
       canonical function was created to be its only definition. */
    ('v_harvest_takedown', 'view',
     $b$count(*) filter (where h.name ~* '(^|[^a-z])FF([^a-z]|$)') as fresh_frozen_records$b$),
    /* THE SECOND SHAPE — a different rule reaching a different answer. This one
       classifies every Peanut Butter Souffle as fresh frozen. */
    ('v_real_loss_v2', 'view',
     $b$where (v_harvest_forensic.harvest_name !~~* '%FF%'::text)$b$),
    /* An ordinary view that decides nothing, so the positive half is not
       trivially all-violations. */
    ('v_harvest_report', 'view',
     $b$select h.name, f_harvest_is_fresh_frozen(h.name) as is_fresh_frozen from metrc_harvests h$b$))
  as t(object_name, object_kind, body);

create or replace view tg_fx_neg_primitive.primitive_definition as
  select * from (values
    ('fresh_frozen',
     'Was this harvest packaged wet and never dried?',
     'f_harvest_is_fresh_frozen',
     $m$(?:~~?\*?|\ylike\y|\yilike\y)\s*'[^']*(?:\\[myY]|[^A-Za-z])FF(?:\\[MyY]|[^A-Za-z])[^']*'$m$,
     array['v_legacy_ff_report']::text[], true))
  as t(primitive_key, what_it_answers, canonical_object, redefinition_marker, allowed_objects, active);

create or replace view tg_fx_neg_primitive.v_schema_object_source as
  select * from (values
    /* 1. THE CANONICAL DEFINITION ITSELF. It contains the marker by definition.
          Flagging it would mean the check fires on every primitive, forever. */
    ('f_harvest_is_fresh_frozen', 'function',
     $b$select p_name ~* '(^|[^a-z])FF([^a-z]|$)'$b$),
    /* 2. A STANDING, RECORDED EXEMPTION. */
    ('v_legacy_ff_report', 'view',
     $b$where h.name ~* '(^|[^a-z])FF([^a-z]|$)'$b$),
    /* 3. THE CORRECT PATTERN — asking the canonical function. Must never be
          mistaken for a redefinition merely because the words appear. */
    ('v_harvest_pull_link', 'view',
     $b$select f_harvest_is_fresh_frozen(h.name) as is_fresh_frozen from metrc_harvests h$b$),
    /* 4. FALSE POSITIVE, LIVE: "Affiliated" contains ff. v_tag_ledger and
          v_tag_movement_forensic both match on this string today. */
    ('v_tag_ledger', 'view',
     $b$where t.counterparty ~~* '%Affiliated%'::text$b$),
    /* 5. FALSE POSITIVE, LIVE: "DIFFERS" contains ff. */
    ('v_manifest_discrepancy_summary', 'view',
     $b$where d.verdict ~~ 'VALUE DIFFERS%'::text$b$),
    /* 6. FALSE POSITIVE, LIVE: prose in a help message, not code. The guard
          that refuses prose is the one people switch off. */
    ('tg_guard_naming', 'function',
     $b$problem := 'Room-suffix variants such as "F2 FF", "F4 H" and lower-case "f3" are LEGITIMATE'$b$))
  as t(object_name, object_kind, body);

do $$
declare s text; r text;
begin
  foreach s in array array['tg_fx_pos_primitive','tg_fx_neg_primitive'] loop
    execute format('revoke all on schema %I from anon, authenticated', s);
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname = s loop
      execute format('revoke all on %I.%I from anon, authenticated', s, r);
    end loop;
  end loop;
end $$;
;
