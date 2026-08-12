-- Agent I (Database COO), 11 Aug 2026. Filed for review as DBI-012 (reviewers V, X, W).
-- Owner approved the restatement. This enforces the owner's OWN ruling of 11 Aug 2026.
--
-- SECOND ATTEMPT. The first refused itself: the context-text anchor was found 0 times because I
-- mis-escaped the doubled quotes inside a dollar-quoted block. Nothing was applied - the DO block
-- is atomic and the earlier substitution had only touched a local variable. Re-anchored on a
-- substring containing no quotes at all, which is the robust way to do this.
--
-- THE ROOT CAUSE, NOT THE SYMPTOM. counterparty_role holds seven owner-set rows deciding which
-- counterparty legs count as sales and which as purchases. pg_depend returns ZERO dependent
-- objects: nothing has ever read it. The ruling was recorded and wired to nothing. Agent X found
-- this while challenging Agent S. Fixing the tile without fixing this leaves the next one to be
-- found by hand.
--
-- WHAT THE RULING SAYS. Eagle Eyes Transport Solutions is WAREHOUSE_3PL, counts_as_purchase =
-- false, active 2024-08-25 to 2025-02-19. Owner: "they warehoused our material for us; we then
-- brought it back in house... NEITHER leg is a sale or a purchase."
--
-- MEASURED BEFORE AND AFTER on the tile's own population:
--     before  660 lines  1,276,288 USD
--     after   483 lines    901,941 USD      (177 Eagle Eyes lines, 374,346 USD, removed)
-- Agent X independently derived 901,941 for the same restriction. Two derivations agree.
--
-- WHY 901,941 AND NOT 838,953. Agent X recommended 838,953 - the tile restricted to tags present
-- in v_third_party_forensic. I am not going that far today:
--   89,501 USD sits on 142 lines whose tags are absent from metrc_packages. X's own words:
--     "ownership untestable". Untestable is not disproven. They are inbound from outside licences
--     and may be genuine purchases; excluding them would UNDERSTATE spend - the same error in the
--     opposite direction.
--   62,989 USD across 191 tags is bucket 3, where ItemFromFacilityLicenseNumber reads as ours on
--     outside material. X's own finding: "needs COA adjudication, not a query."
-- Removing money because we cannot test it would be choosing the answer that flatters the
-- restatement. 901,941 is what the evidence supports today; 838,953 is the FLOOR if every
-- untestable line turns out not to be a purchase. Both now appear in the tile context so nobody
-- has to remember this paragraph.
--
-- NOT FIXED HERE. The mirror-image error - 890.5 lb booked as sales to Eagle Eyes in
-- v_forensic_sold_by_tag - needs the owner's net-518.0 lb ruling applied (gross legs are storage,
-- the net IS a sale). Different view, different shape. Doing both at once would make neither
-- reviewable.
--
-- NO DROP, NO CASCADE. Rule E1 blocked me earlier tonight for good reason.
--
-- UNDO: re-run with the two substitutions swapped, then refresh mv_dept_dash_third_party.

do $do$
declare v_def text; v_old text; v_new text; v_old2 text; v_new2 text; v_hits int;
begin
  v_def := pg_get_viewdef('public.v_dept_dash_third_party'::regclass);

  -- 1. bind counterparty_role to the purchase population
  v_old := 'AND (COALESCE((t.source_row ->> ''Voided''::text), ''False''::text) <> ''True''::text))
        )';
  v_new := 'AND (COALESCE((t.source_row ->> ''Voided''::text), ''False''::text) <> ''True''::text)
            AND NOT EXISTS (
                  SELECT 1 FROM counterparty_role cr
                   WHERE cr.counts_as_purchase = false
                     AND cr.facility_name = (t.source_row ->> ''Origin Facility''::text)))
        )';

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'Refusing to rebuild: paid-CTE anchor found % times, expected 1.', v_hits;
  end if;
  v_def := replace(v_def, v_old, v_new);

  -- 2. stop the tile claiming a declared transfer price is cash paid.
  --    Anchor deliberately contains NO quote characters.
  v_old2 := ' own Receiver Wholesale Price — what we actually paid, not an estimate.';
  v_new2 := ' own Receiver Wholesale Price — a DECLARED transfer price, not proof of cash paid. '
         || 'Excludes 3PL custody movements per counterparty_role. Floor if every untestable line '
         || 'is excluded too: 838,953 USD.';

  v_hits := (length(v_def) - length(replace(v_def, v_old2, ''))) / length(v_old2);
  if v_hits <> 1 then
    raise exception 'Refusing to rebuild: context-text anchor found % times, expected 1.', v_hits;
  end if;
  v_def := replace(v_def, v_old2, v_new2);

  execute 'create or replace view public.v_dept_dash_third_party as ' || v_def;
end
$do$;

refresh materialized view public.mv_dept_dash_third_party;

comment on view public.v_dept_dash_third_party is
 'Third-party tiles for Command. READS counterparty_role - a counterparty whose '
 'counts_as_purchase is false (3PL warehousing, tolling) is excluded from spend, because custody '
 'moving is not material bought. Before this binding the tile carried 374,346 USD of our own '
 'material returning from an Eagle Eyes warehouse as though we had purchased it.';;
