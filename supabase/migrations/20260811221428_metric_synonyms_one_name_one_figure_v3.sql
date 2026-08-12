-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-019 (reviewers V, X, W).
-- Owner: "how will you handle two different words meaning the same thing - they must also pull
-- universally from the database." And: this needs nuclear-grade fortification.
--
-- HE FOUND A HOLE IN THE GUARD I BUILT AN HOUR EARLIER. one-figure-one-value groups by the EXACT
-- label string, so two spellings of one figure are invisible to it. Proven, not theorised:
-- dashboard_snapshots holds BOTH "Third party material on hand" AND "Third-party material on
-- hand" - one quantity, two labels, one hyphen apart. Nothing prevented it, nothing noticed it,
-- and my new check would have walked straight past it.
--
-- TWO KINDS OF SAMENESS, HANDLED DIFFERENTLY. This distinction is the entire design:
--   1. TYPOGRAPHIC - hyphen, case, spacing, punctuation. Deterministic, safe to collapse by rule.
--      No judgement, no information lost.
--   2. SEMANTIC - different words for one concept. "3rd party" = "third party". CURATED only,
--      NEVER guessed by fuzzy or similarity matching. Fuzzy matching would merge "Fresh frozen on
--      hand" into "Dried bulk flower on hand" - roughly 70% similar as strings, completely
--      different material. An automatic synonym engine pointed at inventory language is a way to
--      turn two real quantities into one wrong one.
--
-- THIRD ATTEMPT, AND THE TWO REFUSALS ARE WORTH RECORDING:
--   v1 refused by Postgres - create or replace cannot rename a view column.
--   v2 refused by guard-sql rule E1 - it forbids DROP VIEW outright, not merely DROP CASCADE,
--      and offers a sanctioned override (set local tg.allow_drop). I am NOT using the override.
--      Nothing forced the rename: keeping the existing column names and APPENDING the new ones
--      achieves the same result with no drop and no window in which the view does not exist. An
--      escape hatch used when a clean path exists is an escape hatch that becomes a habit.
--   So: the view still exposes `kpi` first - now holding a representative label rather than the
--   grouping key - and figure_slug, distinct_labels_used and the_labels are appended at the end.
--   Grouping is by slug regardless. Slightly awkward column order, zero risk.
--
-- UNDO: restore the definition from migration one_figure_one_value_hourly_watch;
--       drop function f_metric_slug(text); drop table metric_alias; drop table metric_synonym;
--       delete from verification_checks where check_key like 'label-%';

create table if not exists metric_synonym (
  phrase    text primary key,
  canonical text not null,
  why       text not null,
  added_by  text not null default 'Agent I',
  added_on  date not null default current_date,
  constraint synonym_is_not_itself check (lower(btrim(phrase)) <> lower(btrim(canonical)))
);

alter table metric_synonym enable row level security;

comment on table metric_synonym is
 'CURATED word and phrase synonyms only. Every row is a deliberate human statement that two forms '
 'of words mean the same business thing. Nothing is added by similarity, fuzzy match or inference '
 '- "fresh frozen on hand" and "dried bulk flower on hand" are 70% similar as strings and are '
 'completely different material. Typographic variants are handled by f_metric_slug and must NOT '
 'be listed here.';

insert into metric_synonym (phrase, canonical, why) values
 ('3rd party',        'third party',             'Numeral and word forms of the same counterparty class.'),
 ('thirdparty',       'third party',             'Unspaced form seen in column and view names.'),
 ('outside material', 'third party',             'Owner language for purchased material from another licensee.'),
 ('bought in',        'third party',             'Owner language. "Bought in" and "third party" name the same material.'),
 ('in stock',         'on hand',                 'Same concept: material currently held.'),
 ('held',             'on hand',                 'Same concept, used in custody and package language.'),
 ('saleable',         'sellable',                'Spelling variant, British and American.'),
 ('lbs',              'lb',                      'Unit abbreviation variant. NEVER collapse lb with g or kg.'),
 ('pounds',           'lb',                      'Unit word versus abbreviation.'),
 ('dry equivalent',   'dry-equivalent',          'Hyphenation of a defined term that must stay one concept.'),
 ('ff',               'fresh frozen',            'Abbreviation used in manufacturing language.'),
 ('coa',              'certificate of analysis', 'Abbreviation used everywhere; one concept.')
on conflict (phrase) do nothing;

