-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-020 (reviewers V, X, W).
-- Owner: "do you parse and create a language table all must use" - yes - and "I like consistency".
--
-- SECOND ATTEMPT. The first was rejected by my own check constraint settled_needs_a_signature:
-- I marked four terms settled without recording WHO settled them. The constraint was right. A
-- term marked settled with nobody's name against it is exactly the "draft that nobody killed"
-- pattern that left flag_ignore sitting in reason_policy unconfirmed for days.
--
-- PARSED FROM THE OS, NOT INVENTED. Corpus: every nav_registry label, every dashboard KPI, every
-- column name and every relation name in public. 20,212 word uses, 2,023 distinct words.
--
-- WHAT THE PARSE FOUND WITHOUT BEING ASKED TO LOOK:
--     licence   148 uses
--     license   127 uses
-- One word, two spellings, 275 uses, in COLUMN and TABLE names - structural, not cosmetic. An
-- agent writing licence_number against a license_number column gets an error, not a warning.
-- Also live: pounds (80) alongside lbs (68) alongside lb, for one unit.
--
-- WHY AUTOMATIC STEMMING WAS REJECTED. Stemming produced families like plant / planted /
-- planting / plants and test / tested / testing / tests. That is GRAMMAR, not synonymy.
-- Collapsing "planting" into "plants" destroys meaning - one is an activity, the other a count of
-- living things. A glossary built by algorithm merges them. Grammatical variants are recorded as
-- ACCEPTED and never collapsed.
--
-- THREE KINDS OF VARIANT, only one of which is a defect:
--   accepted    grammar or legitimate register. Both forms are correct.
--   deprecated  a real inconsistency. New work uses the preferred form; existing objects are NOT
--               renamed, because renaming a live column breaks every reader and the cure is worse
--               than the disease. Recorded as debt and ratcheted instead.
--   forbidden   actively misleading and corrected wherever found.
--
-- UNDO: drop view v_glossary_conflicts; drop table glossary_variant; drop table glossary_term;
--       delete from conversion_factors where key = 'glossary_inconsistent_uses_ceiling';
--       delete from verification_checks where check_key like 'glossary-%';

create table if not exists glossary_term (
  term            text primary key,
  preferred_form  text not null,
  definition      text not null,
  domain          text not null,
  why_it_matters  text,
  owner           text not null default 'Agent I',
  settled         boolean not null default false,
  settled_by      text,
  added_on        date not null default current_date,
  constraint settled_needs_a_signature check (not settled or settled_by is not null)
);

alter table glossary_term enable row level security;

comment on table glossary_term is
 'The business glossary: one canonical term per concept, with the exact preferred form every new '
 'label, column and KPI must use. Parsed from the platform''s own vocabulary on 11 Aug 2026 - '
 '20,212 word uses across 2,023 distinct words - not invented. settled = true requires a name '
 'against it; until then the preferred form is a PROPOSAL, however sensible it looks.';

comment on column glossary_term.preferred_form is
 'The EXACT string to use, including hyphenation and case. "third-party", not "third party" or '
 '"3rd party". Consistency is only real when it is specific.';

create table if not exists glossary_variant (
  variant      text primary key,
  term         text not null references glossary_term(term),
  variant_kind text not null check (variant_kind in ('accepted','deprecated','forbidden')),
  uses_found   integer,
  seen_in      text,
  why          text not null,
  added_on     date not null default current_date
);

alter table glossary_variant enable row level security;

comment on table glossary_variant is
 'Every observed form of a term. accepted = legitimate grammar or register, leave alone. '
 'deprecated = a real inconsistency; new work must not use it and existing objects are NOT '
 'renamed. forbidden = actively misleading, correct wherever found.';

insert into glossary_term (term, preferred_form, definition, domain, why_it_matters, settled, settled_by) values
('licence', 'license',
 'The state-issued authorisation number identifying a cannabis establishment, for example MC281714 or MP281909.',
 'compliance',
 'Both spellings are live - licence 148 uses, license 127. British and American forms of one word. Metrc, the legal system of record, uses the American spelling, so the platform should match the authority it mirrors rather than argue with it. PROPOSAL: the owner decides.',
 false, null),
('pound', 'lb',
 'The unit of weight for all reported material figures. One pound is 453.59237 grams.',
 'inventory',
 'Three forms live: pounds (80), lbs (68), lb. Unit strings are joined and compared on, so three spellings is three populations. NEVER collapse lb with g or kg - that is a different quantity, not a different spelling.',
 false, null),
('third-party', 'third-party',
 'Material bought in from another licensee. Distinct from our own production, and from tolled or consigned material we merely hold.',
 'inventory',
 'Found as third-party, third party and 3rd party. On 11 Aug 2026 two spellings of one KPI sat in dashboard_snapshots showing the same figure under different names, and the guard written that same day could not see the collision.',
 false, null),
('on hand', 'on hand',
 'Material currently held. Two words, never hyphenated, never "onhand".',
 'inventory',
 'Also appears as in stock and held. One concept - and the population behind it is itself an open question, recorded on metric_definition.third_party_pounds_on_hand.',
 false, null),
('tag', 'tag',
 'The 24-character Metrc identifier on a package or plant. THE unit of identity in this business.',
 'compliance',
 'Identity is the tag. Names resolve Metrc to COA to manifest, never the reverse. Everything traces by tag.',
 true, 'Owner ruling D4'),
('manifest', 'manifest',
 'The Metrc transport document recording a movement of material between licensees.',
 'compliance',
 'A movement without a manifest is untracked material crossing the fence. No materiality threshold applies to a missing one.',
 true, 'Owner ruling, 935 CMR seed-to-sale obligation'),
