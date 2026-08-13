/* ============================================================================
 * ASSERTION 6 — THE DUPLICATE-DEFINITION CLASS ITSELF. Agent W, 13 Aug 2026.
 *
 * The February-to-August defect existed because "which flower room" had three
 * parses and "when did the room come down" had three rules. The owner's standing
 * instruction is that the discipline is COUNTABLE: count the definitions of any
 * primitive; more than one is the defect.
 *
 * WHAT BUILDING THIS CHECK IMMEDIATELY FOUND
 * "Fresh frozen" did not have one definition. It had four rules across eight
 * objects:
 *     f_harvest_is_fresh_frozen   ~* '(^|[^a-z])FF([^a-z]|$)'   <- canonical
 *     v_harvest_takedown          same regex, written out by hand
 *     v_moisture_loss_register    same regex, written out by hand
 *     mv_harvest_dry_stats        ~* '\mFF\M'
 *     v_dry_time_discipline       ~* '\mFF\M'
 *     v_moisture_accounting       ilike '%FF%'
 *     v_production_tracker        ilike '%FF%'
 *     v_real_loss_v2              ilike '%FF%'  (three places)
 *     v_strain_performance        ilike '%FF%'
 *
 * The two hand-written copies were collapsed in the preceding migration. The
 * remaining six are a REAL DIVERGENCE, not a stylistic one: ilike '%FF%' matches
 * FF anywhere inside a word, so it classifies 18 dried harvests as fresh frozen
 * — every "Peanut Butter Sou(ff)le" and every "Blueberry Mu(ff)in".
 *
 * v_harvest_takedown was written in the SAME session as the canonical function
 * and still carried its own copy of the rule. That is why this has to be a
 * counted check and not a convention.
 *
 * WHY A VIEW OVER THE CATALOG
 * Every other assertion here proves itself by running its own SQL against a
 * schema that shadows production. This one's subject IS the catalog, which
 * cannot be shadowed. So the catalog scan becomes ONE named view, and the
 * fixture shadows that view instead — the same discipline this check enforces,
 * applied to the check.
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
  where n.nspname = 'public' and p.prokind in ('f','p');

alter view v_schema_object_source set (security_invoker = true);
revoke all on v_schema_object_source from anon;
grant select on v_schema_object_source to authenticated;

comment on view v_schema_object_source is
  'The single definition of "the source text of every view, matview and function in public". '
  'Exists so the duplicate-definition assertion has one relation to read and one relation to '
  'shadow in a fixture. Agent W, 13 Aug 2026.';

create table if not exists primitive_definition (
  primitive_key       text primary key,
  what_it_answers     text not null,
  canonical_object    text not null,
  canonical_kind      text not null check (canonical_kind in ('function','column','view')),
  /* A POSIX regex. Matching it means the object decides this question ITSELF
     rather than asking the canonical definition. */
  redefinition_marker text not null,
  allowed_objects     text[] not null default '{}',
  why                 text not null,
  active              boolean not null default true,
  added_by            text not null default 'Agent W',
  added_at            timestamptz not null default now()
);

comment on table primitive_definition is
  'Registered primitives: questions that must have exactly ONE definition in the schema. '
  'The duplicate-definition assertion counts objects matching redefinition_marker and names '
  'every one that is not the canonical definition. The owner''s test is countable: more than '
  'one definition of a primitive IS the defect.';
comment on column primitive_definition.redefinition_marker is
  'POSIX regex, matched case-insensitively against object source. It must be anchored on the '
  'COMPARISON, not on the bare token: an early draft matching a bare FF flagged tg_guard_naming '
  'for the words "F2 FF" inside a help message. Comments and messages are not code.';
comment on column primitive_definition.allowed_objects is
  'Objects permitted to contain the marker besides the canonical one. Every entry is a '
  'standing exemption and should be rare enough to read in one glance.';

alter table primitive_definition enable row level security;
do $$ begin
  if not exists (select 1 from pg_policy where polrelid='primitive_definition'::regclass
                 and polname='primitive_definition_read') then
    create policy primitive_definition_read on primitive_definition
      for select to authenticated using (true);
  end if;
end $$;
revoke insert, update, delete on primitive_definition from authenticated, anon;
revoke all on primitive_definition from anon;
grant select on primitive_definition to authenticated;

insert into primitive_definition
  (primitive_key, what_it_answers, canonical_object, canonical_kind, redefinition_marker, why)
