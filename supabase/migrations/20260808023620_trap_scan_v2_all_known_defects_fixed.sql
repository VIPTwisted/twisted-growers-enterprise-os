-- OWNER RULE, 8 Aug 2026: "ALWAYS FIX SCANNER WHEN WRONG."
--
-- v1 was wrong SIX ways, all found in one night - three by working agents, two by
-- the Inspector, one by me. A detector that misreports is worse than none, because
-- a clean scan reads as a clean system.
--
--  1 SELF-FLAGGING - matched its own text for 'reltuples' and 'what_is_wrong'.
--  2 NAME NOT BEHAVIOUR - required the literal 'as units'; v_room_contents publishes
--    'packaged_units' correctly and was flagged anyway.
--  3 FALSE NEGATIVE ON THE ONLY LIVE CASE - the substring-match regex could not match
--    POSITION((k.platform_license) IN (c.cert_license)) because a BRACKET sat where a
--    column name was expected. The detector written for this class missed it.
--  4 CLEARING TEST BACKWARDS - cleared when the view's NAME appeared in proof_sql, so
--    a comment '-- covers v_issue_late' cleared it while a CORRECT base-table proof,
--    which never names the view, did not. It rewarded exactly the wrong behaviour.
--  5 WORD-MATCHING ON WET/DRY - both flagged views were FALSE POSITIVES.
--    v_production_forecast separates fresh frozen (892.1 + 3,162.7 = 4,054.9) and
--    v_stock_on_hand groups by stream.
--  6 FUNCTIONS NEVER SCANNED - f_material_origin and friends were invisible to every
--    scan on this platform.
--
-- FIVE CLASSES ADDED, all named by the Inspector as missing:
--   ordering-decides-evidence, transporter-in-revenue, truncated-tag,
--   count-star-on-aggregate, repack-as-primary.
--
-- Columns are APPENDED (kind last) - CREATE OR REPLACE cannot reorder or rename.
-- UNDO: v1 definition is in v_trap_scan_hunt_the_error_classes_not_the_instances.

alter table brain_claims add column if not exists covers_object text;
comment on column brain_claims.covers_object is
  'The view or function this claim proves. Set EXPLICITLY - v1 inferred it by '
  'looking for the object name inside proof_sql, which rewarded a comment and '
  'penalised a correct base-table proof.';

update brain_claims set covers_object='v_ownership_verdict'   where claim_key='ownership.confirmed_not_ours' and covers_object is null;
update brain_claims set covers_object='v_certificate_gap'     where claim_key='coa.gap' and covers_object is null;
update brain_claims set covers_object='v_countable_inventory' where claim_key like 'countable.%' and covers_object is null;
update brain_claims set covers_object='v_never_tested_proof'  where claim_key='nevertested.contradictions' and covers_object is null;

create or replace view public.v_trap_scan as
with objs as (
  select c.relname as object_name, pg_get_viewdef(c.oid, true) as def, 'view'::text as kind
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname='public' and c.relkind in ('v','m') and c.relname <> 'v_trap_scan'
  union all
  select p.proname, p.prosrc, 'function'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.prokind='f'
    and p.proname not in ('f_quantity_text','f_any_ours','f_all_ours','f_licence_in_set')
)
select object_name, 'countable-items-dropped' as trap, 'critical' as severity,
       'Converts to pounds under f_is_weight but never reports the count, so every countable item publishes as nothing and any total excludes it silently.' as what_is_wrong,
       'Add a units column and use f_quantity_text(qty, uom). Cross-check v_countable_inventory.' as what_to_do,
       kind
from objs where def ~* 'f_is_weight' and def ~* 'f_to_pounds'
  and def !~* '(f_quantity_text|as +[a-z_]*units|unit_of_measure)'
union all
select object_name, 'licence-list-vs-single-test', 'critical',
       'Applies f_is_ours() to a certificate licence field. That field can hold "MC281714, MP281909" and f_is_ours returns FALSE on a list - it matches neither member and never errors. 621 of 983 certificates are stored that way.',
       'Use f_any_ours() / f_all_ours(), or f_licence_in_set() for membership.', kind
from objs where def ~ 'f_is_ours\s*\(\s*[a-z_.]*(client_license|cert_license)'
union all
select object_name, 'substring-match-on-licence', 'elevated',
       'Uses position()/LIKE against a licence number. A substring test matches quietly - it will not error, it will answer a slightly different question.',
       'Use f_licence_in_set() for exact membership after splitting on commas.', kind
