-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-017 (reviewers V, X, W).
-- Owner: "same fields, KPIs and data duplicated many times throughout the OS. How would
-- QuickBooks, Microsoft and Google handle this?"
--
-- THE MEASUREMENT FIRST. 106 views read metrc_packages. 48 of them independently convert weight
-- to pounds with f_to_pounds. THE POUND IS DEFINED 48 TIMES. Each definition makes its own silent
-- choice about active versus intransit, finished versus not, voided or not. That is exactly why
-- three figures existed tonight for one quantity - 699.0, 774.2 and 847.2. Nobody wrote a wrong
-- number; 48 people wrote a slightly different question.
--
-- WHAT THE DASHBOARD LAYER GETS RIGHT, and must not be broken. Seven KPIs are published on two
-- or three dashboards each and ALL SEVEN AGREE, because they are one base matview republished
-- rather than seven definitions. That is the pattern to spread, not to fix.
--
-- HOW THE THREE COMPANIES SOLVE IT - they converge on one answer, a SEMANTIC LAYER:
--   QuickBooks  one general ledger. Every report is a PROJECTION of the journal, never a
--               recomputation. Two definitions of revenue cannot exist because a report is
--               not allowed to invent a number, only to aggregate journal lines.
--   Microsoft   a shared semantic model. DAX measures defined once; every report, dashboard and
--               Excel pivot references the measure BY NAME. Datasets carry a Certified
--               endorsement so people know which is authoritative, and lineage is queryable.
--   Google      LookML. measure: pounds_on_hand is declared once in a version-controlled model.
--               A dashboard CANNOT re-implement it - re-implementation is not expressible in the
--               language. That is the strongest property of the three.
--
-- The shared principle: ONE DEFINITION, REFERENCED BY NAME, NEVER COPIED - and the consuming
-- surface is structurally unable to define its own version. Postgres cannot forbid a view from
-- writing its own SQL, so we get the next best thing: a registry that names the canonical
-- definition, a conformance view that finds surfaces not using it, and a ratchet so the number
-- of unregistered definitions may fall and never rise.
--
-- WE DO NOT BOIL THE OCEAN. 48 views are not rewritten tonight, and pretending otherwise would
-- be the unserious answer. A real firm certifies the canonical definition, measures conformance,
-- and blocks the 49th. That is what this does.
--
-- UNDO: drop view v_metric_conformance; drop table metric_usage; drop table metric_definition;
--       delete from verification_checks where check_key like 'metric-%';

create table if not exists metric_definition (
  metric_key      text primary key,
  label           text not null,
  unit            text not null,
  what_it_measures text not null,
  population_rule text not null,
  canonical_sql   text not null,
  assertion       text references audit_assertion(assertion),
  owner           text not null,
  certified       boolean not null default false,
  certified_by    text,
  certified_on    date,
  open_question   text,
  version         integer not null default 1,
  superseded_by   text references metric_definition(metric_key),
  added_on        date not null default current_date,
  constraint certified_needs_a_signature
    check (not certified or (certified_by is not null and certified_on is not null))
);

alter table metric_definition enable row level security;

comment on table metric_definition is
 'The semantic layer. ONE canonical definition per published figure, referenced by name and never '
 'copied - the pattern QuickBooks, Microsoft and Google all converge on. Built because 48 views '
 'independently define "pounds", which is why one quantity had three values on 11 Aug 2026. '
 'certified = true means a named person signed the definition on a date; uncertified means it is '
 'the best we have, not that it is agreed.';

comment on column metric_definition.population_rule is
 'What is IN and what is OUT, in words, and why. Most disagreements between two figures are not '
 'arithmetic - they are two different populations answering two different questions. Writing the '
 'population down is most of the value of this table.';

comment on column metric_definition.open_question is
 'A decision the business has not yet made that changes this number. Recorded rather than quietly '
 'resolved by whoever wrote the SQL. An unanswered question in the open is worth more than a '
 'confident number built on a guess.';

create table if not exists metric_usage (
  metric_key   text not null references metric_definition(metric_key),
  surface      text not null,
  surface_kind text not null check (surface_kind in ('view','matview','tile','report','edge_function','page')),
  conforms     boolean not null default false,
  note         text,
  primary key (metric_key, surface)
);

alter table metric_usage enable row level security;

comment on table metric_usage is
 'Where each metric is published, and whether that surface uses the canonical definition or its '
 'own copy. conforms = false is not an accusation - it is the backlog.';

-- Seed with the metric that broke tonight, including the decision nobody has taken.
insert into metric_definition
 (metric_key, label, unit, what_it_measures, population_rule, canonical_sql, assertion, owner,
  certified, open_question)
values
('third_party_pounds_on_hand',
 'Third-party material on hand',
 'lb',
 'Pounds of purchased third-party material we are currently holding. Feeds the Command tile, the '
 'forensic audit panel and the year-end inventory position.',
 'IN: tags in v_third_party_forensic - material whose ownership traces to an outside licence, '
 'confirmed by v_ownership_evidence where 68 of 109 tags have all three sources agreeing. '
 'OUT: our own production, and tolled or consigned material we merely hold (owner ruling C6d). '
 'UNDECIDED: whether intransit counts as on hand - see open_question.',
 'select round(sum(f.lb_on_hand),1) from v_third_party_forensic f',
 'existence',
 'Agent V',
 false,
 'DOES INTRANSIT COUNT AS ON HAND? 16 tags, 200.8 lb, the Holyoke child packages. Including them '
 'gives 774.2 lb; excluding them gives 573.4 lb; the view currently returns 702.3 lb and matches '
 'neither. This is a business ruling for the owner, not a query. Until it is answered the metric '
 'CANNOT be certified, and check third-party-on-hand-two-ways will keep failing - correctly.'),