create or replace function public.f_metric_slug(p_label text)
returns text language plpgsql stable as $fn$
declare v text; r record;
begin
  if p_label is null then return null; end if;
  v := lower(btrim(p_label));
  v := regexp_replace(v, '[-_/]+', ' ', 'g');
  v := regexp_replace(v, '[^a-z0-9 ]', '', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  for r in select phrase, canonical from metric_synonym order by length(phrase) desc loop
    v := replace(v, lower(r.phrase), lower(r.canonical));
  end loop;
  return regexp_replace(v, '\s+', '', 'g');
end $fn$;

comment on function public.f_metric_slug(text) is
 'Reduces a published label to its canonical slug. Typography collapsed by rule; meaning collapsed '
 'only via curated metric_synonym rows, longest phrase first so "3rd party" beats "party". STABLE '
 'rather than IMMUTABLE because it reads the synonym table - adding one synonym then takes effect '
 'everywhere at once, which is the point of having it.';

create table if not exists metric_alias (
  alias_label text primary key,
  metric_key  text not null references metric_definition(metric_key),
  seen_where  text,
  note        text,
  added_on    date not null default current_date
);

alter table metric_alias enable row level security;

comment on table metric_alias is
 'Every label under which a metric is published, mapped to its one canonical metric_key. Two '
 'labels pointing at one key is fine and expected. Two labels pointing at one key while showing '
 'DIFFERENT VALUES is the defect this exists to catch.';

insert into metric_alias (alias_label, metric_key, seen_where, note) values
 ('Third-party material on hand', 'third_party_pounds_on_hand', 'Command dashboard', 'Canonical spelling.'),
 ('Third party material on hand', 'third_party_pounds_on_hand', 'dashboard_snapshots history',
  'Unhyphenated variant found in the snapshot history on 11 Aug 2026 - the exact case that proved this table was needed.'),
 ('Total on hand, dry-equivalent', 'total_pounds_on_hand', 'Command and Inventory dashboards', 'Canonical spelling.')
on conflict (alias_label) do nothing;

create or replace view v_figure_disagreement as
select min(kpi)                                 as kpi,
       count(*)                                 as published_on_surfaces,
       string_agg(distinct department, ' | ')   as where_it_appears,
       count(distinct value)                    as distinct_values,
       min(value)                               as lowest,
       max(value)                               as highest,
       round(max(value) - min(value), 3)        as spread,
       string_agg(distinct value::text, ' vs ') as values_shown,
       case when count(distinct value) > 1
            then 'DISAGREES — the same figure shows different totals'
            when count(distinct kpi) > 1
            then 'agrees, but published under ' || count(distinct kpi) || ' different labels'
            else 'agrees' end                   as verdict,
       f_metric_slug(kpi)                       as figure_slug,
       count(distinct kpi)                      as distinct_labels_used,
       string_agg(distinct kpi, '  ||  ')       as the_labels
from mv_department_dashboard
where value is not null
group by f_metric_slug(kpi)
having count(*) > 1
order by count(distinct value) desc, count(distinct kpi) desc;

comment on view v_figure_disagreement is
 'The owner ruled that the same card may not give different totals, then asked what happens when '
 'two different WORDS mean the same thing. GROUPED BY f_metric_slug, not by the raw label, so '
 '"Third-party" and "Third party" are one figure here. The column `kpi` holds a representative '
 'label only - the grouping key is figure_slug, appended at the end because create or replace '
 'cannot reorder columns and dropping the view is forbidden by rule E1. The first version of this '
 'view grouped by exact string and would have missed the collision sitting in dashboard_snapshots '
 'right now.';

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values
('label-synonyms-agree',
 'Figures published under different wording still show the same total',
 'Two labels for one figure defeat an exact-string check completely. dashboard_snapshots holds both '
 '"Third party material on hand" and "Third-party material on hand" - one hyphen, one quantity, and '
 'the guard written an hour earlier could not see it. This groups by canonical slug so wording '
 'variants are one figure. If it fires, two surfaces are answering different questions under names '
 'implying they answer the same one - the most misleading failure a dashboard can have.',
 'Figures published on more than one surface, by canonical slug',
 'select count(*)::numeric from v_figure_disagreement',
 'Of those, how many show one value everywhere',
 'select count(*)::numeric from v_figure_disagreement where distinct_values = 1',
 0, 'critical', 'Agent W', true, date '2026-08-11', false),
('label-every-figure-is-mapped',
 'Every published figure declares which metric it is',
 'A label with no metric_alias row belongs to no metric, so nothing can tell whether it duplicates '
 'another figure under different wording. Coverage, not correctness: it starts low and ratchets '
 'upward. It exists so the gap is counted rather than assumed away.',
 'Distinct figures published on the dashboards',
 'select count(distinct f_metric_slug(kpi))::numeric from mv_department_dashboard',
 'Of those, how many map to a registered metric',
 'select count(distinct f_metric_slug(alias_label))::numeric from metric_alias where f_metric_slug(alias_label) in (select f_metric_slug(kpi) from mv_department_dashboard)',
 0, 'watch', 'Agent I', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql,
  severity = excluded.severity, owner = excluded.owner, enabled = excluded.enabled;;