('COA', 'COA',
 'Certificate of Analysis - the laboratory result for a tested package. Upper case in any label.',
 'quality',
 'Ownership stops at the COA. The certificate names who was tested, which is why it is one of the four sources of truth alongside Metrc, the manifest and Apex.',
 true, 'Owner ruling C0'),
('dry-equivalent', 'dry-equivalent',
 'Wet weight converted to its dried equivalent so wet and dry material can be summed.',
 'cultivation',
 'Adding wet to dry is one of the commonest ways an inventory figure goes wrong. The hyphen is part of the term.',
 true, 'Owner, 8-Week Harvest Calendar')
on conflict (term) do nothing;

insert into glossary_variant (variant, term, variant_kind, uses_found, seen_in, why) values
 ('licence',        'licence',      'deprecated', 148, 'columns, tables, views, labels',
  'British spelling. Metrc uses the American form. Do NOT rename existing columns - that breaks every reader. New work uses license.'),
 ('license',        'licence',      'accepted',   127, 'columns, labels', 'The proposed preferred form.'),
 ('pounds',         'pound',        'deprecated',  80, 'labels, columns', 'Word form. Use lb in any label or unit field.'),
 ('lbs',            'pound',        'deprecated',  68, 'labels, columns', 'Plural abbreviation. Use lb.'),
 ('lb',             'pound',        'accepted',  null, 'unit fields', 'The preferred form.'),
 ('third party',    'third-party',  'deprecated', null, 'dashboard_snapshots',
  'Unhyphenated. Caused a real label collision on 11 Aug 2026 - one figure published twice under two names.'),
 ('3rd party',      'third-party',  'deprecated', null, 'owner language, notes', 'Numeral form. Fine spoken, not in a label.'),
 ('bought in',      'third-party',  'accepted',  null, 'owner language',
  'The owner''s own phrase for the same material. Accepted because he uses it and the assistant must understand it.'),
 ('in stock',       'on hand',      'deprecated', null, 'labels', 'Same concept, different words.'),
 ('held',           'on hand',      'accepted',  null, 'custody and package language',
  'Legitimate where "held" carries a distinct custody sense.'),
 ('dry equivalent', 'dry-equivalent','deprecated', null, 'labels', 'Unhyphenated form splits one defined term into two words.')
on conflict (variant) do nothing;

create or replace view v_glossary_conflicts as
with corpus as (
  select label as phrase, 'nav label' as surface from nav_registry where label is not null
  union all select kpi, 'dashboard kpi' from mv_department_dashboard
  union all select column_name, 'column' from information_schema.columns where table_schema='public'
  union all select table_name, 'relation' from information_schema.tables where table_schema='public'
)
select v.term, t.preferred_form, v.variant, v.variant_kind, t.settled,
       count(c.phrase) as live_uses,
       string_agg(distinct c.surface, ', ') as appears_in,
       case when v.variant_kind = 'accepted' then 'fine'
            when count(c.phrase) = 0 then 'clean'
            else 'INCONSISTENT — ' || count(c.phrase) || ' uses of "' || v.variant
                 || '" where the preferred form is "' || t.preferred_form || '"'
       end as verdict
from glossary_variant v
join glossary_term t on t.term = v.term
left join corpus c on lower(c.phrase) ~ ('(^|[^a-z])' || lower(v.variant) || '([^a-z]|$)')
group by v.term, t.preferred_form, v.variant, v.variant_kind, t.settled
order by (v.variant_kind <> 'accepted') desc, count(c.phrase) desc;

comment on view v_glossary_conflicts is
 'Where the platform speaks two languages for one concept. Counts live uses of every deprecated '
 'and forbidden variant across labels, KPIs, columns and relation names. Existing objects are NOT '
 'renamed - the count is a RATCHET that may fall and must never rise, forcing new work into one '
 'vocabulary while leaving old work alone until someone chooses to touch it.';

-- Ceiling seeded from the live measurement, not a guess, so the check starts green.
insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
select 'glossary_inconsistent_uses_ceiling',
       coalesce(sum(live_uses), 0), 'count',
       'Ceiling on inconsistent wording across the platform',
       'How many live uses of a deprecated or forbidden term the platform may carry. A RATCHET: may fall, must never rise.',
       'Measured 11 Aug 2026 from v_glossary_conflicts at the moment the glossary was created.',
       'Agent I', 'measured',
       'Lower it as wording is cleaned up. NEVER raise it to make the check pass - that is the failure this layer exists to prevent.'
from v_glossary_conflicts where variant_kind <> 'accepted'
on conflict (key) do nothing;

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'glossary-no-new-inconsistency',
 'The platform does not invent new ways to spell a word it already has',
 'Parsed from the OS: licence appears 148 times and license 127 - one word, two spellings, in '
 'COLUMN and TABLE names, so an agent writing the wrong one gets an error rather than a warning. '
 'pounds, lbs and lb are all live for one unit. This does NOT demand renaming existing objects; '
 'renaming a live column breaks every reader. It ratchets - the count may fall and must never '
 'rise. If it fires, somebody has just added a new spelling of a word the platform already had.',
 'Live uses of deprecated or forbidden wording',
 'select coalesce(sum(live_uses),0)::numeric from v_glossary_conflicts where variant_kind <> ''accepted''',
 'The ratchet ceiling, which may fall and never rise',
 'select value from conversion_factors where key = ''glossary_inconsistent_uses_ceiling''',
 0, 'watch', 'Agent I', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql;;