values
('fresh_frozen',
 'Was this harvest packaged wet and never dried?',
 'f_harvest_is_fresh_frozen', 'function',
 '(?:~~?\*?|\ylike\y|\yilike\y)\s*''[^'']*(?:\\[myY]|[^A-Za-z])FF(?:\\[MyY]|[^A-Za-z])[^'']*''',
 'Fresh frozen converts at 4.5:1 in cost per pound and is excluded from moisture-loss and '
 'dry-time analysis, so who counts as fresh frozen moves money. The marker requires FF to sit '
 'against a non-letter or a regex word boundary INSIDE the quoted pattern, which is what '
 'separates a real test from the letters ff inside "Affiliated" and "VALUE DIFFERS" — both '
 'live strings in this schema that an earlier draft of this marker wrongly flagged.'),
('flower_room',
 'Which of the four flower rooms did this harvest grow in?',
 'f_flower_room_from_harvest_name', 'function',
 '(\[fF\]\s*\??\s*\(?\[1-4\])|(''F''\s*\|\|\s*(substring|regexp))',
 'Three competing parses of the room out of a harvest name is what let a scheduled pull match '
 'another room''s takedown for six months. metrc_harvests.flower_room is generated from the '
 'canonical function and is the only thing anything else should read.');

insert into data_assertion (
  assertion_key, title, domain, severity, violation_sql, max_allowed, allowance_reason,
  fixture_positive_schema, fixture_negative_schema, fixture_shadows,
  fixture_positive_case, fixture_negative_case,
  what_it_proves, why_it_matters, owner_agent, note)
values (
  'schema.one_definition_per_registered_primitive',
  'A registered primitive has more than one definition in the schema',
  'schema', 'elevated',
$sql$
select pd.primitive_key || ' / ' || o.object_name as subject,
       format('%s %s decides "%s" itself instead of reading %s. A registered primitive must '
              'have exactly one definition; this is a second one, and the two can disagree '
              'without anything failing.',
              o.object_kind, o.object_name, pd.what_it_answers, pd.canonical_object) as detail
from primitive_definition pd
join v_schema_object_source o on o.body ~* pd.redefinition_marker
where pd.active
  and o.object_name <> pd.canonical_object
  and not (o.object_name = any (pd.allowed_objects))
group by pd.primitive_key, o.object_name, o.object_kind, pd.what_it_answers, pd.canonical_object
$sql$,
  6,
  'Six objects re-derive fresh_frozen and predate this assertion: mv_harvest_dry_stats and '
  'v_dry_time_discipline use \mFF\M, and v_moisture_accounting, v_production_tracker, '
  'v_real_loss_v2 and v_strain_performance use ilike ''%FF%'' which wrongly classifies 18 '
  'dried harvests — every Peanut Butter Souffle and Blueberry Muffin — as fresh frozen. '
  'Raised as its own finding and owned by Agent I; this allowance exists so that the SEVENTH '
  'redefinition fails immediately instead of the check sitting permanently red and ignored. '
  'It may fall and may never rise. flower_room is already at zero and stays there.',
  'tg_fx_pos_primitive', 'tg_fx_neg_primitive',
  array['v_schema_object_source','primitive_definition'],
  'A view that writes the fresh-frozen test out by hand instead of calling the canonical '
  'function — exactly what v_harvest_takedown did on the day the canonical function was '
  'created to prevent it.',
  'Four things that must never be flagged: the canonical definition itself; an object listed '
  'in allowed_objects; an object that correctly CALLS the canonical function; and — the ones '
  'that actually caught a bad marker — objects matching ''%Affiliated%'' and ''VALUE DIFFERS%'', '
  'real live strings whose letters happen to contain ff, plus a help message quoting "F2 FF" '
  'in prose. An earlier draft of this marker flagged all of them.',
  'That every registered primitive has exactly one definition in the schema, counted, with '
  'each extra definition named by object.',
  'This is the assertion that would have caught the schedule defect in February. "Which flower '
  'room" had three parses and "when did the room come down" had three rules; the surfaces '
  'disagreed and nothing counted the definitions. Building this check found that fresh frozen '
  'had four rules across eight objects, one of them written in the same session as the '
  'function meant to be its only definition.',
  'Agent W',
  'Text matching is the honest instrument here: it is countable, tunable by INSERT rather than '
  'deploy, and its failure modes are visible. It cannot catch a re-derivation written in a '
  'shape the marker does not describe, so a new marker is part of registering a new primitive.');
;
