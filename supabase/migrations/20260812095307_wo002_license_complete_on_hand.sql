-- Agent I (Database COO), 12 Aug 2026. WO-002 applied — DBI-041 (reviewers V, X, W).
--
-- THE 72 LB, CLOSED. Agent V proved the cause tag by tag (report 11 Aug): v_third_party_forensic
-- collapses each tag to its most-recently-modified package row across BOTH licences; on the 7
-- cross-licence tags the freshest row is the finished/residue MC281714 side, so the ACTIVE
-- MP281909 rows holding 75.3 lb were silently dropped. Two genuinely independent derivations
-- (quantity+source_state, and the doc's own raw-JSON IsFinished path) agree at 774.2/774.3;
-- the view alone said 699.0.
--
-- FIX, per V's prescription: lb_on_hand becomes the LICENSE-COMPLETE sum of current material on
-- the tag - every active or in-transit, unfinished package row, both licences - replacing the
-- single-row read. The DISTINCT ON row still supplies identity/lineage fields (correct for the
-- narrative); only the QUANTITY question changes source. In-transit counts as ours by owner
-- ruling. Anchored substitution with uniqueness guard; no drop, no cascade.
--
-- ALSO per V: the check's side A drops its fan-out join (it double-counted tag #5 by 3.28 lb -
-- a fan-out that inflates today could manufacture false agreement tomorrow).
--
-- KNOWN FOLLOW-UP, deliberately out of scope: the status column is misled by the same row-pick
-- (5 of the 7 read PROCESSED INTO PRODUCT while material remains at MP). Filed, not smuggled.
--
-- UNDO: re-run substitution with old/new swapped; restore check source_a_sql from
--       third_party_on_hand_two_ways.

do $do$
declare v_def text; v_old text; v_new text; v_hits int;
begin
  v_def := pg_get_viewdef('public.v_third_party_forensic'::regclass);

  v_old := 'round(f_to_pounds(COALESCE(((pk.raw ->> ''Quantity''::text))::numeric, (0)::numeric), COALESCE(NULLIF((pk.raw ->> ''UnitOfMeasureName''::text), ''''::text), ''Grams''::text)), 3) AS lb_on_hand';
  v_new := 'round((SELECT COALESCE(sum(f_to_pounds(cp.quantity, cp.uom)), (0)::numeric) FROM metrc_packages cp WHERE cp.tag = pk.tag AND cp.source_state = ANY (ARRAY[''active''::text, ''intransit''::text]) AND NOT COALESCE(cp.finished, false)), 3) AS lb_on_hand';

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'Refusing: lb_on_hand anchor found % times, expected 1. Re-read and re-anchor.', v_hits;
  end if;

  execute 'create or replace view public.v_third_party_forensic as ' || replace(v_def, v_old, v_new);
end
$do$;

comment on view public.v_third_party_forensic is
 'The third-party forensic ledger, one row per tag. lb_on_hand is LICENSE-COMPLETE as of 12 Aug '
 '2026: the sum of every active/in-transit unfinished package row on the tag across BOTH '
 'licences - the DISTINCT ON row supplies identity and lineage only. Before this, 7 cross-'
 'licence tags reported the finished MC residue row and silently dropped 75.3 lb active at '
 'MP281909 (Agent V, tag-by-tag proof). In-transit is ours until the destination accepts - '
 'owner ruling. The status column still reads from the picked row and can lag cross-licence '
 'moves; filed as follow-up.';

update verification_checks set
  source_a_sql = 'select round(sum(lb_on_hand),1)::numeric from v_third_party_forensic',
  source_a_label = 'The view''s own on-hand pounds (no join - fan-out inflated side A by 3.28 lb)',
  what_it_proves = 'The headline third-party inventory figure, derived twice: the view''s license-complete '
 || 'lb_on_hand against Metrc''s raw quantities for the same population. Cause of the original 72 lb '
 || 'disagreement was found tag-by-tag by Agent V (cross-licence tags dropping the MP side) and fixed '
 || '12 Aug 2026. If this fires again: a new cross-licence pattern or a sync-freshness asymmetry '
 || 'between licences - check per-licence sync ages before anything else. Never widen the tolerance.'
where check_key = 'third-party-on-hand-two-ways';;
