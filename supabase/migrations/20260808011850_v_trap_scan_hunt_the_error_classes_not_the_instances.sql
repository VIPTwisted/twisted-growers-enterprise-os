-- HUNT THE CLASS, NOT THE INSTANCE.
--
-- Every error made on 7 Aug 2026 - roughly twenty - falls into five patterns. Each
-- one produced a CONFIDENT, PLAUSIBLE, WRONG answer and none of them raised an
-- error. They were found by a person noticing, which does not scale and did not
-- work: the first six reached the owner before anyone checked.
--
-- This scans every view definition in the database for those patterns. It is static
-- analysis, so it finds them BEFORE the number is published rather than after it is
-- quoted. It cannot find a trap nobody has named yet - that limit is stated in the
-- view comment rather than hidden.
--
-- UNDO: drop view v_trap_scan;

create or replace view public.v_trap_scan as
with defs as (
  select c.relname as object_name, c.relkind,
         pg_get_viewdef(c.oid, true) as def
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')
)
-- 1. Weight-only reporting. Nulls every countable item, so a total silently drops
--    them. Hid 18,822 units across 143 packages.
select object_name, 'countable-items-dropped' as trap,
       'critical' as severity,
       'Converts to pounds under f_is_weight but never reports the count, so every '
       'countable item publishes as nothing and any total excludes it silently.' as what_is_wrong,
       'Add units and use f_quantity_text(qty, uom). Cross-check against v_countable_inventory.' as what_to_do
from defs
where def ~* 'f_is_weight' and def ~* 'f_to_pounds'
  and def !~* '(f_quantity_text|as units|unit_of_measure)'

union all
-- 2. Single-licence test on a field that can hold a list. 621 of our certificates
--    hold both licences as one string; f_is_ours returns false on every one.
select object_name, 'licence-list-vs-single-test', 'critical',
       'Applies f_is_ours() to a certificate licence field. That field can hold '
       '"MC281714, MP281909" and f_is_ours returns FALSE on a list - it matches '
       'neither member and never errors.',
       'Use f_any_ours() or f_all_ours(), or f_licence_in_set() for membership.'
from defs
where def ~ 'f_is_ours\s*\(\s*[a-z_.]*(client_license|cert_license)'

union all
-- 3. Substring matching on identifiers. Matches silently and answers a different
--    question than intended.
select object_name, 'substring-match-on-licence', 'elevated',
       'Uses position()/LIKE against a licence number. A substring test matches '
       'quietly - it will not error, it will answer a slightly different question.',
       'Use f_licence_in_set() for exact membership after splitting.'
from defs
where def ~* 'position\s*\(\s*[a-z_.]*licen' or def ~* 'licen[a-z_]*\s+like\s+''%'

union all
-- 4. Wet and dry summed together. Fresh frozen is wet weight; summing it with dried
--    flower overstated harvests by 3,800 lb.
select object_name, 'wet-and-dry-mixed', 'critical',
       'Touches fresh frozen and sums a weight without separating wet from dry. '
       'Fresh frozen is WET - 100.4 lb wet is about 22 lb dry.',
       'Split wet and dry, or state the basis in the column name.'
from defs
where def ~* 'fresh.?frozen' and def ~* 'sum\s*\(' and def !~* '(wet|dry)_'

union all
-- 5. reltuples used as a row count. It is an ESTIMATE and reads 0 on small tables;
--    five populated tables were called empty this way.
select object_name, 'estimate-used-as-count', 'critical',
       'Reads reltuples, which is a planner ESTIMATE and returns 0 on small or '
       'freshly written tables. Five populated tables were reported empty this way.',
       'Use select count(*).'
from defs
where def ~* 'reltuples'

union all
-- 6. A number published with no registered proof. The brain lied to every agent
--    twice in one day because nothing re-derived what it asserted.
select object_name, 'no-registered-proof', 'elevated',
       'This view carries what_is_wrong/what_to_do, so it publishes findings to '
       'people, but no brain_claims row re-derives any figure it produces.',
       'Register at least one claim in brain_claims with the query that proves it. '
       'A rule with no check expires.'
from defs
where def ~* 'what_is_wrong'
  and not exists (select 1 from brain_claims b where b.proof_sql ilike '%'||defs.object_name||'%');

comment on view public.v_trap_scan is
  'Static scan of every view for the error patterns that have actually cost money '
  'here. Each one produced a confident, plausible, WRONG answer and none raised an '
  'error. Empty is the good state. LIMIT, STATED PLAINLY: this finds only traps '
  'someone has already named - it cannot find a new class. Add a branch every time '
  'a new one is found.';;
