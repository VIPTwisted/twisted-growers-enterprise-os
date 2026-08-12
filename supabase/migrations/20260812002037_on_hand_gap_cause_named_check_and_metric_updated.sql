-- Agent I (Database COO), 12 Aug 2026. Filed for review as DBI-030 (reviewers V, X, W).
-- Implements Agent V's verification verdict on the 72.0 lb third-party on-hand disagreement.
--
-- THE CAUSE, NAMED AND PROVEN PER TAG. v_third_party_forensic collapses each tag to ONE package
-- row (DISTINCT ON tag, LastModified DESC) across BOTH licences. Seven tags currently live under
-- MC281714 and MP281909 at once - material moved cultivation to manufacturing - and on all seven
-- the MC residue row (0 g or scraps, freshest LastModified) wins, silently discarding the MP
-- active row that HOLDS the material. 91 of 98 tags tie at 0.00; the whole gap is those 7:
-- 75.3 lb clean, minus 3.28 lb of join fan-out the check itself added on side A = the observed
-- 72.0. Corroborated twice: quantity-column path 774.2 lb, raw-JSON IsFinished path 774.3.
--
-- BOTH DERIVATIONS ANSWER REAL QUESTIONS. The view answers "what is on this tag''s most recent
-- record" - right for lineage narrative. The licence-complete sum answers "what do we hold" -
-- right for inventory. A tag under two licences is legitimately TWO inventory records.
-- THE YEAR-END POSITION CARRIES THE LICENCE-COMPLETE FIGURE: 774.2 lb.
--
-- WHAT THIS MIGRATION DOES:
--   1. Check side A drops its join - the join added only fan-out (3.28 today inflating side A;
--      tomorrow it could manufacture FALSE AGREEMENT, which is worse).
--   2. metric_definition: canonical_sql becomes the licence-complete derivation; open_question
--      updated - the question is answered, what remains is repairing the view to match.
--   3. v_cross_license_tags: V''s prescribed assertion - every tag active under both licences,
--      because each one silently moves pounds between the per-tag and per-licence answers.
--   4. The check stays RED deliberately (699.0 vs 774.2) until the view repair lands - the view
--      still understates physical stock by ~75 lb and a red check is the truthful state.
--      The view repair is WO-002, filed separately: its lb_on_hand must become a per-tag sum of
--      current active/intransit rows, keeping DISTINCT ON only for identity fields.
--
-- UNDO: restore check SQL and metric row from migration third_party_on_hand_two_ways /
--       metric_registry_semantic_layer; drop view v_cross_license_tags.

update verification_checks set
  source_a_label = 'The view''s own on-hand pounds (no join - fan-out free)',
  source_a_sql   = 'select round(sum(lb_on_hand),1)::numeric from v_third_party_forensic',
  source_b_label = 'Licence-complete: every active/in-transit row for those tags, straight from package quantities',
  what_it_proves = 'The headline third-party inventory figure, derived twice. CAUSE OF THE STANDING DISAGREEMENT '
    || 'NAMED BY AGENT V, 12 Aug 2026: the view collapses each tag to its most-recently-modified row '
    || 'ACROSS LICENCES, and on 7 cross-licence tags the closed MC residue row wins over the MP row '
    || 'holding the material - the view understates physical stock by ~75 lb. Both sides answer real '
    || 'questions (per-tag narrative vs per-licence inventory); the YEAR-END POSITION carries the '
    || 'licence-complete figure. This check stays RED until the view''s lb_on_hand is repaired to sum '
    || 'current rows per tag (WO-002). Do NOT close it any other way; false agreement via join '
    || 'fan-out is the failure this version removed.'
where check_key = 'third-party-on-hand-two-ways';

update metric_definition set
  canonical_sql = 'select round(sum(f_to_pounds(p.quantity, p.uom)),1) from metrc_packages p where p.tag in (select tag from v_third_party_forensic) and p.source_state in (''active'',''intransit'') and not coalesce(p.finished,false)',
  population_rule = population_rule || ' LICENCE-COMPLETE (V verdict 12 Aug 2026): a tag active under two licences is two inventory records; sum per-licence rows, never one row per tag.',
  open_question = 'ANSWERED 12 Aug 2026 by Agent V: the 72 lb gap was the view collapsing cross-licence tags to one row (7 tags, 75.3 lb, minus 3.28 lb check fan-out). Canonical figure: 774.2 lb licence-complete. REMAINING WORK, not a question: repair v_third_party_forensic.lb_on_hand to sum current rows per tag (WO-002), then re-run the check; certify when green. Caveat before certifying: re-run after the next full MP281909 sync - a 14-hour sync asymmetry between licences is inside today.'
where metric_key = 'third_party_pounds_on_hand';

create or replace view public.v_cross_license_tags as
select p.tag,
       count(*)                                                as active_rows,
       array_agg(distinct p.license order by p.license)        as licenses,
       round(sum(f_to_pounds(p.quantity, p.uom)), 2)           as total_lb_across_licenses,
       max(p.raw->>'LastModified')                             as freshest_last_modified
from metrc_packages p
where p.source_state in ('active','intransit') and not coalesce(p.finished, false)
group by p.tag
having count(distinct p.license) > 1;

comment on view public.v_cross_license_tags is
 'Tags holding ACTIVE material under more than one of our licences at once - legitimate '
 '(cultivation to manufacturing moves) but each one silently moves pounds between the per-tag '
 'and per-licence answers to "how much do we hold". Agent V''s prescribed assertion, 12 Aug '
 '2026: 7 such tags carried the entire 72 lb on-hand disagreement. Any view that collapses '
 'tags to one row must exclude or split these; any check comparing per-tag to per-licence '
 'sums must declare them in its in_flight_rule.';;