from objs where def ~* 'position\s*\(\s*[("'']*\s*[a-z_.]*licen'
             or def ~* 'licen[a-z_]*\s+i?like\s+''%'
union all
select object_name, 'wet-and-dry-mixed', 'critical',
       'Sums a weight in an object that touches fresh frozen with NO stream, basis or wet/dry separation anywhere in it. Fresh frozen is WET: 603.9 lb wet is 134.2 lb dry-equivalent at the configured 4.5.',
       'Separate the basis, or divide fresh frozen by f_rule(''fresh_frozen_wet_to_dry''). Name the column so the basis cannot be lost.', kind
from objs where def ~* 'fresh.?frozen' and def ~* 'sum\s*\('
  and def !~* '(wet|dry|_equiv|stream|basis|fresh_frozen_lbs|fresh_frozen_wet_to_dry)'
union all
select object_name, 'estimate-used-as-count', 'critical',
       'Reads reltuples, a planner ESTIMATE that returns 0 on small or freshly written tables. Five populated tables were reported empty this way.',
       'Use select count(*).', kind
from objs where def ~* 'reltuples'
union all
select object_name, 'ordering-decides-evidence', 'critical',
       'Uses row_number()/distinct on to pick ONE row from conflicting sources. If those rows disagree on substance the ORDER BY is making the judgement, not the evidence, and it will never say so. On 7 Aug an ordering decided 142 of 191 ownership verdicts - reversing one word moved the answer from 19 packages to 156.',
       'State the reason in the object, and surface the disagreement in a companion view rather than resolving it silently. Disagreement is the finding.', kind
from objs where (def ~* 'row_number\s*\(\s*\)\s*over' or def ~* 'distinct\s+on')
  and def ~* '(cert|origin|licen|owner|depth|priority)'
union all
select object_name, 'transporter-in-revenue', 'critical',
       'Computes revenue or a price without excluding transporter/storage destinations. An MT or MX licence destination is NEVER a sale - material goes to storage and comes back. $901,430 was booked as revenue this way.',
       'Exclude MT/MX destinations, and label every Metrc-derived price a DECLARED transfer price - Apex is the sales source of record.', kind
from objs where def ~* '(revenue|sale_price|realised|realized|price_per|total_price)'
  and def ~* 'sum\s*\(' and def !~* '(MT[0-9]|MX[0-9]|transporter|destination_kind)'
union all
select object_name, 'truncated-tag', 'elevated',
       'Joins or stores a Metrc tag without requiring the full 24 characters. Truncated tags have already collided - "3136" matches one of OUR packages and an outside one.',
       'Resolve full 24-character tags before any join, and reject an ambiguous match rather than storing it.', kind
from objs where def ~* '(right|substr|substring)\s*\(\s*[a-z_.]*(tag|label)'
union all
select object_name, 'count-star-on-aggregate', 'elevated',
       'Uses count(*) against a view that is already aggregated, which returns the number of GROUPS, not the number of packages.',
       'Use sum(packages), or count the base rows.', kind
from objs where def ~* 'count\s*\(\s*\*\s*\)'
  and def ~* 'from\s+v_[a-z_]*(summary|by_|totals|position)'
union all
select object_name, 'repack-as-primary', 'elevated',
       'Counts production or yield without excluding repackaged material. A repack keeps the original harvest name; counting it inflates production by up to 142%.',
       'Primary production is SourcePackageCount = 0. Filter on it explicitly.', kind
from objs where def ~* '(production|yield|harvested|packaged_lb)' and def ~* 'sum\s*\('
  and def ~* 'sourceharvestnames' and def !~* 'sourcepackagecount'
union all
select o.object_name, 'no-registered-proof', 'elevated',
       'Publishes findings to people but no brain_claims row names it in covers_object with a proof that reaches the figure independently. A rule with no check expires.',
       'Register a claim with covers_object set to this object and a proof_sql that derives the number from BASE TABLES. A proof that selects from the view it checks cannot fail and proves nothing.', o.kind
from objs o where o.def ~* 'what_is_wrong' and o.kind='view'
  and not exists (select 1 from brain_claims b
                   where b.covers_object = o.object_name
                     and b.proof_sql !~* ('from\s+' || o.object_name));

comment on view public.v_trap_scan is
  'Static scan of every view AND FUNCTION for the error classes that have actually '
  'cost money here. Ten classes. Empty is the good state. Rebuilt 8 Aug 2026 after '
  'six defects in one night. STATED LIMIT: it finds only classes someone has named - '
  'add a branch every time a new one appears. Owner rule: always fix the scanner '
  'when it is wrong.';;