('total_pounds_on_hand',
 'Total material on hand, dry-equivalent',
 'lb',
 'All material we hold, ours and third-party together, expressed dry-equivalent so wet and dry '
 'are not added together.',
 'IN: every held package regardless of origin. OUT: finished, voided and inactive packages. '
 'Wet weights converted to dry-equivalent before summing - adding wet to dry is the single most '
 'common way this figure goes wrong.',
 'select value from mv_department_dashboard where kpi = ''Total on hand, dry-equivalent'' and department = ''Command''',
 'existence',
 'Agent I',
 false,
 'Published on Command and Inventory and currently agreeing at 2,460.6 lb. Not yet certified '
 'because the 48 independent pound definitions have not been reconciled against it.')
on conflict (metric_key) do nothing;

insert into metric_usage (metric_key, surface, surface_kind, conforms, note) values
 ('third_party_pounds_on_hand','v_dept_dash_third_party','view',   true,  'Reads v_third_party_forensic directly - the canonical source.'),
 ('third_party_pounds_on_hand','v_forensic_audit_panel','view',    true,  'Same base view.'),
 ('third_party_pounds_on_hand','v_cfo_spend_by_tag','view',        false, 'Applies its own filter to the same base. Population not yet proven identical.'),
 ('third_party_pounds_on_hand','v_third_party_remarks','view',     false, 'Same base, own filter, unverified.'),
 ('third_party_pounds_on_hand','v_alert_destroyed_unexplained','view', false, 'Same base, own filter, unverified.'),
 ('total_pounds_on_hand','mv_department_dashboard','matview',      true,  'The canonical publication point.')
on conflict do nothing;

create or replace view v_metric_conformance as
with pound_views as (
  select c.relname as surface, c.relkind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
    and pg_get_viewdef(c.oid) ilike '%f_to_pounds%'
)
select p.surface,
       case p.relkind when 'm' then 'matview' else 'view' end as surface_kind,
       (u.metric_key is not null)                             as is_registered,
       coalesce(u.conforms, false)                            as uses_canonical_definition,
       u.metric_key,
       case
         when u.metric_key is null       then 'UNREGISTERED — defines pounds with no entry in the metric registry'
         when not coalesce(u.conforms,false) then 'REGISTERED BUT NOT CONFORMING — has its own copy of the definition'
         else 'CONFORMS'
       end as verdict
from pound_views p
left join metric_usage u on u.surface = p.surface
order by (u.metric_key is null) desc, p.surface;

comment on view v_metric_conformance is
 'Every relation that independently converts weight to pounds, and whether it is governed by the '
 'metric registry. 48 do it today. UNREGISTERED is the backlog, not a scandal - the point is that '
 'the number may fall and must never rise, which is what stops the 49th definition being written.';

insert into conversion_factors (key, value, unit, label, what_it_means, where_it_came_from, set_by, evidence_status, evidence_note)
values ('metric_unregistered_pound_definitions_ceiling', 48, 'count',
 'Ceiling on unregistered pound definitions',
 'How many relations may define pounds without being governed by metric_definition. A RATCHET: it '
 'may fall and must never rise. Every new unregistered definition is a new way for one quantity to '
 'have two values.',
 'Measured 11 Aug 2026: 48 relations use f_to_pounds. Set at today''s actual so the check starts '
 'green and can only tighten.', 'Agent I', 'measured',
 'Lower this figure as views are brought under the registry. Never raise it to make a check pass - '
 'that is the failure this whole layer exists to prevent.')
on conflict (key) do nothing;

insert into verification_checks (
  check_key, title, what_it_proves, source_a_label, source_a_sql, source_b_label, source_b_sql,
  tolerance_pct, severity, owner, enabled, added_on, measures_a_process)
values (
 'metric-no-new-pound-definitions',
 'No new ungoverned definition of a pound is added',
 'The pound is currently defined 48 times across the schema, which is why one quantity had three '
 'values tonight. This does not demand the 48 be fixed at once - that would be an unserious '
 'promise. It ratchets: the count may fall and must never rise. Every new unregistered definition '
 'is a new way for the same question to get a different answer. If this fires, the correct move '
 'is to register the new relation against an existing metric_definition, NOT to raise the ceiling.',
 'Relations defining pounds without registry governance',
 'select count(*)::numeric from v_metric_conformance where not is_registered',
 'The ratchet ceiling, which may fall and never rise',
 'select value from conversion_factors where key = ''metric_unregistered_pound_definitions_ceiling''',
 0, 'elevated', 'Agent I', true, date '2026-08-11', false)
on conflict (check_key) do update set
  title = excluded.title, what_it_proves = excluded.what_it_proves,
  source_a_sql = excluded.source_a_sql, source_b_sql = excluded.source_b_sql;;
